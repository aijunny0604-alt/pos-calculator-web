import test from 'node:test';
import assert from 'node:assert/strict';
import {storeShippingDetails,shippingDate} from '../src/lib/storeShippingDetails.js';
const now=Date.parse('2026-10-16T12:00:00+09:00');
test('상품별 지연 사유와 기한을 섞지 않는다',()=>{
 const rows=storeShippingDetails({order_status:'PAYED'},[{raw_payload:{productOrder:{delayedDispatchReason:'PRODUCT_PREPARE',dispatchDueDate:'2026-10-15T23:59:00+09:00'}}},{raw_payload:{productOrder:{dispatchDueDate:'2026-10-20T23:59:00+09:00'}}}],now);
 assert.equal(rows[0].reason,'상품 준비 중');assert.equal(rows[0].overdue,true);assert.equal(rows[1].delayed,false);assert.equal(rows[1].overdue,false);
});
test('배송완료·취소 건은 기한 초과로 표시하지 않는다',()=>{
 for(const status of ['DELIVERED','CANCELED','DISPATCHED'])assert.equal(storeShippingDetails({},[{raw_payload:{productOrder:{productOrderStatus:status,dispatchDueDate:'2020-01-01'}}}],now)[0].overdue,false);
});
test('누락 날짜는 미제공, 모르는 코드는 원문 보존',()=>{
 const row=storeShippingDetails({},[{raw_payload:{productOrder:{delayedDispatchReason:'NEW_CODE',dispatchDueDate:'invalid'}}}],now)[0];
 assert.equal(row.reason,'NEW_CODE');assert.equal(row.overdue,false);assert.equal(shippingDate(null),'미제공');assert.equal(shippingDate('invalid'),'미제공');
 assert.match(shippingDate('2026-10-15T16:00:00Z'),/16/);
});
