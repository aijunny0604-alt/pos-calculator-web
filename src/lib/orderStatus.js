// 외부(네이버 스마트스토어) 주문의 "처리 완료" 판정 — 단일 소스.
// App.jsx 메뉴 배지와 SmartStoreOrders 페이지가 같은 기준을 쓰도록 공유한다.
// (2026-06-01: App.jsx 배지가 더 좁은 집합을 써서 취소/반품 주문을 과다 카운트하던 드리프트 통일)
export const DONE_STATUSES = new Set([
  'converted', 'shipped', 'cancelled',
  'DELIVERED', 'DELIVERED_COMPLETED', 'PURCHASE_DECIDED',
  'CANCELED', 'CANCELED_BY_NOPAYMENT',
  'RETURNED', 'EXCHANGED',
]);

// 주문이 "처리 완료/종결" 상태인가.
// 상태값뿐 아니라 네이버 발송처리 성공 시각(naver_dispatch_succeeded_at)도 완료로 본다
// (상태 플립 전이라도 이미 발송된 건은 대기 목록/배지에서 제외).
export function isOrderDone(o) {
  if (!o) return false;
  return DONE_STATUSES.has(o.order_status) || !!o.naver_dispatch_succeeded_at;
}
