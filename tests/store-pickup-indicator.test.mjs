import test from 'node:test';
import assert from 'node:assert/strict';
import { isVisitPickup, loadVisitPickupOrderIds, naverOrderIds } from '../src/lib/storePickupIndicator.js';

test('수령 방식은 주문 또는 품목 데이터에서 확인하고 실제 처리 방식이 있으면 우선한다', () => {
  const original = { raw_payload: { productOrder: { expectedDeliveryMethod: 'VISIT_RECEIPT' } } };
  assert.equal(isVisitPickup(original), true);
  assert.equal(isVisitPickup({}, [{ raw_payload: { productOrder: { expectedDeliveryMethod: 'VISIT_RECEIPT' } } }]), true);
  assert.equal(isVisitPickup({ raw_payload: { productOrder: { expectedDeliveryMethod: 'DELIVERY' } } }, [{ raw_payload: { productOrder: { expectedDeliveryMethod: 'VISIT_RECEIPT' } } }]), true);
  assert.equal(isVisitPickup({ ...original, naver_dispatch_company_code:'KGB', naver_dispatch_succeeded_at:'2026-11-11' }), false);
  assert.equal(isVisitPickup({ raw_payload:{ productOrder:{ expectedDeliveryMethod:'DELIVERY' } } }), false);
  assert.equal(isVisitPickup({}), false);
});
test('연결된 ID 또는 명시된 주문번호만 매칭한다', async () => {
  const external = [
    { id:'a', provider:'naver', internal_order_id:'order-1', provider_order_id:'123', raw_payload:{ productOrder:{ expectedDeliveryMethod:'VISIT_RECEIPT' } } },
    { id:'b', provider:'naver', internal_order_id:'other', provider_order_id:'456', raw_payload:{ productOrder:{ expectedDeliveryMethod:'VISIT_RECEIPT' } } },
    { id:'c', provider:'naver', internal_order_id:'order-3', provider_order_id:'789', raw_payload:{ productOrder:{ expectedDeliveryMethod:'DELIVERY' } } },
  ];
  const client = { from(table) { return { select() { return { eq() { return this; }, in(field, values) { return { order() { return this; }, async range(start, end) { return { data:(table === 'external_orders' ? external : []).filter(row => values.includes(String(row[field]))).slice(start, end + 1), error:null }; } }; } }; } }; } };
  assert.deepEqual(naverOrderIds({ memo:'[네이버 스마트스토어] 456\n[네이버 스마트스토어] 789' }), ['456','789']);
  const result = await loadVisitPickupOrderIds(client, [ {id:'order-1'}, {id:'order-2',memo:'[네이버 스마트스토어] 456'}, {id:'order-3'}, {id:'order-4',customerName:'같은 이름'} ]);
  assert.deepEqual([...result], ['order-1','order-2']);
});
