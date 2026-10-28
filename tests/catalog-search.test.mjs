import test from 'node:test';import assert from 'node:assert/strict';
import {catalogMatch,repeatOrderItems} from '../src/lib/catalogSearch.js';
import {searchProductsRanked,searchProductChoices} from '../src/lib/productMatch.js';
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

const diameterProducts = [
 {id:10,name:'플랜지 FL 63'}, {id:11,name:'플랜지 FL 54'},
 {id:12,name:'자바라 SF 63 S 길이 120'}, {id:13,name:'자바라 SF 63 S 길이 150'},
 {id:14,name:'H64 바디'}, {id:15,name:'X64 바디'}, {id:16,name:'CH 150 64'},
 {id:17,name:'플랜지 FL 76'}, {id:18,name:'실리콘 호스 60.5mm'},
];
const ids=q=>searchProductsRanked(q,diameterProducts).map(p=>p.id);
test('부품명 없이 숫자만 맞는 바디·소음기를 결과에 섞지 않는다',()=>{
 for(const q of ['플랜지 64','64 플랜지','플랜지64','후렌지 64','플랜지 ６４','플랜지 64파이']) assert.deepEqual(ids(q),[10],q);
 assert.deepEqual(ids('플랜지 999'),[]);
 assert.deepEqual(ids('없는부품 64'),[]);
 assert.deepEqual(ids('ㅍㄹㅈ 63'),[10]);
 assert.deepEqual(ids('ㅎㅅ 64'),[],'초성 의미부가 다르면 숫자만으로 통과 금지');
 assert.deepEqual(ids('64'),[14,15,16]);
});
test('제품명만 입력하거나 순서를 바꿔도 검색된다',()=>{
 assert.deepEqual(ids('플랜지'),[10,11,17]);
 assert.deepEqual(ids('자바라'),[12,13]);
 for(const q of ['자바라 64 120','120 자바라 64','자바라64 길이120']) assert.deepEqual(ids(q),[12],q);
});
test('정확한 규격 우선, 근접 규격은 구경만 후보로 안내',()=>{
 assert.deepEqual(ids('플랜지 63'),[10]);
 assert.deepEqual(searchProductsRanked('플랜지 64',[...diameterProducts,{id:19,name:'플랜지 FL 64'}]).map(p=>p.id),[19]);
 assert.deepEqual(ids('자바라 63 121'),[],'길이 보정 금지');
 assert.deepEqual(ids('자바라 64 121'),[],'두 치수 동시 보정 금지');
 assert.deepEqual(ids('플랜지 63.5'),[],'소수 규격 보정 금지');
 assert.deepEqual(ids('H65'),[],'모델번호 보정 금지');
 assert.deepEqual(ids('실리콘 61'),[],'다른 종류로 근접 보정 확장 금지');
 assert.equal(catalogMatch('플랜지 64','플랜지 FL 63'),false,'AI OFF 정확 검색 유지');
 assert.deepEqual(searchProductsRanked('자바라 64',diameterProducts,{limit:1}).map(p=>p.id),[12]);
});

test('수동 제품 선택은 공통 순위·규격 안전성과 카테고리 검색을 유지한다',()=>{
 const candidates=[...diameterProducts,{id:20,name:'특수 제품',category:'브레이크'},{id:21,name:'정확 제품',category:'특수'}];
 assert.deepEqual(searchProductChoices('플랜지 64',candidates).map(p=>p.id),[10]);
 assert.deepEqual(searchProductChoices('자바라 64 121',candidates),[]);
 assert.deepEqual(searchProductChoices('브레이크',candidates).map(p=>p.id),[20]);
 assert.deepEqual(searchProductChoices(' ',candidates),[]);
 assert.equal(searchProductChoices('플랜지',candidates,{limit:1}).length,1);
 assert.doesNotThrow(()=>searchProductChoices('플랜지',[null,{category:'플랜지'},...candidates]));
});
