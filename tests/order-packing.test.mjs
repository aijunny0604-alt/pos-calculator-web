import test from 'node:test';
import assert from 'node:assert/strict';
import { packingItemsChanged, validPackingBadge } from '../src/lib/orderPacking.js';

const one = [{ id:1, name:'샘플', option:'검정', quantity:2, price:100 }];
test('상품 추가·삭제·교체·수량·옵션 변경은 포장 재확인이 필요하다', () => {
  for (const next of [[...one,{id:2,name:'추가',quantity:1}], [], [{...one[0],id:2}], [{...one[0],quantity:3}], [{...one[0],option:'흰색'}]]) assert.equal(packingItemsChanged(one,next),true);
  assert.equal(packingItemsChanged(one,[{...one[0],price:90}]),false);
  assert.equal(packingItemsChanged(one,undefined),false);
  assert.equal(packingItemsChanged(null,one),true);
});
test('기존 포장완료가 현재 품목 수와 맞지 않거나 체크가 부족하면 완료로 보이지 않는다', () => {
  assert.equal(validPackingBadge({itemCount:1,checkedCount:1,done:true},[...one,...one]),null);
  assert.equal(validPackingBadge({itemCount:1,checkedCount:1,done:true},one).done,true);
  assert.equal(validPackingBadge({itemCount:1,checkedCount:0,done:true},one).done,false);
  assert.equal(validPackingBadge({itemCount:1,checkedCount:2,done:true},one),null);
  assert.equal(validPackingBadge({itemCount:0,checkedCount:0,done:true},[]),null);
});
