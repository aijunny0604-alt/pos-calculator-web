import test from 'node:test';
import assert from 'node:assert/strict';
import { productSnapshot, prepareProductChange, productFingerprint } from '../bridge/store-product.mjs';
import { recommendReorder, recentProductSales } from '../src/lib/storeReorder.js';
const sample = () => ({ originProduct: { name: '상품', statusType: 'SALE', stockQuantity: 8, detailAttribute: { optionInfo: { useStockManagement: true, optionCombinations: [{ id: 3, optionName1: '옵션', stockQuantity: 8, price: 2000, usable: false }] } } } });
test('실시간 원상품 번호가 검증된 경우만 읽고 옵션 가격과 사용 여부를 유지한다', () => {
  assert.throws(() => productSnapshot(sample(), '1', '2'));
  const snapshot = productSnapshot(sample(), '1', '1');
  const result = prepareProductChange(snapshot, { kind: 'option', optionId: '3', optionType: 'combination', stock: 5 });
  assert.deepEqual(result.body, { optionInfo: { optionCombinations: [{ id: 3, stockQuantity: 5, price: 2000, usable: false }] } });
  assert.notEqual(productFingerprint(snapshot), productFingerprint({ ...snapshot, stock: 7 }));
});
test('최근 주문량은 정확한 상품 ID만 집계하고 취소·반품 주문을 제외한다', () => {
  const date = '2026-10-27T00:00:00Z';
  const rows = [{created_at:date,items:[{id:1,quantity:3},{id:2,quantity:99}]},{created_at:date,status:'cancelled',items:[{id:1,quantity:9}]},{created_at:date,total_returned:100,items:[{id:1,quantity:5}]}];
  assert.deepEqual(recentProductSales(rows,1,Date.parse(date)+1000),{quantity:3,skippedReturns:1,uncertain:false});
});
test('미확인 속성, 재고 범위 오류와 위험한 상태 변경은 거절한다', () => {
  const data = sample(); delete data.originProduct.detailAttribute.optionInfo.optionCombinations[0].price;
  const snap = productSnapshot(data, '1', '1');
  assert.throws(() => prepareProductChange(snap, { kind: 'option', optionId: '3', optionType: 'combination', stock: 0 }));
  assert.throws(() => prepareProductChange(snap, { kind: 'option', optionId: '3', optionType: 'combination', stock: -1 }));
  assert.throws(() => prepareProductChange(snap, { kind: 'status', status: 'OUTOFSTOCK' }));
  assert.throws(() => prepareProductChange({ ...snap, status: 'OUTOFSTOCK', stock: 0 }, { kind: 'status', status: 'SALE' }));
  assert.deepEqual(prepareProductChange({ ...snap, status: 'OUTOFSTOCK', stock: 8 }, { kind: 'status', status: 'SALE' }).body, { statusType: 'SALE', stockQuantity: 8 });
  assert.deepEqual(prepareProductChange(snap, { kind: 'status', status: 'SUSPENSION' }).body, { statusType: 'SUSPENSION' });
});
test('추천은 입력 누락 시 계산하지 않고 재고와 미입고를 차감한다', () => {
  assert.equal(recommendReorder({ sales: '', stock: 0, incoming: 0, days: 30 }), null);
  assert.equal(recommendReorder({ sales: 31, stock: 5, incoming: 3, days: 14 }), 7);
  assert.equal(recommendReorder({ sales: 0, stock: 10, incoming: 2, days: 30 }), 0);
  assert.equal(recommendReorder({ sales: -1, stock: 0, incoming: 0, days: 30 }), null);
});
