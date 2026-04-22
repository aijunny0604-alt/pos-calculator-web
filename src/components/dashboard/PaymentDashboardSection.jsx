import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Dashboard 결제 위젯 3종 (pos-payments sandbox 이식)
 * - 연체 주문 (상단 배너)
 * - 업체별 미수 TOP 8
 * - 최근 입금 10건
 *
 * 각 항목 클릭 시 해당 페이지로 이동 (currentPage 전환).
 */

const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
const dateKST = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function PaymentDashboardSection({ customers = [], setCurrentPage }) {
  const [overdue, setOverdue] = useState([]);
  const [recent, setRecent] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.getOverdueRecords(20),
      supabase.getRecentPayments(10),
      supabase.getPaymentRecords({ hasBalance: true }),
    ]).then(([od, rp, allOutstanding]) => {
      if (cancelled) return;
      setOverdue(od || []);
      setRecent(rp || []);
      // 업체별 미수 집계 TOP 8
      const map = new Map();
      for (const r of allOutstanding || []) {
        if (!r.customer_id) continue;
        const key = String(r.customer_id);
        const prev = map.get(key) || { count: 0, balance: 0 };
        map.set(key, { count: prev.count + 1, balance: prev.balance + Number(r.balance || 0) });
      }
      const top = [...map.entries()]
        .map(([id, v]) => ({
          customer: customers.find((c) => String(c.id) === id) || { id, name: `#${id}` },
          ...v,
        }))
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 8);
      setRanking(top);
      setLoaded(true);
    }).catch(() => setLoaded(true));
    return () => { cancelled = true; };
  }, [customers]);

  if (!loaded) return null;

  // 모든 섹션이 비어있으면 섹션 전체 숨김 (dashboard 간결성)
  const hasAnything = overdue.length > 0 || recent.length > 0 || ranking.length > 0;
  if (!hasAnything) return null;

  const customerName = (id) => customers.find((c) => String(c.id) === String(id))?.name || `#${id}`;
  const recordById = (id, records) => records.find((r) => r.id === id);

  const Panel = ({ title, emptyMessage, children }) => {
    const hasContent = Array.isArray(children) ? children.some(Boolean) : !!children;
    return (
      <section className="rounded-xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--foreground)' }}>{title}</h2>
        <div className="space-y-2">
          {hasContent ? children : (
            <p className="text-xs text-center py-6" style={{ color: 'var(--muted-foreground)' }}>{emptyMessage}</p>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-4">
      {/* 연체 배너 — 연체 있을 때만 */}
      {overdue.length > 0 && (
        <div
          className="rounded-xl border-l-4 p-3 flex items-center gap-3"
          style={{
            background: 'color-mix(in srgb, var(--destructive) 8%, var(--card))',
            borderColor: 'var(--destructive)',
            borderLeftColor: 'var(--destructive)',
          }}
        >
          <span className="text-2xl">🚨</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: 'var(--destructive)' }}>
              연체 {overdue.length}건 · 총 {fmt(overdue.reduce((s, r) => s + Number(r.balance || 0), 0))}원
            </p>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              납기일이 지났는데 미수 상태인 주문
            </p>
          </div>
          <button
            onClick={() => setCurrentPage('payments')}
            className="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap"
            style={{ background: 'var(--destructive)', color: 'white' }}
          >
            확인 →
          </button>
        </div>
      )}

      {/* 2-Column: 업체별 미수 TOP + 최근 입금 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="🏢 업체별 미수 TOP 8" emptyMessage="미수 있는 업체 없음 👍">
          {ranking.map((r) => (
            <button
              key={r.customer.id}
              onClick={() => setCurrentPage('customers')}
              className="w-full p-2.5 rounded-lg text-sm flex items-start gap-2 text-left transition-colors hover:bg-[var(--accent)]"
              style={{ background: 'var(--muted)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold break-keep leading-snug" style={{ color: 'var(--foreground)' }}>{r.customer.name}</div>
                <div className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>미수 {r.count}건</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-bold text-sm tabular-nums" style={{ color: 'var(--destructive)' }}>{fmt(r.balance)}원</div>
                <div className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>›</div>
              </div>
            </button>
          ))}
        </Panel>

        <Panel title="💵 최근 입금" emptyMessage="입금 내역 없음">
          {recent.map((p) => (
            <button
              key={p.id}
              onClick={() => setCurrentPage('payments')}
              className="w-full p-2.5 rounded-lg text-sm flex items-start gap-2 text-left transition-colors hover:bg-[var(--accent)]"
              style={{ background: 'var(--muted)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className="font-bold text-base tabular-nums"
                    style={{ color: p.type === 'expense' ? 'var(--destructive)' : 'var(--success)' }}
                  >
                    {p.type === 'expense' ? '-' : '+'}{fmt(p.amount)}원
                  </span>
                </div>
                <div className="text-[11px] mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--muted-foreground)' }}>
                  {p.method && <span>{p.method}</span>}
                  {p.memo && <span className="break-words leading-snug">· {p.memo}</span>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[10px] whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>{dateKST(p.paid_at)}</div>
              </div>
            </button>
          ))}
        </Panel>
      </div>
    </div>
  );
}
