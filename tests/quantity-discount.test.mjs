import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDiscount, calcOrderVat } from '../src/lib/utils.js';
import { serializeDiscountedItem, getOrderDiscountSummary } from '../src/lib/discount.js';

const product = { id: 879, name: '져스트 G1', discount_tiers: [] };

test('10개 이상 같은 품목에만 도매 고정 할인 단가를 적용한다', () => {
  assert.equal(calculateDiscount(product, 9, 840000, 'wholesale').discountedPrice, 840000);
  assert.equal(calculateDiscount(product, 10, 840000, 'wholesale').discountedPrice, 720000);
  assert.equal(calculateDiscount(product, 11, 840000, 'wholesale').discountedPrice, 720000);
  assert.equal(calculateDiscount(product, 10, 1320000, 'retail').discountedPrice, 1320000);
  assert.equal(calculateDiscount(product, 10, 700000, 'wholesale').discountedPrice, 700000);
});

test('기존 대상 미지정 구간은 도매와 소매에서 유지된다', () => {
  const legacy = { discount_tiers: [{ minQty: 10, type: 'amount', value: 1000 }] };
  assert.equal(calculateDiscount(legacy, 10, 20000, 'wholesale').discountedPrice, 19000);
  assert.equal(calculateDiscount(legacy, 10, 30000, 'retail').discountedPrice, 29000);
});

test('표에 있는 각 제품의 도매 단가만 적용하고 다른 제품은 제외한다', () => {
  const rows = [[879,'져스트 G1',840000,720000],[880,'져스트 G2',1038000,918000],
    [881,'져스트 G1C1',972000,852000],[882,'져스트 G2C1',1170000,1050000],
    [883,'져스트 모듈',528000,480000],[884,'메인 스피커',300000,198000],
    [885,'고음 스피커',211200,145200]];
  for (const [id,name,base,discounted] of rows) {
    assert.equal(calculateDiscount({id,name},10,base,'wholesale').discountedPrice,discounted,name);
    assert.equal(calculateDiscount({id,name},9,base,'wholesale').discountedPrice,base,name);
    assert.equal(calculateDiscount({id,name},10,base,'retail').discountedPrice,base,name);
  }
  assert.equal(calculateDiscount({id:879,name:'다른 상품'},10,840000,'wholesale').discountedPrice,840000);
  assert.equal(calculateDiscount({id:999,name:'져스트 G1'},10,840000,'wholesale').discountedPrice,840000);
});

test('기존 수량 할인과 표 단가는 중복 차감하지 않고 더 낮은 단가를 사용한다', () => {
  const otherTier = { ...product, discount_tiers: [{ minQty: 10, type: 'amount', value: 200000 }] };
  assert.equal(calculateDiscount(otherTier,10,840000,'wholesale').discountedPrice,640000);
});

test('할인 단가와 금액이 주문 합계 및 저장 이력과 일치한다', () => {
  const info = calculateDiscount(product, 10, 840000, 'wholesale');
  const line = { ...product, quantity: 10, unitPrice: 840000, ...info, finalTotal: info.discountedPrice * 10, totalDiscount: info.discountAmount * 10 };
  const saved = serializeDiscountedItem(line, 'wholesale');
  assert.equal(saved.price, 720000);
  assert.equal(saved.originalPrice, 840000);
  assert.equal(saved.discountValue, 120000);
  assert.equal(saved.quantity * saved.price, 7200000);
  assert.equal(calcOrderVat([line]).total, 7200000);
  assert.deepEqual(getOrderDiscountSummary({ items: [saved], priceType: 'wholesale', totalAmount: 7200000 }), { hasDiscount: true, count: 1, saved: 1200000, originalTotal: 8400000 });
});

test('수동 할인과 수량 할인은 실제 최종 단가 및 원래 단가를 저장한다', () => {
  const info = calculateDiscount(product, 10, 800000, 'wholesale');
  const saved = serializeDiscountedItem({ ...product, quantity: 10, unitPrice: 800000, ...info, originalPrice: 840000, originalPriceField: 'wholesale', discountType: 'amount', discountValue: 40000 }, 'wholesale');
  assert.equal(saved.price, 720000);
  assert.equal(saved.discountValue, 120000);
  assert.equal(saved.originalPrice, 840000);
});
