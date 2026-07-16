import { useState, useEffect, useMemo, useCallback } from 'react';
import { Bell, X, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getTodayKST } from '@/lib/utils';

// 예약일 알림 띠 — 저장된 장바구니의 배송 예정일이 오늘(또는 지났는데)인데 아직 주문으로 안 넘긴 건을 상기시킨다.
// 사장님: "오늘이 예약된 날짜일 경우 아직 주문 확인 안된 상태면 내가 까먹지 않게 수시로 알람 뜨게"
//
// 설계 의도:
// - 저장 장바구니에 남아 있다 = 아직 주문 아님. 예약일이 됐는데 남아 있으면 사장님이 까먹은 것
// - 팝업 모달은 작업을 끊어서 오히려 무시하게 된다 → 상단 띠로 계속 보이되 작업은 안 막음
// - [30분 뒤에]로 스누즈. 잔소리가 되면 사람은 무시하기 시작함
// - 지난 날짜는 더 급하므로 빨강으로 분리 표시

const SNOOZE_KEY = 'pos_reservation_snooze_until';
const SNOOZE_MS = 30 * 60 * 1000; // 30분
const POLL_MS = 5 * 60 * 1000;    // 5분마다 재확인 (스누즈 해제 시점 반영 + 다른 기기 변경 반영)

// 주문으로 안 넘어간 상태들 — 저장 장바구니에 남아 있으면 전부 "아직 주문 안 됨"
// (완료된 건은 장바구니에서 사라지므로 상태값으로 거를 필요는 없지만, 명시적으로 남겨둠)
const PENDING_STATUSES = ['pending', 'reservation', 'scheduled', 'ready', 'hold', null, undefined, ''];

const readSnooze = () => {
  try { return Number(localStorage.getItem(SNOOZE_KEY)) || 0; } catch { return 0; }
};
const writeSnooze = (until) => {
  try { localStorage.setItem(SNOOZE_KEY, String(until)); } catch {}
};

export default function ReservationAlertBar({ onGoToCarts, reserveRightGutter = false }) {
  const [carts, setCarts] = useState([]);
  const [snoozeUntil, setSnoozeUntil] = useState(readSnooze);
  const [tick, setTick] = useState(0); // 스누즈 만료를 렌더에 반영시키는 트리거

  const load = useCallback(async () => {
    const rows = await supabase.getSavedCarts();
    if (Array.isArray(rows)) setCarts(rows);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => { load(); setTick((n) => n + 1); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // 예약일이 오늘이거나 지났는데 아직 장바구니에 남아 있는 건
  const due = useMemo(() => {
    const today = getTodayKST();
    return (carts || [])
      .filter((c) => {
        const d = c.delivery_date;
        if (!d) return false;
        if (!PENDING_STATUSES.includes(c.status)) return false;
        return String(d) <= today; // 당일 + 지난 건
      })
      .map((c) => ({ ...c, overdue: String(c.delivery_date) < getTodayKST() }))
      .sort((a, b) => String(a.delivery_date).localeCompare(String(b.delivery_date)));
  }, [carts]);

  const snoozed = snoozeUntil > Date.now();
  if (!due.length || snoozed) return null;

  const overdueCount = due.filter((c) => c.overdue).length;

  return (
    // flex-wrap 필수 — 제품주문 화면은 우측 장바구니 패널(400px)이 겹쳐서 가로가 좁다.
    // wrap 없으면 [보러가기]/[30분 뒤에]가 화면 밖으로 밀려 스누즈를 못 누른다 (2026-07-16)
    <div
      className={`flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 border-b ${reserveRightGutter ? 'lg:pr-[420px]' : ''}`}
      style={{
        background: overdueCount > 0
          ? 'color-mix(in srgb, var(--destructive) 12%, var(--card))'
          : 'color-mix(in srgb, var(--warning) 12%, var(--card))',
        borderColor: overdueCount > 0 ? 'var(--destructive)' : 'var(--warning)',
      }}
    >
      <Bell className="w-5 h-5 flex-shrink-0 mt-0.5 animate-pulse" style={{ color: overdueCount > 0 ? 'var(--destructive)' : 'var(--warning)' }} />

      <div className="flex-1 min-w-[200px]">
        <div className="font-black text-base mb-1" style={{ color: 'var(--foreground)' }}>
          {overdueCount > 0
            ? <>🚨 예약일이 지난 주문 {overdueCount}건이 아직 처리 안 됐습니다</>
            : <>오늘 예약 {due.length}건 — 아직 주문 안 됐습니다</>}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {due.slice(0, 5).map((c) => (
            <button
              key={c.id}
              onClick={() => onGoToCarts?.(c.id)}
              className="text-sm font-bold underline decoration-dotted flex items-center gap-1"
              style={{ color: c.overdue ? 'var(--destructive)' : 'var(--foreground)' }}
              title="저장된 장바구니에서 열기"
            >
              {c.overdue && <AlertTriangle className="w-3.5 h-3.5" />}
              {c.name || '이름 없음'}
              <span className="font-normal" style={{ color: 'var(--muted-foreground)' }}>
                ({c.delivery_date}{c.overdue ? ' 지남' : ''})
              </span>
            </button>
          ))}
          {due.length > 5 && (
            <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>외 {due.length - 5}건</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
        <button
          onClick={() => onGoToCarts?.()}
          className="px-3 py-1.5 rounded-lg text-sm font-bold text-white whitespace-nowrap"
          style={{ background: 'var(--primary)' }}
        >
          보러가기
        </button>
        <button
          onClick={() => { const u = Date.now() + SNOOZE_MS; writeSnooze(u); setSnoozeUntil(u); }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-bold border whitespace-nowrap"
          style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
          title="30분 뒤에 다시 알려드립니다"
        >
          <Clock className="w-3.5 h-3.5" /> 30분 뒤에
        </button>
      </div>
    </div>
  );
}
