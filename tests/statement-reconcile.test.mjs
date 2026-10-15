import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcile,statusOf,sameProduct,normalizeStatement} from '../src/lib/statementReconcile.js';
const item=(name='스텐 밴딩 54-30',qty=1,supply=10000,tax=1000)=>({name,qty,supply,tax,uncertain:false});
const stmt=(items=[item()],extra={})=>({customer:'진주 스핀휠',issue_date:'2026-10-15',stated_total:11000,items,...extra});
const order=(name='스텐 밴딩 54-30',extra={})=>({id:'A',customerName:'스핀휠 진주',createdAt:'2026-10-15T01:00:00Z',totalAmount:11000,items:[{name,quantity:1,price:11000}],...extra});
test('이름 순서/공백/재질 동의어는 허용하되 규격·좌우·코드 차이는 거부',()=>{
 for(const [a,b] of [['밴딩 스텐 54-30','스텐 밴딩 54-30'],['용접TVB54H좌우','용접 TVB54H 좌우'],['스테인리스 밴딩 60.5mm','스텐 밴딩 60.5']]) assert.ok(sameProduct(a,b),a);
 for(const [a,b] of [['스텐 60.5','스텐 65'],['TVB54H','TVB54Y'],['밴딩 54-30','밴딩 30-54'],['플랜지 좌','플랜지 우'],['54','54']]) assert.equal(sameProduct(a,b),false,a);
});
test('동액의 다른 상품은 일치가 아니다',()=>{
 const r=reconcile(stmt(),[order('브레이크 호스')]);assert.equal(r.missingCount,1);assert.equal(r.posOnly.length,1);assert.notEqual(statusOf(r),'일치');
});
test('제품명+규격+수량+금액 정상 일치 및 규격 분리 열',()=>{
 assert.equal(statusOf(reconcile(stmt(),[order()])),'일치');
 assert.equal(statusOf(reconcile(stmt([{...item('밴딩 스텐'),spec:'54-30'}]),[order()])),'일치');
});
test('금액이 같아도 수량 다르면 불일치',()=>{const r=reconcile(stmt([item(undefined,2)]),[order()]);assert.equal(r.missingCount,1);});
test('쉼표 금액 보존, 판독 불확실/미판독/합계 차이를 숨기지 않는다',()=>{
 const n=normalizeStatement(stmt([{...item(),supply:'10,000',tax:'1,000'}],{stated_total:'11,000'}));assert.equal(n.stated_total,11000);assert.equal(n.items[0].supply,10000);
 assert.notEqual(statusOf(reconcile(stmt([{...item(),uncertain:true}]),[order()])),'일치');
 assert.equal(normalizeStatement(stmt([item('',1,null,null)])).items[0].supply,null);
 assert.ok(reconcile(stmt(),[order('스텐 밴딩 54-30',{totalAmount:12000})]).issues.length);
});
test('0원 품목도 이름과 수량이 같아야 일치',()=>{
 const s=stmt([item('서비스',1,0,0)],{stated_total:0});
 assert.equal(reconcile(s,[order('다른품목',{totalAmount:0,items:[{name:'다른품목',price:0,quantity:1}]})]).missingCount,1);
});
test('잘못된 날짜/없는 날짜는 전체 주문을 섞지 않는다',()=>{for(const d of [null,'2026-02-30'])assert.equal(reconcile(stmt(undefined,{issue_date:d}),[order()]).matchedOrders.length,0);});
test('거래처 부분 문자열과 동액 다중 주문을 합치지 않는다',()=>{
 const r=reconcile(stmt(undefined,{customer:'스핀'}),[order(),order('스텐 밴딩 54-30',{id:'B',customerName:'다른 거래처'})]);assert.equal(r.matchedOrders.length,0);assert.equal(r.candidateOrders.length,2);
});
test('인근 날짜 여러 주문을 무조건 더하지 않는다',()=>{const r=reconcile(stmt(),[order(undefined,{createdAt:'2026-10-14T01:00:00Z'}),order(undefined,{id:'B',createdAt:'2026-10-13T01:00:00Z'})]);assert.equal(r.matchedOrders.length,0);});
test('같은 제품 묶음은 수량과 금액 모두 일치할 때만 허용',()=>{
 const o=order(undefined,{totalAmount:22000,items:[{name:'스텐 밴딩 54-30',quantity:1,price:11000},{name:'스텐 밴딩 54-30',quantity:1,price:11000}]});
 const r=reconcile(stmt([item(undefined,2,20000,2000)],{stated_total:22000}),[o]);assert.equal(statusOf(r),'일치');assert.equal(r.stmtRows[0].combo,true);
 assert.equal(reconcile(stmt([item(undefined,3,20000,2000)],{stated_total:22000}),[o]).missingCount,1);
});
test('취소 주문 제외, 반품 주문은 재확인',()=>{assert.equal(reconcile(stmt(),[order(undefined,{status:'cancelled'})]).matchedOrders.length,0);assert.notEqual(statusOf(reconcile(stmt(),[order(undefined,{totalReturned:100})])),'일치');});
test('빈 명세서/읽지 못한 금액을 일치로 처리하지 않는다',()=>{assert.notEqual(statusOf(reconcile(stmt([],{stated_total:0}),[order(undefined,{totalAmount:0,items:[]})])),'일치');});
