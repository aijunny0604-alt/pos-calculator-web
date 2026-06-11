// 모닝 브리핑 카드 — 오늘 할 일 자동 요약 + AI 한 줄 브리핑
// 규칙 기반 집계(장바구니/재고/미수/매출) + 네이버 스마트스토어 긴급도 + Gemini 자연어 요약
import { useMemo, useState, useEffect, useRef } from 'react';
import { Truck, AlertTriangle, Users, Package, TrendingUp, Sun, Store, Sparkles, Clock } from 'lucide-react';
import { formatPrice, getTodayKST } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { computeNaverBriefing } from '@/lib/naverOrderStats';
// summarizeMorningBriefing 은 동적 import (geminiAnalyst → geminiTools 메인 번들 분리)

const AI_CACHE_KEY = 'pos_morning_briefing_ai_v1';
const AI_TTL = 30 * 60 * 1000; // 30분

function readAiCache(sig) {
  try {
    const raw = localStorage.getItem(AI_CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p.sig !== sig) return null;
    if (Date.now() - p.ts > AI_TTL) return null;
    return p.line;
  } catch { return null; }
}
function writeAiCache(sig, line) {
  try { localStorage.setItem(AI_CACHE_KEY, JSON.stringify({ ts: Date.now(), sig, line })); } catch { /* quota */ }
}

