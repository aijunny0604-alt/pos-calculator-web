import test from 'node:test';
import assert from 'node:assert/strict';
import { optionStock, catalogState, catalogCounts, filterCatalog, catalogOld, catalogUrl, catalogCSV } from '../src/lib/storeCatalog.js';
const rows = [
  {channel_product_no: 1, name: '플랜지 FL 63', status_type: 'OUTOFSTOCK', options: [{name:'63', stock:0}]},
  {channel_product_no: 2, name: '배기 팁', seller_management_code:'NPK_89S-B', status_type:'SALE', options:[{name:'블랙',stock:0},{name:'티타늄',stock:5},{name:'폐기옵션',stock:0,usable:false},{name:'미확인',stock:null}]},
  {channel_product_no: 3, name: '중지상품',status_type:'SUSPENSION', options:[{stock:0}]},
  {channel_product_no: 4, name: '판매상품',status_type:'SALE', options:[{stock:0,usable:false},{stock:null}]},
  {channel_product_no: 5, name: '종료상품',status_type:'CLOSE'},
];
test('품절·옵션 품절·판매중지는 서로 중복 집계하지 않는다', () => {
  assert.deepEqual(rows.map(catalogState), ['soldout','options','suspended','sale','other']);
  assert.deepEqual(catalogCounts(rows), {all:5,attention:2,soldout:1,options:1,suspended:1,sale:1,other:1,zeroOptions:1});
});
test('미확인 또는 잘못된 재고를 0으로 해석하지 않는다', () => {
  for (const stock of [null,undefined,'',' ',NaN,-1,'unknown',false,true]) assert.equal(optionStock({stock}),null);
  assert.equal(optionStock({stock:'0'}),0); assert.equal(optionStock({stock:'5'}),5);
});
test('상품·옵션·코드를 조합 검색하며 원본을 바꾸지 않는다', () => {
  assert.deepEqual(filterCatalog(rows,'블랙 npk89sb','all').map(r=>r.channel_product_no),[2]);
  assert.equal(filterCatalog(rows,'플랜지','options').length,0);
  assert.equal(filterCatalog(rows,'','attention').length,2);
  assert.equal(rows[0].channel_product_no,1);
});
test('동기화 경과·누락과 상품 링크를 검증한다', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  assert.equal(catalogOld({synced_at:'2026-10-26T11:00:00Z'},now),false);
  assert.equal(catalogOld({synced_at:'2026-10-24T12:00:00Z'},now),true);
  assert.equal(catalogOld({},now),true);
  assert.equal(catalogUrl({channel_product_no:'javascript:alert(1)'}),null);
  assert.equal(catalogUrl(rows[0]),'https://smartstore.naver.com/main/products/1');
});
test('CSV는 모든 옵션과 미확인 재고를 보존하고 수식 실행을 막는다', () => {
  const csv = catalogCSV([{...rows[1],name:'=SUM(1,2)"'}]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes("'=SUM(1,2)")); assert.ok(csv.includes('"미확인"')); assert.ok(csv.includes('"사용 안 함"'));
  assert.equal(csv.split('\r\n').length,5);
});
