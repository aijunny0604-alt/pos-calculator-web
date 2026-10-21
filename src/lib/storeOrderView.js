import { isOrderDone, isOrderPending, isOrderTerminal, IN_TRANSIT_STATUSES, PAYMENT_PENDING_STATUSES } from './orderStatus.js';
import { getClaimInfo } from './storeOrderSafety.js';

export const ORDER_STEPS = ['결제완료', '발주확인', '발송', '배송중', '배송완료'];

// 저장된 상태만 사용한다. 송장번호나 경과 시간으로 배송중/배송완료를 추정하지 않는다.
export function orderStage(o) {
  const st = o?.order_status;
  const unpaid = PAYMENT_PENDING_STATUSES.has(st);
  if (['cancelled', 'CANCELED', 'CANCELED_BY_NOPAYMENT', 'CANCEL_REQUEST', 'RETURNED', 'EXCHANGED'].includes(st)) return { stage: -1, canceled: true, unpaid: false };
  if (['DELIVERED', 'DELIVERED_COMPLETED', 'PURCHASE_DECIDED'].includes(st)) return { stage: 4, canceled: false, unpaid };
  if (st === 'DELIVERING') return { stage: 3, canceled: false, unpaid };
  if (o?.naver_dispatch_succeeded_at || st === 'shipped' || st === 'DISPATCHED') return { stage: 2, canceled: false, unpaid };
  if (o?.naver_confirm_succeeded_at || o?.internal_order_id || st === 'confirmed' || st === 'converted') return { stage: 1, canceled: false, unpaid };
  return { stage: unpaid ? -2 : 0, canceled: false, unpaid };
}

export function matchesStoreStage(order, items, key) {
  if (key === 'all') return true;
  const state = orderStage(order);
  const claimed = !!getClaimInfo(order, items);
  if (key === 'cancel') return state.canceled || claimed;
  if (state.canceled || claimed) return false;
  if (key === 'unpaid') return state.unpaid;
  return /^s[0-4]$/.test(key) && state.stage === Number(key.slice(1));
}

function matchesSearch(order, items, query) {
  if (!query) return true;
  const hay = [order.buyer_name, order.buyer_phone, order.provider_order_id, order.buyer_address,
    ...items.map(item => item.provider_product_name)].filter(Boolean).join(' ').toLowerCase();
  const compact = hay.replace(/\s+/g, '');
  const digits = query.replace(/\D/g, '');
  return hay.includes(query) || query.split(/\s+/).every(token => compact.includes(token))
    || (digits.length >= 3 && String(order.buyer_phone || '').replace(/\D/g, '').includes(digits));
}

export function inStoreActivityRange(order, items, range) {
  if (!range || !order.received_at) return true;
  const inRange = value => value && new Date(value) >= range.from && new Date(value) < range.to;
  return !!(inRange(order.received_at)
    || [order.naver_confirm_succeeded_at, order.naver_dispatch_succeeded_at, order.naver_cancel_succeeded_at, order.naver_dispatch_attempted_at].some(inRange)
    || isOrderPending(order) || getClaimInfo(order, items));
}

export function matchesStoreWidget(order, items, key, now = Date.now()) {
  if (key === 'receivedToday') return !!order.received_at && new Date(order.received_at).toDateString() === new Date(now).toDateString();
  const claimed = !!getClaimInfo(order, items);
  const done = isOrderDone(order) || IN_TRANSIT_STATUSES.has(order.order_status);
  if (key === 'cancel') return (!isOrderTerminal(order) && (order.order_status === 'CANCEL_REQUEST' || /cancel/i.test(order.raw_payload?.cancelRequest || ''))) || claimed;
  if (key === 'needShip') return isOrderPending(order) && !claimed && order.order_status !== 'CANCEL_REQUEST';
  if (key === 'autoPending') return !done && !claimed && order.order_status !== 'CANCEL_REQUEST' && !!(order.needs_naver_confirm || order.needs_naver_dispatch);
  if (key === 'newAfterConfirm') return !done && !claimed && !!order.naver_confirm_succeeded_at;
  const dueValue = order.dispatch_due_date || order.raw_payload?.productOrder?.dispatchDueDate || order.raw_payload?.dispatchDueDate;
  const due = dueValue ? new Date(dueValue).getTime() : NaN;
  if (done || claimed || order.order_status === 'CANCEL_REQUEST' || !Number.isFinite(due)) return false;
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const tomorrow = new Date(start); tomorrow.setDate(start.getDate() + 1);
  const afterTomorrow = new Date(tomorrow); afterTomorrow.setDate(tomorrow.getDate() + 1);
  if (key === 'overdue') return due < now;
  if (key === 'dueDday') return due >= start.getTime() && due < tomorrow.getTime();
  if (key === 'dueD1') return due >= tomorrow.getTime() && due < afterTomorrow.getTime();
  return false;
}

// 목록과 위젯은 동일한 검색/마켓/날짜 범위 및 상태 판정을 공유한다.
// 빠른 확인 위젯은 처리 누락 방지를 위해 기간과 무관하며, 클릭 결과도 같은 집합이다.
export function getStoreOrderView(orders, {
  itemsByOrder = {}, providerFilter = 'all', searchQuery = '', dateRange = null,
  statusFilter = 'all', widgetFilter = 'none', showCompleted = false, now = Date.now(),
} = {}) {
  const query = searchQuery.trim().toLowerCase();
  const items = order => itemsByOrder[order.id] || [];
  const matching = orders.filter(order => (providerFilter === 'all' || order.provider === providerFilter) && matchesSearch(order, items(order), query));
  const scoped = matching.filter(order => query || inStoreActivityRange(order, items(order), dateRange));
  const stages = { stages: [0, 0, 0, 0, 0], canceled: 0, unpaid: 0 };
  for (const order of scoped) {
    if (matchesStoreStage(order, items(order), 'cancel')) { stages.canceled++; continue; }
    const state = orderStage(order);
    if (state.unpaid) stages.unpaid++;
    if (state.stage >= 0) stages.stages[state.stage]++;
  }
  const widgets = Object.fromEntries(['overdue', 'dueDday', 'dueD1', 'autoPending', 'newAfterConfirm', 'needShip', 'cancel']
    .map(key => [key, matching.filter(order => matchesStoreWidget(order, items(order), key, now)).length]));
  const filtered = (widgetFilter === 'none' ? scoped : matching).filter(order => {
    if (!matchesStoreStage(order, items(order), statusFilter)) return false;
    if (widgetFilter !== 'none') return matchesStoreWidget(order, items(order), widgetFilter, now);
    return !!query || showCompleted || statusFilter !== 'all' || !isOrderTerminal(order) || !!getClaimInfo(order, items(order));
  });
  return { matching, scoped, filtered, stages, widgets };
}
