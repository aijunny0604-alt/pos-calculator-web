// 네이버 스마트스토어 주문 긴급도 집계 (모닝 브리핑 등 공용)
// ⚠️ 판정 로직은 SmartStoreOrders.jsx stats useMemo(line 546~)와 1:1 동일하게 유지할 것.
//    - 발송마감 due: dispatch_due_date 컬럼 우선, raw_payload 폴백
//    - 완료(isOrderDone) 건은 제외
//    - 미처리(isOrderPending) = 내부전환X · 완료X · 배송중X · 입금대기X
import { isOrderDone, isOrderPending } from '@/lib/orderStatus';

export function computeNaverBriefing(orders = []) {
  const now = Date.now();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(todayStart.getDate() + 1);
  const dayAfterStart = new Date(todayStart); dayAfterStart.setDate(todayStart.getDate() + 2);

  let pending = 0, overdue = 0, dueDday = 0, dueD1 = 0, cancelRequest = 0;
  const overdueNames = [];

  for (const o of orders) {
    if (isOrderPending(o)) pending++;

    const dispatchDue = o.dispatch_due_date || o.raw_payload?.productOrder?.dispatchDueDate || o.raw_payload?.dispatchDueDate;
    if (!isOrderDone(o) && dispatchDue) {
      const due = new Date(dispatchDue).getTime();
      if (Number.isNaN(due)) {
        // 발송마감 값이 깨졌으면 조용히 누락하지 말고 "초과"로 보수 처리 (사장님이 직접 확인하도록)
        overdue++; if (overdueNames.length < 3) overdueNames.push(o.buyer_name || o.orderer_name || '주문');
      } else if (due < now) { overdue++; if (overdueNames.length < 3) overdueNames.push(o.buyer_name || o.orderer_name || '주문'); }
      else if (due >= todayStart.getTime() && due < tomorrowStart.getTime()) dueDday++;
      else if (due >= tomorrowStart.getTime() && due < dayAfterStart.getTime()) dueD1++;
    }

    // ⚠️ "확인 필요"는 사장님 응답이 필요한 미처리 취소요청만 — 이미 취소 완료(CANCELED/CANCELED_BY_NOPAYMENT)는 종결이라 제외
    const status = o.order_status;
    const isPendingCancel = status === 'CANCEL_REQUEST' || /cancel/i.test(o.raw_payload?.cancelRequest || '');
    if (isPendingCancel && !isOrderDone(o)) cancelRequest++;
  }

  return { pending, overdue, dueDday, dueD1, cancelRequest, overdueNames, total: orders.length };
}
