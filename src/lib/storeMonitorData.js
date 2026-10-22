import { fetchPosRows } from './posConnection.js';

// 큐 처리 중에는 큰 raw_payload와 상품/이미지를 매번 재조회하지 않는다.
export async function fetchStoreDispatchStates(baseUrl, headers, ids, fetcher = fetch) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  const rows = [];
  for (let i = 0; i < unique.length; i += 50) {
    const url = new URL(`${baseUrl}/rest/v1/external_orders`);
    url.searchParams.set('id', `in.(${unique.slice(i, i + 50).map(id => `"${id.replace(/["\\]/g, '')}"`).join(',')})`);
    url.searchParams.set('select', 'id,order_status,needs_naver_dispatch,needs_naver_confirm,naver_dispatch_succeeded_at,naver_confirm_succeeded_at,naver_cancel_succeeded_at,naver_dispatch_error,naver_dispatch_attempted_at,naver_dispatch_next_retry_at');
    rows.push(...await fetchPosRows(url.toString(), { headers }, fetcher));
  }
  return rows;
}

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
