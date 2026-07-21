// JSR 매입 미입고 현황 위젯 (대시보드 KPI 그리드 8번째 칸)
// 발주했는데 아직 안 들어온 품목 수·금액 + 가장 오래 묵은 건 강조.
// JSR이 몇 달째 물건을 안 보내는 게 실제 고충이라, 최고령 묵은일수가 핵심 신호.
// 숫자/상태 계산은 매입 발주 페이지와 동일하게 purchaseExport 헬퍼 재사용(화면과 어긋나지 않게).
// 대시보드 StatCard와 동일한 외형(아이콘박스+라벨+값+보조) → 그리드에 자연스럽게 정렬.

import { useEffect, useMemo, useState } from 'react';
import { PackageX, ClipboardCheck, AlertCircle } from 'lucide-react';
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
  // 🚨 getPurchaseOrders는 실패 시 null을 준다. 이걸 []로 뭉개면 미입고가 쌓여 있어도
  //    "전부 입고됨"(초록)으로 보여 위젯이 존재 이유를 배반한다 → 실패는 실패로 표시.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const rows = await supabase.getPurchaseOrders();
      if (!alive) return;
      if (Array.isArray(rows)) { setPos(rows); setFailed(false); }
      else { setPos([]); setFailed(true); }
    })();
    // 다른 기기/탭에서 발주 입고 처리하면 반영되게 가벼운 폴링(5분)
    const t = setInterval(async () => {
      const rows = await supabase.getPurchaseOrders();
      if (!alive) return;
      if (Array.isArray(rows)) { setPos(rows); setFailed(false); } // 실패 시엔 직전 값 유지
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
      // 발주일 없는 행은 후보에서 제외(문자열 비교하면 "null"이 끼어들어 정렬이 흔들림) — 경과일 숫자로 비교
      if (!po.order_date) continue;
      const d = daysSince(po.order_date);
      if (!oldest || d > oldest.days) oldest = { po, days: d };
    }
    return { itemCount, amount, oldest };
  }, [pos]);

  const go = () => setCurrentPage?.('purchase-orders');

  // 로딩 스켈레톤 (StatCard 크기와 동일)
  if (s === null) {
    return (
      <div className="flex items-start gap-4 p-5 rounded-xl border animate-pulse" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="w-12 h-12 rounded-xl flex-shrink-0" style={{ background: 'var(--muted)' }} />
        <div className="flex-1 pt-1">
          <div className="h-3 w-20 rounded mb-2" style={{ background: 'var(--muted)' }} />
          <div className="h-6 w-24 rounded" style={{ background: 'var(--muted)' }} />
        </div>
      </div>
    );
  }

  // 조회 실패 — "미입고 없음"으로 오인하면 JSR 지연을 놓치므로 명시적으로 확인 불가 표시
  if (failed) {
    return (
      <button
        onClick={go}
        className="flex items-start gap-4 p-5 rounded-xl border transition-all hover:shadow-md hover:-translate-y-0.5 text-left w-full"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      >
        <div className="p-3 rounded-xl flex-shrink-0" style={{ background: 'color-mix(in srgb, var(--muted-foreground) 12%, transparent)' }}>
          <AlertCircle className="w-6 h-6" style={{ color: 'var(--muted-foreground)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>JSR 매입 미입고</p>
          <p className="text-2xl font-bold mt-0.5" style={{ color: 'var(--muted-foreground)' }}>확인 불가</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>불러오기 실패 · 눌러서 확인</p>
        </div>
      </button>
    );
  }

  const hasPending = s.itemCount > 0;
  // 발주일이 없는 행만 미입고인 경우 oldest가 없을 수 있다 → 날짜 강조는 생략
  const oldestDays = s.oldest?.days ?? null;
  const lv = hasPending && oldestDays != null ? ageLevel(oldestDays) : 'ok';
  const accent = hasPending ? AGE_COLOR[lv] : 'var(--success)';
  const Icon = hasPending ? PackageX : ClipboardCheck;

  return (
    <button
      onClick={go}
      className="flex items-start gap-4 p-5 rounded-xl border transition-all hover:shadow-md hover:-translate-y-0.5 text-left w-full"
      style={{
        background: hasPending && lv === 'critical'
          ? 'color-mix(in srgb, var(--destructive) 5%, var(--card))'
          : 'var(--card)',
        borderColor: hasPending && lv === 'critical'
          ? 'color-mix(in srgb, var(--destructive) 30%, var(--border))'
          : 'var(--border)',
      }}
    >
      <div className="p-3 rounded-xl flex-shrink-0" style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)` }}>
        <Icon className="w-6 h-6" style={{ color: accent }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>JSR 매입 미입고</p>
        {hasPending ? (
          <>
            <p className="text-2xl font-bold mt-0.5" style={{ color: 'var(--foreground)' }}>{s.itemCount}품목</p>
            <p className="text-xs mt-0.5 break-keep leading-snug" style={{ color: accent }}>
              {lv === 'critical' ? '🚨 ' : lv === 'warn' ? '⚠️ ' : ''}
              {formatPrice(s.amount)}원{oldestDays != null ? ` · 최장 ${oldestDays}일` : ''}
            </p>
          </>
        ) : (
          <>
            <p className="text-2xl font-bold mt-0.5" style={{ color: 'var(--foreground)' }}>없음</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--success)' }}>전부 입고됨</p>
          </>
        )}
      </div>
    </button>
  );
}
