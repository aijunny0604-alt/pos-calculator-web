// 가상 주문만 사용하며 network.js가 저장/외부 요청을 차단한다.
export function storeWidgetFixture() {
  const today = new Date(); today.setHours(9, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const rows = [
    ['어제 발주확인 내부등록', 'confirmed', { received_at: yesterday.toISOString(), naver_confirm_succeeded_at: yesterday.toISOString(), internal_order_id: 'DEMO-OLD-CONFIRM' }],
    ['지난 내부전환 미발송', 'converted', { received_at: yesterday.toISOString(), internal_order_id: 'DEMO-OLD-CONVERT' }],
    ['오늘 결제', 'PAYED'], ['오늘 발주확인', 'confirmed'], ['오늘 발송', 'shipped'],
    ['어제 주문 오늘 발송', 'shipped', { received_at: yesterday.toISOString(), naver_dispatch_succeeded_at: today.toISOString() }],
    ['배송중 샘플', 'shipped'], ['배송완료 샘플', 'shipped'],
    ['반품 요청 샘플', 'DELIVERED', { raw_payload: { productOrder: { claimStatus: 'RETURN_REQUEST', claimType: 'RETURN' } } }],
    ['취소 완료 샘플', 'CANCELED'], ['입금대기 샘플', 'PAYMENT_WAITING'],
    ['기간 밖 처리대기', 'PAYED', { received_at: yesterday.toISOString(), needs_naver_confirm: true, dispatch_due_date: tomorrow.toISOString() }],
    ['지난 발송 샘플', 'shipped', { received_at: yesterday.toISOString(), naver_dispatch_succeeded_at: yesterday.toISOString() }],
    ['다른 마켓 발송', 'shipped', { provider: 'mock' }],
  ];
  const external_orders = rows.map(([name, status, extra = {}], i) => ({ id: `WIDGET-${i}`, provider_order_id: `SAMPLE-${i}`, provider: 'naver', buyer_name: name, order_status: status, total_amount: 10000, received_at: today.toISOString(), created_at: today.toISOString(), ...extra }));
  const external_order_items = external_orders.map(order => ({ id: `ITEM-${order.id}`, external_order_id: order.id, provider_product_name: '위젯 검증용 상품', quantity: 1, unit_price: 10000, ...(order.buyer_name === '배송중 샘플' ? {raw_payload:{productOrder:{productOrderStatus:'DELIVERING'}}} : order.buyer_name === '배송완료 샘플' ? {raw_payload:{productOrder:{productOrderStatus:'DELIVERED'}}} : {}) }));
  return { external_orders, external_order_items };
}
