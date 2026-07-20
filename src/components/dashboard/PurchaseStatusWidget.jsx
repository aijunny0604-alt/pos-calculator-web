// JSR 매입 미입고 현황 위젯 (대시보드)
// 발주했는데 아직 안 들어온 품목 수·금액 + 가장 오래 묵은 건을 강조.
// JSR이 몇 달째 물건을 안 보내는 게 실제 고충이라, 최고령 묵은일수가 핵심 신호.
// 숫자/상태 계산은 매입 발주 페이지와 동일하게 purchaseExport 헬퍼 재사용(화면과 어긋나지 않게).

import { useEffect, useMemo, useState } from 'react';
import { PackageX, ClipboardList, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { poOpenItems, itemRemaining, daysSince, ageLevel } from '@/lib/purchaseExport';
import { formatPrice } from '@/lib/utils';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const AGE_COLOR = {
  critical: 'var(--destructive)',
  warn: 'var(--warning)',
  ok: 'var(--muted-foreground)',
};

export default function PurchaseStatusWidget({ setCurrentPage }) {
  const [pos, setPos] = useState(null); // null=로딩, []=없음

  useEffect(() => {
    let alive = true;
    (async () => {
      const rows = await supabase.getPurchaseOrders();
      if (alive) setPos(Array.isArray(rows) ? rows : []);
    })();
    // 다른 기기/탭에서 발주 입고 처리하면 반영되게 가벼운 폴링(5분)
    const t = setInterval(async () => {
      const rows = await supabase.getPurchaseOrders();
      if (alive && Array.isArray(rows)) setPos(rows);
    }, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const s = useMemo(() => {
    if (!Array.isArray(pos)) return null;
    let itemCount = 0, amount = 0;
    let oldest = null; // { po, days }
    for (const po of pos) {
      const open = poOpenItems(po);
      if (open.length === 0) continue;
      itemCount += open.length;
      for (const it of open) amount += num(it.unit_price) * itemRemaining(it);
      if (!oldest || String(po.order_date) < String(oldest.po.order_date)) {
        oldest = { po, days: daysSince(po.order_date) };
      }
    }
    return { itemCount, amount, oldest };
  }, [pos]);

  const go = () => setCurrentPage?.('purchase-orders');

  // 로딩 스켈레톤
  if (s === null) {
    return (
      <div className="rounded-xl border p-4 animate-pulse" style={{ background: 'var(--card)', borderColor: 'var(--border)', minHeight: 92 }}>
        <div className="h-3 w-24 rounded mb-3" style={{ background: 'var(--muted)' }} />
        <div className="h-6 w-32 rounded" style={{ background: 'var(--muted)' }} />
      </div>
    );
  }

  const hasPending = s.itemCount > 0;
  const lv = hasPending ? ageLevel(s.oldest.days) : 'ok';
  const accent = hasPending ? AGE_COLOR[lv] : 'var(--success)';

  return (
    <button
      onClick={go}
      className="card-interactive text-left w-full rounded-xl border p-4 flex items-center gap-4"
      style={{
        background: hasPending && lv === 'critical'
          ? 'color-mix(in srgb, var(--destructive) 6%, var(--card))'
          : 'var(--card)',
        borderColor: hasPending && lv === 'critical'
          ? 'color-mix(in srgb, var(--destructive) 35%, var(--border))'
          : 'var(--border)',
        minHeight: 92,
      }}
    >
      <div
        className="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center"
        style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)` }}
      >
        {hasPending
          ? <PackageX className="w-5 h-5" style={{ color: accent }} />
          : <ClipboardList className="w-5 h-5" style={{ color: accent }} />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold" style={{ color: 'var(--muted-foreground)' }}>JSR 매입 미입고</p>
        {hasPending ? (
          <>
            <p className="text-xl sm:text-2xl font-black leading-tight tabular-nums" style={{ color: 'var(--foreground)' }}>
              {s.itemCount}품목 <span className="text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>· {formatPrice(s.amount)}원</span>
            </p>
            <p className="text-xs mt-0.5 font-semibold break-keep leading-snug" style={{ color: accent }}>
              {lv === 'critical' ? '🚨 ' : lv === 'warn' ? '⚠️ ' : ''}
              가장 오래 묵음 {s.oldest.days}일
              <span className="font-normal" style={{ color: 'var(--muted-foreground)' }}> · {s.oldest.po.po_number}</span>
            </p>
          </>
        ) : (
          <p className="text-xl sm:text-2xl font-black leading-tight" style={{ color: 'var(--success)' }}>
            미입고 없음 <span className="text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>· 전부 입고됨</span>
          </p>
        )}
      </div>

      <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--muted-foreground)' }} />
    </button>
  );
}
