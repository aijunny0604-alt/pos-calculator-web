import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { commitOrderMemo, verifyOrderPaid, turnNavigation, isPersistedResult } from '../src/lib/movisReliability.js';
import { validatePending } from '../src/lib/movisValidation.js';
import { executeDataTool } from '../src/lib/movisDataTools.js';
buildSync({entryPoints:['src/lib/geminiTools.js'],bundle:true,platform:'node',format:'esm',outfile:'tests/.artifacts/reliability-tools.mjs',logLevel:'silent'});
buildSync({entryPoints:['src/lib/supabase.js'],bundle:true,platform:'node',format:'esm',outfile:'tests/.artifacts/reliability-db.mjs',logLevel:'silent'});
const { executeTool } = await import('./.artifacts/reliability-tools.mjs');
const { supabase } = await import('./.artifacts/reliability-db.mjs');
const orders = [{ id:'ORDER-TEST',customerName:'가상 고객',customer_name:'가상 고객',total:100,created_at:'2026-10-13',items:[{id:1,name:'가상제품',quantity:2,price:50}] }];
const customers = [{id:1,name:'가상 고객',phone:'010-0000-0000'},{id:2,name:'가상 고객 지점'}];
test('잘못된 주문번호나 번호 누락을 다른 고객 주문으로 대체하지 않는다',()=>{
 for(const name of ['updateOrderMemo','markOrderPaid','createReturn']) for(const orderNumber of ['WRONG',undefined]) assert.equal(executeTool(name,{orderNumber,customerName:'가상 고객',memo:'테스트',itemName:'가상제품',quantity:1},{orders,customers}).ok,false);
});
test('거래처 ID 실패·동명이인·부분일치 다중 후보는 임의 수정하지 않는다',()=>{
 assert.equal(executeTool('updateCustomer',{customerId:99,customerName:'가상 고객',phone:'1'},{customers}).ok,false);
 assert.equal(executeTool('updateCustomer',{customerName:'가상',phone:'1'},{customers}).ok,false);
 assert.equal(executeTool('getCustomerInfo',{customerName:'가상'},{customers}).ok,false);
 assert.equal(executeTool('updateCustomer',{customerId:2,phone:'1'},{customers}).data.params.customerId,2);
 const bulk = executeTool('bulkUpdateCustomer',{updates:[{customerName:'가상',phone:'1'}]},{customers});
 assert.ok(!bulk.ok || bulk.data.params.missing.length);
});
test('화면 이동·엉뚱한 보관함 조회는 주문 변경 근거가 아니다',()=>{
 const pending={ok:true,data:{__pending:true,action:'updateOrderContact',params:{orderId:'ORDER-TEST',phone:'1'}}};
 for(const call of [{name:'navigatePage',result:{ok:true}},{name:'readLibrary',args:{library:'products'},result:{ok:true}}]) assert.equal(validatePending(pending,[call]).ok,false);
 assert.equal(validatePending(pending,[{name:'getRecord',args:{library:'orders'},result:{ok:true}}]).ok,true);
});
test('확인 대기 작업이 있으면 자동 화면 이동을 막는다',()=>{
 const calls=[{result:{ok:true,data:{__navigate:true,page:'orders',label:'주문내역'}}}];
 assert.ok(turnNavigation(calls,true).notice);
 assert.equal(turnNavigation(calls,true).page,undefined);
 assert.equal(turnNavigation(calls,false).page,'orders');
});
test('정확한 ID 조회와 진단은 빈 자료·실패·부분 로드를 구분한다',()=>{
 assert.equal(executeDataTool('getRecord',{library:'orders',id:'ORDER-TEST'},{orders}).data.record.id,'ORDER-TEST');
 assert.equal(executeDataTool('getRecord',{library:'orders',id:'ORDER'},{orders}).ok,false);
 assert.equal(executeDataTool('getRecord',{library:'orders',id:'ORDER-TEST'},{orders,dataState:{orders:{status:'error'}}}).ok,false);
 assert.ok(executeDataTool('getSystemHealth',{}, {dataState:{orders:{status:'loaded',coverage:'partial'}}}).data.needsAttention.includes('orders'));
});
test('빈 저장 응답을 성공으로 처리하지 않고 메모 재조회 불일치를 차단한다',async()=>{
 for(const v of [null,true,[],{}]) assert.equal(isPersistedResult(v),false);
 const client={from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:'ORDER-TEST',memo:'old'}})})})})};
 await assert.rejects(commitOrderMemo({orderId:'ORDER-TEST',memo:'new'},{updateOrder:async()=>[{id:'ORDER-TEST'}]},client),/재조회/);
});
test('입금 잔액·금액·중복 정산 레코드를 재조회로 검증한다',async()=>{
 for(const rows of [[],[{id:1,balance:10,total_amount:100,paid_amount:90}],[{id:1,balance:0,total_amount:100,paid_amount:100},{id:2,balance:0}]]) {
 const client={from:()=>({select:()=>({eq:()=>({limit:async()=>({data:rows})})})})};
 await assert.rejects(verifyOrderPaid('ORDER-TEST',client));
 }
});
test('실제 정산 함수가 입금 이력 저장 실패 후 금액을 올리지 않는다',async()=>{
 let updated=0;
 const api={...supabase,getPaymentRecord:async()=>null,getPaymentRecords:async()=>[{id:1,balance:100,paid_amount:0}],addPaymentHistory:async()=>null,updatePaymentRecord:async()=>{updated++;return{id:1};}};
 const result=await api.syncOrderPaidRecord('ORDER-TEST','transfer',orders[0],customers);
 assert.equal(result.success,false);assert.equal(result.reason,'history_save_failed');assert.equal(updated,0);
 api.addPaymentHistory=async()=>[{id:5}];api.updatePaymentRecord=async()=>null;
 assert.equal((await api.syncOrderPaidRecord('ORDER-TEST','transfer',orders[0],customers)).reason,'partial_payment');
 api.getPaymentRecord=async()=>({id:1,paid_amount:150,balance:-50});
 const refreshed=await api.syncOrderPaidRecord('ORDER-TEST','transfer',orders[0],customers);
 assert.equal(refreshed.record.paid_amount,150);assert.equal(updated,0);
});
import { navigationBlocked } from '../src/lib/movisReliability.js';
test('확인 대기 뒤 화면 이동 도구에는 실행하지 않았다는 결과를 반환한다',()=>{
 const calls=[{name:'updateOrderMemo',result:{ok:true,data:{__pending:true}}}];
 assert.equal(navigationBlocked('navigatePage',calls).ok,false);
 assert.match(navigationBlocked('navigatePage',calls).error,/실행하지 않았습니다/);
 assert.equal(navigationBlocked('getRecord',calls),null);
 assert.equal(navigationBlocked('navigatePage',[]),null);
});
