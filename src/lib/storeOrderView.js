import { isOrderTerminal, PAYMENT_PENDING_STATUSES } from './orderStatus.js';
import { getClaimInfo } from './storeOrderSafety.js';

export const ORDER_STEPS = ['결제완료', '발주확인', '발송', '배송중', '배송완료'];

// 대표 주문의 로컬 shipped 값보다 상품별 네이버 배송 상태가 앞설 수 있다.
// 일부 상품만 완료된 경우 주문 전체를 완료로 올리지 않는다. 원본 DB 값은 수정하지 않는다.
export function storeOrderStatus(order, items = []) {
  const base = order?.order_status;
  if (isOrderTerminal(order)) return base;
  const sources = items.length ? items : (order?.raw_payload?.productOrder ? [{ raw_payload: order.raw_payload }] : []);
  const statuses = sources.map(item => item.raw_payload?.productOrder?.productOrderStatus || item.order_status || base)
    .filter(status => !['CANCELED', 'CANCELED_BY_NOPAYMENT', 'RETURNED', 'EXCHANGED', 'cancelled'].includes(status));
  if (!statuses.length) return base;
  const delivered = status => ['DELIVERED', 'DELIVERED_COMPLETED', 'PURCHASE_DECIDED'].includes(status);
  if (statuses.every(delivered)) return 'DELIVERED';
  if (statuses.every(status => delivered(status) || status === 'DELIVERING')) return 'DELIVERING';
  return base;
}

export function isStoreOrderTerminal(order, items = []) {
  return isOrderTerminal({ order_status: storeOrderStatus(order, items) });
}

// 저장된 상태만 사용한다. 송장번호나 경과 시간으로 배송중/배송완료를 추정하지 않는다.
export function orderStage(o, items = []) {
  const st = storeOrderStatus(o, items);
  const unpaid = PAYMENT_PENDING_STATUSES.has(st);
  if (o?.naver_cancel_succeeded_at || ['cancelled', 'CANCELED', 'CANCELED_BY_NOPAYMENT', 'CANCEL_REQUEST', 'RETURNED', 'EXCHANGED'].includes(st)) return { stage: -1, canceled: true, unpaid: false };
  if (['DELIVERED', 'DELIVERED_COMPLETED', 'PURCHASE_DECIDED'].includes(st)) return { stage: 4, canceled: false, unpaid };
  if (st === 'DELIVERING') return { stage: 3, canceled: false, unpaid };
  if (o?.naver_dispatch_succeeded_at || st === 'shipped' || st === 'DISPATCHED') return { stage: 2, canceled: false, unpaid };
  if (o?.naver_confirm_succeeded_at || o?.internal_order_id || st === 'confirmed' || st === 'converted') return { stage: 1, canceled: false, unpaid };
  return { stage: unpaid ? -2 : 0, canceled: false, unpaid };
}

// 내부 POS 등록은 발송 완료가 아니다. 날짜와 무관한 출고 모니터링 전용 판정.
export function isStoreAwaitingDispatch(order, items = []) {
  if (!order || getClaimInfo(order, items)) return false;
  const state = orderStage(order, items);
  return !state.unpaid && !state.canceled && (state.stage === 0 || state.stage === 1);
}

export function matchesStoreStage(order, items, key) {
  if (key === 'all') return true;
  const state = orderStage(order, items);
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
    || isStoreAwaitingDispatch(order, items) || getClaimInfo(order, items));
}

export function matchesStoreWidget(order, items, key, now = Date.now()) {
  if (key === 'receivedToday') return !!order.received_at && new Date(order.received_at).toDateString() === new Date(now).toDateString();
  const claimed = !!getClaimInfo(order, items);
  const awaitingDispatch = isStoreAwaitingDispatch(order, items);
  if (key === 'cancel') return (!isOrderTerminal(order) && (order.order_status === 'CANCEL_REQUEST' || /cancel/i.test(order.raw_payload?.cancelRequest || ''))) || claimed;
  if (key === 'needShip') return awaitingDispatch;
  if (key === 'autoPending') return awaitingDispatch && !!(order.needs_naver_confirm || order.needs_naver_dispatch);
  if (key === 'newAfterConfirm') return awaitingDispatch && orderStage(order, items).stage === 1;
  const dueValue = order.dispatch_due_date || order.raw_payload?.productOrder?.dispatchDueDate || order.raw_payload?.dispatchDueDate;
  const due = dueValue ? new Date(dueValue).getTime() : NaN;
  if (!awaitingDispatch || !Number.isFinite(due)) return false;
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
    const state = orderStage(order, items(order));
    if (state.unpaid) stages.unpaid++;
    if (state.stage >= 0) stages.stages[state.stage]++;
  }
  const widgets = Object.fromEntries(['overdue', 'dueDday', 'dueD1', 'autoPending', 'newAfterConfirm', 'needShip', 'cancel']
    .map(key => [key, matching.filter(order => matchesStoreWidget(order, items(order), key, now)).length]));
  const filtered = (widgetFilter === 'none' ? scoped : matching).filter(order => {
    if (!matchesStoreStage(order, items(order), statusFilter)) return false;
    if (widgetFilter !== 'none') return matchesStoreWidget(order, items(order), widgetFilter, now);
    return !!query || showCompleted || statusFilter !== 'all' || !isStoreOrderTerminal(order, items(order)) || !!getClaimInfo(order, items(order));
  });
  return { matching, scoped, filtered, stages, widgets };
}
