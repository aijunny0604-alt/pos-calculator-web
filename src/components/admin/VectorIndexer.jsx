// 🧠 벡터 인덱서 — Admin 페이지용
// 제품/거래처를 Gemini Embedding으로 변환 → Supabase pgvector 저장
// 1회 클릭 → 전체 자동 인덱싱 (분당 1500 RPM 안전 마진)

import { useState, useEffect } from 'react';
import { Brain, RefreshCw, Database, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { embedText } from '@/lib/embedding';
import { buildProductEmbeddingText, buildCustomerEmbeddingText } from '@/lib/productMatch';

export default function VectorIndexer() {
  const [status, setStatus] = useState('idle'); // idle/indexing/done/error
  const [progress, setProgress] = useState({ current: 0, total: 0, type: '' });
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  // 인덱싱 안 된 제품/거래처 수 조회
  const checkStats = async () => {
    try {
      const [productsNoEmbed, customersNoEmbed, allProducts, allCustomers] = await Promise.all([
        supabase.getProductsWithoutEmbedding(),
        supabase.getCustomersWithoutEmbedding(),
        supabase.getProducts(),
        supabase.getCustomers(),
      ]);
      setStats({
        productsTotal: allProducts?.length || 0,
        productsNoEmbed: productsNoEmbed?.length || 0,
        customersTotal: allCustomers?.length || 0,
        customersNoEmbed: customersNoEmbed?.length || 0,
      });
    } catch (e) {
      console.error('checkStats:', e);
      setError(e?.message || '조회 실패');
    }
  };

  useEffect(() => { checkStats(); }, []);

  const indexAll = async () => {
    setStatus('indexing');
    setError(null);
    try {
      // ─── 1) 제품 인덱싱 ───
      const products = await supabase.getProductsWithoutEmbedding();
      setProgress({ current: 0, total: products.length, type: '제품' });
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        const text = buildProductEmbeddingText(p);
        try {
          const vec = await embedText(text);
          if (vec) await supabase.updateProductEmbedding(p.id, vec);
        } catch (e) {
          console.warn(`제품 [${p.id}] "${p.name}" 임베딩 실패:`, e?.message);
        }
        setProgress({ current: i + 1, total: products.length, type: '제품' });
        // 분당 1500 = 약 40ms/req, 안전 마진 70ms
        if (i < products.length - 1) await new Promise((r) => setTimeout(r, 70));
      }

      // ─── 2) 거래처 인덱싱 ───
      const customers = await supabase.getCustomersWithoutEmbedding();
      setProgress({ current: 0, total: customers.length, type: '거래처' });
      for (let i = 0; i < customers.length; i++) {
        const c = customers[i];
        const text = buildCustomerEmbeddingText(c);
        try {
          const vec = await embedText(text);
          if (vec) await supabase.updateCustomerEmbedding(c.id, vec);
        } catch (e) {
          console.warn(`거래처 [${c.id}] "${c.name}" 임베딩 실패:`, e?.message);
        }
        setProgress({ current: i + 1, total: customers.length, type: '거래처' });
        if (i < customers.length - 1) await new Promise((r) => setTimeout(r, 70));
      }

      setStatus('done');
      await checkStats();
    } catch (e) {
      console.error('indexAll:', e);
      setError(e?.message || '인덱싱 실패');
      setStatus('error');
    }
  };

  const reindexAll = async () => {
    if (!window.confirm('이미 인덱싱된 항목도 전부 다시 인덱싱합니다. 계속할까요?')) return;
    setStatus('indexing');
    setError(null);
    try {
      const allProducts = (await supabase.getProducts()) || [];
      const allCustomers = (await supabase.getCustomers()) || [];

      setProgress({ current: 0, total: allProducts.length, type: '제품 (전체 재)' });
      for (let i = 0; i < allProducts.length; i++) {
        const p = allProducts[i];
        const text = buildProductEmbeddingText(p);
        try {
          const vec = await embedText(text);
          if (vec) await supabase.updateProductEmbedding(p.id, vec);
        } catch (e) {
          console.warn(`제품 [${p.id}]:`, e?.message);
        }
        setProgress({ current: i + 1, total: allProducts.length, type: '제품 (전체 재)' });
        if (i < allProducts.length - 1) await new Promise((r) => setTimeout(r, 70));
      }

      setProgress({ current: 0, total: allCustomers.length, type: '거래처 (전체 재)' });
      for (let i = 0; i < allCustomers.length; i++) {
        const c = allCustomers[i];
        const text = buildCustomerEmbeddingText(c);
        try {
          const vec = await embedText(text);
          if (vec) await supabase.updateCustomerEmbedding(c.id, vec);
        } catch (e) {
          console.warn(`거래처 [${c.id}]:`, e?.message);
        }
        setProgress({ current: i + 1, total: allCustomers.length, type: '거래처 (전체 재)' });
        if (i < allCustomers.length - 1) await new Promise((r) => setTimeout(r, 70));
      }

      setStatus('done');
      await checkStats();
    } catch (e) {
      console.error('reindexAll:', e);
      setError(e?.message || '재인덱싱 실패');
      setStatus('error');
    }
  };

  const isIndexing = status === 'indexing';
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const estimatedMinutes = stats ? Math.ceil((stats.productsNoEmbed + stats.customersNoEmbed) * 0.07 / 60) : 0;

  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Brain className="w-5 h-5 text-cyan-500" />
        <h3 className="text-lg font-bold">🧠 AI 의미 검색 인덱싱 (pgvector)</h3>
      </div>

      <div className="text-sm text-[var(--muted-foreground)] leading-relaxed">
        제품/거래처를 Gemini 임베딩으로 변환해 Supabase에 저장합니다.
        <br />
        <strong className="text-[var(--foreground)]">의미 기반 매칭</strong>이라 학습 안 한 신규 표현도 자동 인식
        (예: "스테벤딩 38-45" → "스덴 밴딩 파이프 38-45").
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-2">
          <div className="border border-[var(--border)] rounded-lg p-3 text-sm">
            <div className="text-[var(--muted-foreground)] text-xs">제품</div>
            <div className="font-bold tabular-nums">
              인덱싱 안 됨 <span className="text-[var(--destructive)]">{stats.productsNoEmbed}</span> / {stats.productsTotal}
            </div>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-3 text-sm">
            <div className="text-[var(--muted-foreground)] text-xs">거래처</div>
            <div className="font-bold tabular-nums">
              인덱싱 안 됨 <span className="text-[var(--destructive)]">{stats.customersNoEmbed}</span> / {stats.customersTotal}
            </div>
          </div>
        </div>
      )}

      {!isIndexing && stats && (stats.productsNoEmbed + stats.customersNoEmbed) > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">인덱싱 필요: {stats.productsNoEmbed + stats.customersNoEmbed}건</div>
            <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
              예상 소요: 약 {estimatedMinutes}분 (분당 약 850건, Gemini 1500 RPM 안전 마진)
            </div>
          </div>
        </div>
      )}

      {isIndexing && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin text-cyan-500" />
            <span><strong>{progress.type}</strong> 인덱싱 중... {progress.current} / {progress.total}</span>
          </div>
          <div className="w-full bg-[var(--secondary)] rounded-full h-2 overflow-hidden">
            <div className="bg-gradient-to-r from-cyan-500 to-purple-500 h-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-[var(--muted-foreground)] text-right tabular-nums">{pct}%</div>
        </div>
      )}

      {status === 'done' && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <span>인덱싱 완료! 이제 의미 기반 매칭이 활성화됩니다.</span>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span>오류: {error}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={indexAll}
          disabled={isIndexing || !stats || (stats.productsNoEmbed + stats.customersNoEmbed) === 0}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-4 h-4" />
          {isIndexing ? '인덱싱 중...' : '신규 항목 인덱싱'}
        </button>
        <button
          onClick={reindexAll}
          disabled={isIndexing}
          className="px-4 py-2.5 rounded-lg border border-[var(--border)] hover:bg-[var(--accent)] text-sm disabled:opacity-40"
          title="이미 인덱싱된 것도 다시 (이름 변경 등 반영)"
        >
          <Database className="w-4 h-4 inline" />
        </button>
      </div>

      <details className="text-xs text-[var(--muted-foreground)]">
        <summary className="cursor-pointer">📚 Supabase 설정 가이드 (최초 1회)</summary>
        <div className="mt-2 space-y-1.5 pl-4">
          <div>1. Supabase Dashboard → SQL Editor</div>
          <div>2. <code className="bg-[var(--secondary)] px-1 rounded">supabase/migrations/20260522_pgvector_products.sql</code> 전체 붙여넣기</div>
          <div>3. Run 클릭 (pgvector 활성화 + 컬럼 추가 + 검색 함수 생성)</div>
          <div>4. 이 페이지로 돌아와 "신규 항목 인덱싱" 클릭</div>
        </div>
      </details>
    </div>
  );
}
