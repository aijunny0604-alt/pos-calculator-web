import { useState, useEffect, useMemo, useCallback } from 'react';
import { Tags, Search, ArrowLeft, Database, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight, FileText, Copy, Check, FileDown } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { downloadCSV, copyText } from '@/lib/purchaseExport';

// 매입 단가표 — 매입처 견적서(발주서)에서 뽑은 규격별 단가 이력.
// 출처가 실제 견적서라 증빙 추적이 되고(quote_no), 단가가 언제 얼마나 올랐는지 근거가 남는다.
// 데이터 적재: naver-sync-bridge/migrations/009_supplier_prices.sql (발주서 21장 판독분)

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const pct = (from, to) => (from > 0 ? ((to - from) / from) * 100 : 0);

// 규격별로 이력을 묶고 최신단가·최초단가·변동률 산출
function groupBySpec(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = `${r.supplier_name}|${r.spec}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  const out = [];
  for (const [key, list] of map) {
    // quoted_at 내림차순 (최신이 앞)
    const hist = [...list].sort((a, b) => String(b.quoted_at).localeCompare(String(a.quoted_at)));
    const latest = hist[0];
    const first = hist[hist.length - 1];
    out.push({
      key,
      supplier: latest.supplier_name,
      spec: latest.spec,
      name: latest.item_name,
      price: num(latest.unit_price),
      quotedAt: latest.quoted_at,
      quoteNo: latest.quote_no,
      firstPrice: num(first.unit_price),
      firstAt: first.quoted_at,
      changed: hist.length > 1 && new Set(hist.map((h) => num(h.unit_price))).size > 1,
      delta: pct(num(first.unit_price), num(latest.unit_price)),
      hist,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.spec.localeCompare(b.spec));
}

function DeltaBadge({ delta }) {
  if (Math.abs(delta) < 0.05) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-bold" style={{ color: 'var(--muted-foreground)' }}>
        <Minus className="w-3 h-3" /> 변동없음
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-black" style={{ color: up ? 'var(--destructive)' : 'var(--success)' }}>
      {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      {up ? '+' : ''}{delta.toFixed(1)}%
    </span>
  );
}

export default function SupplierPrices({ showToast, setCurrentPage }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [q, setQ] = useState('');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await supabase.getSupplierPrices();
    if (r === null) { setLoadFailed(true); setRows([]); }
    else { setLoadFailed(false); setRows(r); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => groupBySpec(rows), [rows]);

  const filtered = useMemo(() => {
    let list = groups;
    if (onlyChanged) list = list.filter((g) => g.changed);
    const ql = q.trim().toLowerCase();
    if (ql) list = list.filter((g) => `${g.name} ${g.spec} ${g.supplier}`.toLowerCase().includes(ql));
    return list;
  }, [groups, onlyChanged, q]);

  const summary = useMemo(() => {
    const changed = groups.filter((g) => g.changed);
    const ups = changed.filter((g) => g.delta > 0);
    const avgUp = ups.length ? ups.reduce((s, g) => s + g.delta, 0) / ups.length : 0;
    return {
      specs: groups.length,
      quotes: new Set(rows.map((r) => r.quote_no).filter(Boolean)).size,
      changed: changed.length,
      avgUp,
    };
  }, [groups, rows]);

  const toggle = (key) => setExpanded((prev) => {
    const n = new Set(prev);
    n.has(key) ? n.delete(key) : n.add(key);
    return n;
  });

  const onCSV = () => {
    if (!filtered.length) { showToast?.('내보낼 단가가 없습니다', 'error'); return; }
    const head = ['매입처', '품목명', '규격명', '최신단가', '적용일', '견적서번호', '최초단가', '최초일', '변동률(%)'];
    const body = filtered.map((g) => [
      g.supplier, g.name, g.spec, g.price, g.quotedAt, g.quoteNo || '',
      g.firstPrice, g.firstAt, g.changed ? g.delta.toFixed(1) : '0',
    ]);
    const csv = '﻿' + [head, ...body]
      .map((r) => r.map((v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''))).join(','))
      .join('\r\n');
    downloadCSV(csv, `매입단가표_${new Date().toISOString().slice(0, 10)}.csv`);
    showToast?.('단가표 CSV를 저장했습니다', 'success');
  };

  // 인상된 품목만 카톡으로 — JSR에 "이거 왜 올랐냐" 물어볼 때 그대로 붙여넣기
  const onCopyChanged = async () => {
    const ups = filtered.filter((g) => g.changed && g.delta > 0);
    if (!ups.length) { showToast?.('인상된 품목이 없습니다', 'error'); return; }
    const lines = ['[단가 인상 내역]', ''];
    for (const g of ups) {
      lines.push(`· ${g.name} / ${g.spec}`);
      lines.push(`  ${g.firstAt} ₩${formatPrice(g.firstPrice)} → ${g.quotedAt} ₩${formatPrice(g.price)} (+${g.delta.toFixed(1)}%)`);
    }
    const ok = await copyText(lines.join('\n'));
    if (!ok) { showToast?.('복사 실패', 'error'); return; }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
    showToast?.('단가 인상 내역을 복사했습니다 📋', 'success');
  };

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setCurrentPage?.('dashboard')} className="p-2 -ml-2 rounded-lg hover:bg-[var(--accent)] md:hidden" style={{ color: 'var(--muted-foreground)' }}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Tags className="w-6 h-6" style={{ color: 'var(--primary)' }} />
          <h1 className="text-xl sm:text-2xl font-black" style={{ color: 'var(--foreground)' }}>매입 단가표</h1>
        </div>

        {/* 요약 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {[
            { label: '등록 규격', value: `${summary.specs}종` },
            { label: '출처 발주서', value: `${summary.quotes}장` },
            { label: '단가 변동', value: `${summary.changed}종`, alert: summary.changed > 0 },
            { label: '평균 인상률', value: summary.avgUp ? `+${summary.avgUp.toFixed(1)}%` : '-', alert: summary.avgUp > 0 },
          ].map((c) => (
            <div key={c.label} className="px-3 py-2 rounded-xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <div className="text-[11px] font-bold" style={{ color: 'var(--muted-foreground)' }}>{c.label}</div>
              <div className="text-lg font-black" style={{ color: c.alert ? 'var(--destructive)' : 'var(--foreground)' }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* 필터 + 검색 */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <button
            onClick={() => setOnlyChanged((v) => !v)}
            className="px-3.5 py-2 rounded-xl text-sm font-bold border transition-all"
            style={onlyChanged
              ? { background: 'var(--destructive)', color: 'white', borderColor: 'var(--destructive)' }
              : { background: 'var(--card)', color: 'var(--muted-foreground)', borderColor: 'var(--border)' }}
          >
            단가 바뀐 것만 {summary.changed}
          </button>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="품목명, 규격명 검색..."
              className="w-full pl-9 pr-3 py-2 rounded-xl text-sm border outline-none"
              style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onCopyChanged}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border transition-all hover:brightness-95"
            style={copied ? { background: 'var(--success)', color: '#fff', borderColor: 'var(--success)' } : { background: '#FEE500', color: '#3C1E1E', borderColor: '#FEE500' }}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? '복사됨!' : '인상내역 카톡복사'}
          </button>
          <button onClick={onCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border"
            style={{ background: 'var(--card)', color: 'var(--foreground)', borderColor: 'var(--border)' }}>
            <FileDown className="w-4 h-4" /> CSV
          </button>
          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{filtered.length}종 표시 중</span>
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {loadFailed && (
          <div className="mb-4 p-4 rounded-xl border flex items-start gap-3" style={{ background: 'var(--card)', borderColor: 'var(--destructive)' }}>
            <Database className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--destructive)' }} />
            <div className="text-sm" style={{ color: 'var(--foreground)' }}>
              <div className="font-bold mb-1">단가표 테이블을 찾을 수 없습니다</div>
              <div style={{ color: 'var(--muted-foreground)' }}>
                Supabase 대시보드 &gt; SQL Editor 에서 <b>migrations/009_supplier_prices.sql</b> 을 실행해주세요.
                (실행하면 발주서 21장에서 뽑은 단가 이력이 함께 들어옵니다)
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {q || onlyChanged ? '조건에 맞는 단가가 없습니다' : '등록된 단가가 없습니다'}
          </div>
        ) : (
          <div className="rounded-xl border overflow-x-auto" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <table className="w-full text-sm" style={{ minWidth: 820 }}>
              <thead>
                <tr style={{ background: 'var(--muted)' }}>
                  {['', '품목명', '규격명', '최신단가', '적용일', '변동', '출처 발주서', '매입처'].map((h, i) => (
                    <th key={i} className="px-3 py-2.5 text-left text-xs font-bold whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => {
                  const open = expanded.has(g.key);
                  return [
                    <tr key={g.key} className="border-t hover:bg-[var(--accent)] cursor-pointer" style={{ borderColor: 'var(--border)' }} onClick={() => g.hist.length > 1 && toggle(g.key)}>
                      <td className="px-3 py-2.5" style={{ color: 'var(--muted-foreground)' }}>
                        {g.hist.length > 1 ? (open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : null}
                      </td>
                      <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--foreground)' }}>{g.name}</td>
                      <td className="px-3 py-2.5 font-mono text-xs" style={{ color: 'var(--muted-foreground)' }}>{g.spec}</td>
                      <td className="px-3 py-2.5 text-lg font-black tabular-nums whitespace-nowrap" style={{ color: 'var(--foreground)' }}>₩{formatPrice(g.price)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>{g.quotedAt}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{g.changed ? <DeltaBadge delta={g.delta} /> : <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>—</span>}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1 text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>
                          <FileText className="w-3.5 h-3.5" /> {g.quoteNo || '-'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-bold" style={{ color: 'var(--muted-foreground)' }}>{g.supplier}</td>
                    </tr>,
                    open && (
                      <tr key={g.key + '-hist'} style={{ background: 'var(--muted)' }}>
                        <td />
                        <td colSpan={7} className="px-3 py-3">
                          <div className="text-xs font-bold mb-2" style={{ color: 'var(--muted-foreground)' }}>단가 이력 (최신순)</div>
                          <div className="space-y-1">
                            {g.hist.map((h, i) => {
                              const prev = g.hist[i + 1];
                              const d = prev ? pct(num(prev.unit_price), num(h.unit_price)) : 0;
                              return (
                                <div key={h.id} className="flex items-center gap-3 text-sm">
                                  <span className="w-24 tabular-nums" style={{ color: 'var(--muted-foreground)' }}>{h.quoted_at}</span>
                                  <span className="w-28 text-right font-black tabular-nums" style={{ color: 'var(--foreground)' }}>₩{formatPrice(h.unit_price)}</span>
                                  <span className="w-24">{prev && Math.abs(d) >= 0.05 ? <DeltaBadge delta={d} /> : null}</span>
                                  <span className="font-mono text-xs" style={{ color: 'var(--muted-foreground)' }}>{h.quote_no}</span>
                                  {h.note && <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>· {h.note}</span>}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>
          단가는 JSR 제품견적서(발주서) 원본에서 판독한 값입니다. 무상출고(0원)·취소차감(음수) 행은 단가가 아니므로 제외했습니다.
        </p>
      </div>
    </div>
  );
}