export default function MorningBriefing({ orders = [], savedCarts = [], products = [], customers = [], setCurrentPage }) {
  // 네이버 스마트스토어 주문 (별도 비동기 fetch — Dashboard prop에 없음)
  const [naverStats, setNaverStats] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ext = await supabase.getExternalOrders?.({ limit: 200 });
        if (alive && Array.isArray(ext)) setNaverStats(computeNaverBriefing(ext));
      } catch (e) { console.warn('[MorningBriefing] 네이버 주문 조회 실패:', e); }
    })();
    return () => { alive = false; };
  }, []);

  const briefing = useMemo(() => {
    const today = getTodayKST();
    const items = [];

    // 0. 네이버 스마트스토어 — 발송마감/미처리 (가장 급함, 최상단)
    if (naverStats) {
      if (naverStats.overdue > 0) {
        items.push({
          icon: AlertTriangle, color: 'var(--destructive)', bg: 'color-mix(in srgb, var(--destructive) 10%, transparent)',
          label: `🔥 네이버 발송기한 초과 ${naverStats.overdue}건`,
          detail: naverStats.overdueNames.length ? `${naverStats.overdueNames.join(', ')} — 지금 발송 처리 필요` : '지금 발송 처리 필요',
          action: () => setCurrentPage?.('smartstore'),
        });
      }
      if (naverStats.dueDday > 0) {
        items.push({
          icon: Clock, color: '#ff4d6d', bg: 'color-mix(in srgb, #ff4d6d 9%, transparent)',
          label: `오늘 발송마감 ${naverStats.dueDday}건 (D-day)`,
          detail: '오늘 안에 발송해야 하는 네이버 주문',
          action: () => setCurrentPage?.('smartstore'),
        });
      }
      if (naverStats.dueD1 > 0) {
        items.push({
          icon: Clock, color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 8%, transparent)',
          label: `내일 발송마감 ${naverStats.dueD1}건 (D-1)`,
          action: () => setCurrentPage?.('smartstore'),
        });
      }
      // 발송마감 표시가 하나도 없을 때만 일반 미처리 건수 노출 (중복 방지)
      if (naverStats.overdue === 0 && naverStats.dueDday === 0 && naverStats.dueD1 === 0 && naverStats.pending > 0) {
        items.push({
          icon: Store, color: '#03c75a', bg: 'color-mix(in srgb, #03c75a 8%, transparent)',
          label: `네이버 미처리 주문 ${naverStats.pending}건`,
          detail: '발주확인·발송 대기',
          action: () => setCurrentPage?.('smartstore'),
        });
      }
      if (naverStats.cancelRequest > 0) {
        items.push({
          icon: AlertTriangle, color: '#f97316', bg: 'color-mix(in srgb, #f97316 8%, transparent)',
          label: `네이버 취소 요청 ${naverStats.cancelRequest}건`,
          detail: '구매자 취소 요청 — 확인 필요',
          action: () => setCurrentPage?.('smartstore'),
        });
      }
    }

    // 1. 오늘 출고 예정 장바구니
    const todayShipments = savedCarts.filter(c => c.delivery_date && c.delivery_date === today);
    if (todayShipments.length > 0) {
      items.push({
        icon: Truck, color: 'var(--primary)', bg: 'color-mix(in srgb, var(--primary) 8%, transparent)',
        label: `오늘 출고 예정 ${todayShipments.length}건`,
        detail: todayShipments.slice(0, 3).map(c => c.name).join(', '),
        action: () => setCurrentPage?.('saved-carts'),
      });
    }

    // 2. 지연된 장바구니
    const overdue = savedCarts.filter(c => {
      if (!c.delivery_date || c.status === 'completed' || c.status === 'cancelled') return false;
      return c.delivery_date < today;
    });
    if (overdue.length > 0) {
      items.push({
        icon: AlertTriangle, color: 'var(--destructive)', bg: 'color-mix(in srgb, var(--destructive) 8%, transparent)',
        label: `배송 지연 ${overdue.length}건`,
        detail: overdue.slice(0, 3).map(c => c.name).join(', '),
        action: () => setCurrentPage?.('saved-carts'),
      });
    }

    // 3. 재고 부족 (5개 이하)
    const lowStock = products.filter(p => {
      const stock = p.stock ?? 50;
      return stock > 0 && stock <= 5 && p.stock_status !== 'incoming';
    });
    if (lowStock.length > 0) {
      items.push({
        icon: Package, color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 8%, transparent)',
        label: `재고 부족 ${lowStock.length}개 제품`,
        detail: lowStock.slice(0, 3).map(p => `${p.name}(${p.stock}개)`).join(', '),
        action: () => setCurrentPage?.('stock'),
      });
    }

    // 4. 미수금 높은 거래처 (상위 3곳)
    const withDebt = customers
      .filter(c => (c.outstanding_amount || 0) > 0)
      .sort((a, b) => (b.outstanding_amount || 0) - (a.outstanding_amount || 0));
    if (withDebt.length > 0) {
      const totalDebt = withDebt.reduce((s, c) => s + (c.outstanding_amount || 0), 0);
      items.push({
        icon: Users, color: '#f59e0b', bg: 'color-mix(in srgb, #f59e0b 8%, transparent)',
        label: `미수금 ${formatPrice(totalDebt)}원 (${withDebt.length}곳)`,
        detail: withDebt.slice(0, 3).map(c => `${c.name} ${formatPrice(c.outstanding_amount)}원`).join(', '),
        action: () => setCurrentPage?.('customers'),
      });
    }

    // 5. 오늘 매출 현황
    const todayOrders = orders.filter(o => {
      const d = o.createdAt || o.created_at || '';
      return d.startsWith(today);
    });
    if (todayOrders.length > 0) {
      const todaySales = todayOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
      items.push({
        icon: TrendingUp, color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 8%, transparent)',
        label: `오늘 매출 ${formatPrice(todaySales)}원 (${todayOrders.length}건)`,
        action: () => setCurrentPage?.('orders'),
      });
    }

    return items;
  }, [orders, savedCarts, products, customers, setCurrentPage, naverStats]);

  // AI 한 줄 브리핑 — 항목 라벨을 사실 데이터로 Gemini에 요약 요청 (실패 시 숫자 카드만)
  const factsSig = useMemo(() => briefing.map(i => `${i.label}${i.detail ? `/${i.detail}` : ''}`).join('\n'), [briefing]);
  const [aiLine, setAiLine] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const lastSigRef = useRef('');
  useEffect(() => {
    if (!factsSig) { setAiLine(''); lastSigRef.current = ''; return; } // 빈값 복귀 시 재호출 가능하도록 ref도 초기화
    if (lastSigRef.current === factsSig) return; // 같은 데이터 재호출 방지
    lastSigRef.current = factsSig;
    const cached = readAiCache(factsSig);
    if (cached) { setAiLine(cached); return; }
    let alive = true;
    setAiLoading(true);
    import('@/lib/geminiAnalyst')
      .then(({ summarizeMorningBriefing }) => summarizeMorningBriefing(factsSig))
      .then(line => { if (alive && line) { setAiLine(line); writeAiCache(factsSig, line); } })
      .catch(() => { /* 폴백: 숫자 카드만 */ })
      .finally(() => { if (alive) setAiLoading(false); });
    return () => { alive = false; };
  }, [factsSig]);

  if (briefing.length === 0) return null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? '좋은 아침이에요' : hour < 18 ? '오늘도 힘내세요' : '수고하셨어요';
  const urgentCount = briefing.filter(i => i.color === 'var(--destructive)' || i.color === '#ff4d6d').length;

  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: 'color-mix(in srgb, var(--primary) 3%, var(--card))', borderColor: 'color-mix(in srgb, var(--primary) 15%, var(--border))' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Sun className="w-4 h-4" style={{ color: '#f59e0b' }} />
        <span className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>
          {greeting} — 오늘의 브리핑
        </span>
        {urgentCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'var(--destructive)', color: 'white' }}>
            급한 일 {urgentCount}
          </span>
        )}
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'var(--primary)', color: 'white' }}>
          {briefing.length}
        </span>
      </div>

      {/* AI 한 줄 브리핑 */}
      {(aiLine || aiLoading) && (
        <div
          className="flex items-start gap-2 mb-3 p-2.5 rounded-lg"
          style={{ background: 'color-mix(in srgb, #a78bfa 10%, transparent)', border: '1px solid color-mix(in srgb, #a78bfa 22%, transparent)' }}
        >
          <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#a78bfa' }} />
          {aiLoading && !aiLine ? (
            <span className="text-xs animate-pulse" style={{ color: 'var(--muted-foreground)' }}>AI가 오늘 상황을 요약하는 중…</span>
          ) : (
            <p className="text-xs leading-relaxed break-words" style={{ color: 'var(--foreground)' }}>{aiLine}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {briefing.map((item, i) => {
          const Icon = item.icon;
          return (
            <button
              key={i}
              onClick={item.action}
              className="w-full flex items-start gap-3 p-2.5 rounded-lg text-left transition-all hover:shadow-sm active:scale-[0.99]"
              style={{ background: item.bg }}
            >
              <div className="flex-shrink-0 mt-0.5">
                <Icon className="w-4 h-4" style={{ color: item.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold" style={{ color: item.color }}>{item.label}</p>
                {item.detail && (
                  <p className="text-[10px] mt-0.5 break-words leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                    {item.detail}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
