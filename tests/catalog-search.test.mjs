import test from 'node:test';import assert from 'node:assert/strict';
import {catalogMatch,repeatOrderItems} from '../src/lib/catalogSearch.js';
import {searchProductsRanked} from '../src/lib/productMatch.js';
const products=[{id:1,name:'스텐 밴딩 54-30',wholesale:9900},{id:2,name:'스텐 밴딩 54-45'},{id:3,name:'실리콘 엘보 호스 60.5mm'},{id:4,name:'실리콘 엘보 호스 65mm'},{id:5,name:'브레이크 호스 세트'}];
test('앞뒤 단어 순서·붙여쓰기·기호와 초성 검색',()=>{
 for(const q of ['밴딩 스텐 30 54','54/30 스텐 밴딩','밴딩스텐 54-30','ㅅㅌ ㅂㄷ 54 30']) assert.equal(searchProductsRanked(q,products)[0]?.id,1,q);
 assert.ok(catalogMatch('호스 엘보 실리콘','실리콘 엘보 호스 60.5mm'));
 assert.ok(catalogMatch('호스실리콘','실리콘 엘보 호스'));
});
test('숫자 규격·소수를 정확하게 구분하고 무관한 6개를 채우지 않는다',()=>{
 assert.deepEqual(searchProductsRanked('60.5 호스 실리콘',products).map(p=>p.id),[3]);
 assert.deepEqual(searchProductsRanked('밴딩 54 30',products).map(p=>p.id),[1]);
 assert.equal(catalogMatch('5','65mm'),false);
 assert.deepEqual(searchProductsRanked('99999 밴딩',products),[]);
});
test('동의어와 전체폭 숫자도 상품을 찾는다',()=>{
 assert.equal(searchProductsRanked('밴드 STS ５４ ３０',products)[0]?.id,1);
 assert.equal(searchProductsRanked('스테인레스 밴딩 54 30',products)[0]?.id,1);
});
test('다시 담기는 현재 단가를 사용하고 없는 상품을 알린다',()=>{
 const r=repeatOrderItems({items:[{id:1,quantity:2,wholesale:1},{id:999,quantity:1,name:'없음'}]},products);
 assert.equal(r.items[0].wholesale,9900);assert.equal(r.items[0].quantity,2);assert.deepEqual(r.missing,['없음']);
});
