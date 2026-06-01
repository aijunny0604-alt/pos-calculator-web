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
// SmartStoreOrders 페이지의 기본 노출 필터(showCompleted=false 시 숨김)와 동일 기준이라,
// App.jsx 메뉴 배지 숫자 = 스토어 페이지 기본 화면에 보이는 오늘 대기 주문 수와 1:1로 일치한다.
// (발송처리 완료 건은 보통 order_status가 'shipped'로 전환되어 자동 포함됨)
export function isOrderDone(o) {
  return !!o && DONE_STATUSES.has(o.order_status);
}
