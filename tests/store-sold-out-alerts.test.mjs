import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySoldOutState, updateSoldOutState, readSoldOutState, writeSoldOutState } from '../src/lib/storeSoldOutAlerts.js';
const t1='2026-11-17T01:00:00Z', t2='2026-11-17T01:05:00Z', t3='2026-11-17T01:10:00Z';
const row=(extra={})=>({channel_product_no:'1',name:'테스트 상품',status_type:'SALE',synced_at:t1,options:[{id:3,name:'검정',stock:4,usable:true},{id:4,name:'흰색',stock:0,usable:true}],...extra});
test('첫 조회의 기존 품절은 알리지 않고 새 상품과 옵션의 미확인 상태는 추측하지 않는다',()=>{
 let state=updateSoldOutState(emptySoldOutState(),[row(),row({channel_product_no:'2',status_type:'OUTOFSTOCK'})]);
 assert.equal(state.pending.length,0);
 state=updateSoldOutState(state,[row(),row({channel_product_no:'3',status_type:'OUTOFSTOCK',synced_at:t2})]);
 assert.equal(state.pending.length,0);
});
test('재고가 있던 옵션과 판매 중이던 상품이 품절되면 각 항목을 한 번씩 알린다',()=>{
 const baseline=updateSoldOutState(emptySoldOutState(),[row()]);
 const next=updateSoldOutState(baseline,[row({status_type:'OUTOFSTOCK',synced_at:t2,options:[{id:3,name:'검정',stock:0,usable:true},{id:4,name:'흰색',stock:0,usable:true}]})]);
 assert.deepEqual(next.pending.map(a=>[a.kind,a.option]),[['product',''],['option','검정']]);
 const repeated=updateSoldOutState(next,[row({status_type:'OUTOFSTOCK',synced_at:t2,options:[{id:3,name:'검정',stock:0,usable:true}]})]);
 assert.equal(repeated.pending.length,2);
 const acknowledged={...repeated,pending:[]};
 assert.equal(updateSoldOutState(acknowledged,[row({status_type:'OUTOFSTOCK',synced_at:t2})]).pending.length,0);
});
test('재입고 후 다시 품절되면 다시 알리고 오래된 동기화와 판매중지 옵션은 무시한다',()=>{
 let state=updateSoldOutState(emptySoldOutState(),[row()]);
 state=updateSoldOutState(state,[row({synced_at:t2,options:[{id:3,name:'검정',stock:0,usable:true}]})]);
 state={...state,pending:[]};
 state=updateSoldOutState(state,[row({synced_at:t1})]);
 assert.equal(state.pending.length,0);
 state=updateSoldOutState(state,[row({synced_at:t3,options:[{id:3,name:'검정',stock:4,usable:true}]})]);
 state=updateSoldOutState(state,[row({synced_at:'2026-11-17T01:15:00Z',options:[{id:3,name:'검정',stock:0,usable:true}]})]);
 assert.equal(state.pending.length,1);
 const disabled=updateSoldOutState(updateSoldOutState(emptySoldOutState(),[row()]),[row({synced_at:t2,options:[{id:3,name:'검정',stock:0,usable:false}]})]);
 assert.equal(disabled.pending.length,0);
});
test('손상된 저장 내용과 저장 실패를 안전하게 처리한다',()=>{
 const bad={getItem(){return '{';},setItem(){throw Error('blocked');}};
 assert.equal(readSoldOutState(bad).initialized,false);
 assert.equal(writeSoldOutState(emptySoldOutState(),bad),false);
});
