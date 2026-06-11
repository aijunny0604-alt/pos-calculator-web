// 외부(네이버 스마트스토어) 주문의 "처리 완료" 판정 — 단일 소스.
// App.jsx 메뉴 배지와 SmartStoreOrders 페이지가 같은 기준을 쓰도록 공유한다.
// (2026-06-01: App.jsx 배지가 더 좁은 집합을 써서 취소/반품 주문을 과다 카운트하던 드리프트 통일)
export const DONE_STATUSES = new Set([
  'converted', 'shipped', 'cancelled',
  'DELIVERED', 'DELIVERED_COMPLETED', 'PURCHASE_DECIDED',
  'CANCELED', 'CANCELED_BY_NOPAYMENT',
  'RETURNED', 'EXCHANGED',
]);

// 주문이 "처리 완료/종결"인가 — order_status 또는 네이버 발송처리 완료 시각 기준.
// 발송처리는 큐에서 naver_dispatch_succeeded_at만 먼저 찍고 order_status는
// 네이버 polling이 DISPATCHED/DELIVERED로 따라오기 전까지 confirmed에 머무를 수 있으므로,
// 이미 발송한 건을 "완료"로 보려면 dispatch 시각도 함께 본다.
// (SmartStoreOrders 페이지 인라인 판정 5곳과 동일 기준 — 단일 소스)
export function isOrderDone(o) {
  return !!o && (DONE_STATUSES.has(o.order_status) || !!o.naver_dispatch_succeeded_at);
}

// 배송 진행 중(이미 발송됨) — 종결은 아니지만 사장님이 더 할 일은 없는 상태.
export const IN_TRANSIT_STATUSES = new Set(['DELIVERING', 'DISPATCHED']);

// "진짜 종결" — 배송완료/구매확정 + 취소/반품/교환. 더 이상 흐름이 진행되지 않는 끝 상태.
// 스마트스토어 페이지 기본 숨김은 이 집합만 대상으로 한다 (2026-06-02).
// converted/shipped/배송중은 아직 추적할 게 남았으므로 숨기지 않음 — 내부주문 전환해도
// 목록에 남아 진행단계(발주확인→발송→배송중)를 계속 보여준다.
export const TERMINAL_STATUSES = new Set([
  'DELIVERED', 'DELIVERED_COMPLETED', 'PURCHASE_DECIDED',
  'cancelled', 'CANCELED', 'CANCELED_BY_NOPAYMENT',
  'RETURNED', 'EXCHANGED',
]);
export function isOrderTerminal(o) {
  return !!o && TERMINAL_STATUSES.has(o.order_status);
}

// 입금대기 — 고객이 아직 결제를 안 함. 사장님이 할 수 있는 게 없으므로 배지에서 제외.
// 결제 완료되면 PAYED로 전환되어 그때부터 처리 대기로 잡힌다 (2026-06-01 결정).
export const PAYMENT_PENDING_STATUSES = new Set(['PAYMENT_WAITING', 'PAY_WAITING']);

// 사장님이 아직 "처리해야 하는" 대기 주문인가 (결제완료/발주확인 등 배송 전).
// 완료(발송 포함)도, 배송중도, 입금대기(고객 미결제)도 아닌 상태 = 지금 액션 필요.
// 메뉴 배지가 이 기준으로 날짜 무관하게 카운트한다 (2026-06-01: '오늘만' → '처리대기 전체'로 변경).
export function isOrderPending(o) {
  return !!o
    && !o.internal_order_id   // 내부주문으로 전환된 건 = 사장님이 이미 처리함 → 배지 제외.
                              // (2026-06-02: 전환 시 order_status를 'converted'로 덮지 않게 바뀌어
                              //  네이버 원본 status가 남으므로, 전환 여부는 internal_order_id로 판정)
    && !isOrderDone(o)
    && !IN_TRANSIT_STATUSES.has(o.order_status)
    && !PAYMENT_PENDING_STATUSES.has(o.order_status);
}
