import test from 'node:test';
import assert from 'node:assert/strict';
import {orderPaymentTotal} from '../src/lib/storeOrderAmount.js';
test('주문 전체 결제 수단을 합산하고 적립금도 누락하지 않는다',()=>{
 assert.equal(orderPaymentTotal({raw_payload:{order:{generalPaymentAmount:10000,checkoutAccumulationPaymentAmount:500,naverMileagePaymentAmount:1000}}},[]),11500);
});
test('상품별 금액이 모두 있을 때만 합산하며 하나가 빠지면 전체 상품 단가로 대체한다',()=>{
 const items=[{unit_price:10000,quantity:1,raw_payload:{productOrder:{totalPaymentAmount:9000}}},{unit_price:5000,quantity:2,raw_payload:{productOrder:{}}}];
 assert.equal(orderPaymentTotal({total_amount:10000},items),20000);
 items[1].raw_payload.productOrder.totalPaymentAmount=8000;
 assert.equal(orderPaymentTotal({},items),17000);
});
