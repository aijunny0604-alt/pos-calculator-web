import { fetchPosRows } from './posConnection.js';

// 최신 주문 상한 밖에 있는 오래된 미발송도 별도로 끝까지 조회한다.
// 내부 전환(converted/internal_order_id)은 제외 조건으로 사용하지 않는다.
export async function fetchStoreMonitorOrders(baseUrl, headers, fetcher = fetch) {
  const recent = new URL(`${baseUrl}/rest/v1/external_orders`);
  recent.searchParams.set('order', 'received_at.desc,id.desc');
  recent.searchParams.set('limit', '200');
  const outstanding = new URL(recent);
  outstanding.searchParams.delete('limit');
  outstanding.searchParams.set('naver_dispatch_succeeded_at', 'is.null');
  outstanding.searchParams.set('naver_cancel_succeeded_at', 'is.null');
  outstanding.searchParams.set('or', '(order_status.is.null,order_status.not.in.(shipped,DISPATCHED,DELIVERING,DELIVERED,DELIVERED_COMPLETED,PURCHASE_DECIDED,cancelled,CANCELED,CANCELED_BY_NOPAYMENT,RETURNED,EXCHANGED,PAYMENT_WAITING,PAY_WAITING))');
  const [latest, waiting] = await Promise.all([
    fetchPosRows(recent.toString(), { headers }, fetcher),
    fetchPosRows(outstanding.toString(), { headers }, fetcher),
  ]);
  // 최근 조회의 발송 완료 상태를 우선하여 요청 사이 상태 변경 때 대기 상태로 되돌리지 않는다.
  return [...new Map([...waiting, ...latest].map(order => [order.id, order])).values()];
}
