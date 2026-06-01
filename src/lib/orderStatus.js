// 외부(네이버 스마트스토어) 주문의 "처리 완료" 판정 — 단일 소스.
// App.jsx 메뉴 배지와 SmartStoreOrders 페이지가 같은 기준을 쓰도록 공유한다.
// (2026-06-01: App.jsx 배지가 더 좁은 집합을 써서 취소/반품 주문을 과다 카운트하던 드리프트 통일)
export const DONE_STATUSES = new Set([
  'converted', 'shipped', 'cancelled',
  'DELIVERED', 'DELIVERED_COMPLETED', 'PURCHASE_DECIDED',
  'CANCELED', 'CANCELED_BY_NOPAYMENT',
  'RETURNED', 'EXCHANGED',
]);

// 주문이 "처리 완료/종결" 상태인가 — order_status 기준.
// SmartStoreOrders 페이지의 기본 노출 필터(showCompleted=false 시 숨김)와 동일 기준.
// (발송처리 완료 건은 보통 order_status가 'shipped'로 전환되어 자동 포함됨)
export function isOrderDone(o) {
  return !!o && DONE_STATUSES.has(o.order_status);
}

// 배송 진행 중(이미 발송됨) — 종결은 아니지만 사장님이 더 할 일은 없는 상태.
export const IN_TRANSIT_STATUSES = new Set(['DELIVERING', 'DISPATCHED']);

// 사장님이 아직 "처리해야 하는" 대기 주문인가 (결제완료/발주확인 등 배송 전).
// 종결(DONE)도 아니고 이미 발송(배송중)도 아닌 상태 = 액션 필요.
// 메뉴 배지가 이 기준으로 날짜 무관하게 카운트한다 (2026-06-01: '오늘만' → '처리대기 전체'로 변경).
export function isOrderPending(o) {
  if (!o) return false;
  const s = o.order_status;
  return !DONE_STATUSES.has(s) && !IN_TRANSIT_STATUSES.has(s);
}
