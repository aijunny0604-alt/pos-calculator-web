import test from 'node:test';
import assert from 'node:assert/strict';
import {customerMatches,orderProductMatches} from '../src/lib/customerSearch.mjs';
test('업체명 순서·혼합문자·중간 단어 생략·연락처',()=>{
 const c={name:'WP튠 김해',address:'경남 김해시',phone:'010-1234-5678'};
 for(const q of ['WP김해','김해 WP','김해WP','wp 튠','ＷＰ 김해','01012345678'])assert.equal(customerMatches(c,q),true,q);
 for(const q of ['WP 부산','01012345679','없는업체'])assert.equal(customerMatches(c,q),false,q);
});
test('제품은 한 품목 안에서 모든 검색어 충족, 규격 구분',()=>{
 const o={items:[{name:'스텐 밴딩 54-30'},{product_name:'브레이크 호스'}]};
 assert.equal(orderProductMatches(o,'밴딩 스텐'),true);
 assert.equal(orderProductMatches(o,'호스 브레이크'),true);
 assert.equal(orderProductMatches(o,'스텐 호스'),false);
 assert.equal(orderProductMatches(o,'밴딩 64'),false);
 assert.equal(orderProductMatches({},''),true);
});
