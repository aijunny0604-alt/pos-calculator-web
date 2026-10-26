import test from 'node:test';
import assert from 'node:assert/strict';
import { appendShortages, validReorderQuantity, normalizeReorders, makeReorder } from '../src/lib/storeReorder.js';
import { catalogState, soldOutOptions } from '../src/lib/storeCatalog.js';
const product = {channel_product_no:10, name:'옵션 상품',status_type:'SALE',options:[{name:'검정',stock:0},{name:'은색',stock:4},{name:'중지',stock:0,usable:false},null]};
test('사용 중인 품절 옵션만 담고 기존 수량·메모·완료 상태를 덮어쓰지 않는다',()=>{
  const existing = {...makeReorder(product,product.options[0]),quantity:'12',note:'입고일 확인',ordered:true};
  assert.deepEqual(appendShortages([existing],[product,product]),[existing]);
  assert.equal(appendShortages([],[product]).length,1);
});
test('옵션 없는 전체 품절은 상품 단위로 담고 판매중지·판매중은 제외한다',()=>{
  const all = [{channel_product_no:20,name:'전체 품절',status_type:'OUTOFSTOCK'}, {...product,status_type:'SUSPENSION'},{...product,status_type:'SALE',options:[]}];
  const result=appendShortages([],all); assert.equal(result.length,1); assert.equal(result[0].option,'');assert.equal(result[0].quantity,'');
});
test('누락된 옵션이 있어도 화면 분류가 중단되지 않는다',()=>{
  assert.equal(catalogState(product),'options');assert.equal(soldOutOptions(product).length,1);
});
test('발주 수량은 1~999999 정수만 허용한다',()=>{
  for (const value of ['',0,-1,'1.5','1e2','abc',1000000,null]) assert.equal(validReorderQuantity(value),false,String(value));
  for (const value of [1,'12','999999']) assert.equal(validReorderQuantity(value),true);
});
test('저장 데이터의 중복과 잘못된 형식을 정리하고 정상 필드는 유지한다',()=>{
  const item={...makeReorder(product,product.options[0]),quantity:'-3',note:{bad:true},option:null};
  const result=normalizeReorders([null,item,item,{key:1,name:'오류'}]);
  assert.equal(result.length,1);assert.equal(result[0].quantity,'');assert.equal(result[0].note,'');assert.equal(result[0].name,product.name);
  assert.deepEqual(normalizeReorders({}),[]);
});
