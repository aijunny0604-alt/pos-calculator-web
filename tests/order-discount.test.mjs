import test from 'node:test';
import assert from 'node:assert/strict';
import { getOrderDiscountSummary } from '../src/lib/discount.js';
const item={price:125000,originalPrice:132000,quantity:30,discountType:'fixed',discountValue:125000};
test('저장된 30개 품목 할인은 21만원 절감과 396만원 원금으로 표시한다',()=>{
  assert.deepEqual(getOrderDiscountSummary({totalAmount:3750000,items:[item]}),{hasDiscount:true,count:1,saved:210000,originalTotal:3960000});
});
test('일반 상품 혼합·퍼센트·금액 할인은 실제 저장된 단가와 수량으로 합산한다',()=>{
  const result=getOrderDiscountSummary({totalAmount:285,items:[{price:100,quantity:1},{price:90,originalPrice:100,quantity:1,discountType:'percent',discountValue:10},{price:95,originalPrice:100,quantity:1,discountType:'amount',discountValue:5}]});
  assert.equal(result.saved,15);assert.equal(result.originalTotal,300);assert.equal(result.count,2);
});
test('할인 메타 없는 가격 차이·할인 해제·인상 특가·다른 가격 기준은 할인으로 추정하지 않는다',()=>{
  for(const it of [{...item,discountType:null},{...item,discountValue:0},{...item,price:140000},{...item,originalPriceField:'retail'}]) {
    assert.equal(getOrderDiscountSummary({totalAmount:3750000,items:[it]}).hasDiscount,false);
  }
});
test('원가 누락은 할인 여부만 표시하고 잘못된 원금·0원 절감을 만들지 않는다',()=>{
  const result=getOrderDiscountSummary({totalAmount:3750000,items:[{...item,originalPrice:null}]});
  assert.equal(result.hasDiscount,true);assert.equal(result.originalTotal,null);assert.equal(result.saved,null);
});
test('100퍼센트 할인은 0원 최종가를 유지한다',()=>{
  const result=getOrderDiscountSummary({totalAmount:0,items:[{price:0,originalPrice:1000,quantity:2,discountType:'percent',discountValue:100}]});
  assert.equal(result.saved,2000);assert.equal(result.originalTotal,2000);
});


import { itemDiscountText, orderDiscountText } from '../src/lib/discount.js';
const won = n => Number(n).toLocaleString('ko-KR');
test('복사 주문서는 원단가와 21만원 할인, 396만원 원금을 표시하고 최종 단가를 변경하지 않는다', () => {
 const source = { ...item };
 assert.equal(itemDiscountText(source, 'wholesale', won), '   단가: 132,000원 → 125,000원\n   할인: -210,000원\n');
 assert.equal(orderDiscountText({totalAmount:3750000,items:[source]}, won), '할인 전 금액: 3,960,000원\n할인: -210,000원\n');
 assert.deepEqual(source,item);
});
test('일반 주문에는 할인 문구를 추가하지 않고, 원단가 미상은 금액을 추정하지 않는다', () => {
 assert.equal(itemDiscountText({price:100,quantity:1},'wholesale',won),'');
 assert.equal(orderDiscountText({totalAmount:100,items:[{price:100,quantity:1}]},won),'');
 assert.match(itemDiscountText({...item,originalPrice:null},'wholesale',won),/기록 없음/);
 assert.doesNotMatch(itemDiscountText({...item,originalPrice:null},'wholesale',won),/210,000/);
});
test('0원 최종 단가도 복사 주문서에서 보존하며 소매·도매가 다른 할인은 제외한다', () => {
 assert.match(itemDiscountText({price:0,originalPrice:1000,quantity:2,discountType:'percent',discountValue:100},'wholesale',won),/1,000원 → 0원\n   할인: -2,000원/);
 assert.equal(itemDiscountText({...item,originalPriceField:'retail'},'wholesale',won),'');
});
