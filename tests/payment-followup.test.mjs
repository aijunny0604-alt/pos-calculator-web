import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { resolvePaymentCustomer, customerOrders } from '../src/lib/paymentIdentity.js';
import { runManualPaidChange } from '../src/lib/manualPaidWorkflow.js';
import { enrichInvoiceRecords, orderPaymentPayload } from '../src/lib/invoiceLedger.js';
buildSync({entryPoints:['src/lib/supabase.js'],bundle:true,platform:'node',format:'esm',outfile:'tests/.artifacts/payment-followup-db.mjs',logLevel:'silent'});
const {supabase} = await import('./.artifacts/payment-followup-db.mjs');
const customers=[{id:1,name:'업체',phone:'01011111111'},{id:2,name:'업체',phone:'01022222222'},{id:3,name:'별도업체',phone:'01011111111'}];
const order={id:'ORDER',customer_id:1,customer_name:'업체',total:11000,created_at:'2026-09-30T15:01:00Z',items:[{name:'상품',price:11000,quantity:1}]};
const record={id:1,order_id:'ORDER',customer_id:1,total_amount:11000,paid_amount:0,balance:11000};
const api=patch=>({...supabase,getOrderById:async()=>order,getCustomers:async()=>customers,getPaymentRecords:async()=>[{...record}],
  getPaymentHistory:async()=>[],addPaymentHistory:async()=>[{id:5}],getPaymentRecord:async()=>({...record,paid_amount:11000,balance:0}),...patch});

test('금액 연결은 명시 ID 우선, 동명이인/공유 번호/이름과 번호 충돌은 임의 배정하지 않는다',()=>{
  assert.equal(resolvePaymentCustomer({customer_id:2,customer_name:'별도업체'},customers).id,2);
  assert.equal(resolvePaymentCustomer({customer_id:99,customer_name:'별도업체'},customers),null);
  assert.equal(resolvePaymentCustomer({customer_name:'업체'},customers),null);
  assert.equal(resolvePaymentCustomer({customer_phone:'010-1111-1111'},customers),null);
  assert.equal(resolvePaymentCustomer({customer_name:'업체',customer_phone:'010-2222-2222'},customers).id,2);
  assert.equal(resolvePaymentCustomer({customer_name:'별도업체',customer_phone:'010-2222-2222'},customers),null);
});
test('업체 이력에는 다른 업체 명시 ID 또는 다른 원장의 주문을 이름으로 끌어오지 않는다',()=>{
  const orders=[order,{...order,id:'OTHER',customer_id:2},{id:'LINKED',customer_name:'업체'}, {id:'AMBIGUOUS',customer_name:'업체'}];
  const records=[record,{order_id:'LINKED',customer_id:2}];
  assert.deepEqual(customerOrders(customers[0],orders,records,customers).map(o=>o.id),['ORDER']);
});
test('완불 표시만 있는 가상 주문과 양수 잔액 원장은 확인 대상으로 표시한다',()=>{
  const markers=[{order_id:'ORDER'}];
  assert.equal(enrichInvoiceRecords([], [order],customers,markers)[0]._manualPaidMismatch,true);
  assert.equal(enrichInvoiceRecords([record],[order],customers,markers)[0]._manualPaidMismatch,true);
  assert.equal(enrichInvoiceRecords([{...record,balance:0}],[order],customers,markers)[0]._manualPaidMismatch,false);
});
test('신규 원장 세액은 혼합 면세·KST 날짜를 보존하고 반품 신규 원장은 자동 생성하지 않는다',()=>{
  const payload=orderPaymentPayload({...order,total:16000,items:[...order.items,{price:5000,quantity:1,taxFree:true}]},1);
  assert.equal(payload.supply_amount,15000);assert.equal(payload.vat_amount,1000);assert.equal(payload.invoice_date,'2026-10-01');
  assert.equal(orderPaymentPayload({...order,items:[{price:11000,quantity:1,taxFree:true}]},1).vat_amount,0);
  assert.throws(()=>orderPaymentPayload({...order,total_returned:1000},1),/반품/);
});
test('완불 저장은 최신 주문과 원장 금액·업체·중복 연결을 확인한 뒤에만 입금한다',async()=>{
  for(const [records,reason] of [
    [[{...record,total_amount:10000,balance:10000}],'order_ledger_mismatch'],
    [[{...record,customer_id:2}],'order_ledger_mismatch'],
    [[record,{...record,id:2}],'duplicate_records'],
  ]) {
    let writes=0;const client=api({getPaymentRecords:async()=>records,addPaymentHistory:async()=>{writes++;}});
    assert.equal((await client.syncOrderPaidRecord('ORDER','cash',{...order,total:1},customers.slice(0,1))).reason,reason);assert.equal(writes,0);
  }
  let paid=0;const client=api({addPaymentHistory:async h=>{paid=h.amount;return[{id:5}];}});
  assert.equal((await client.syncOrderPaidRecord('ORDER','cash',{...order,total:1})).success,true);assert.equal(paid,11000);
});
test('저장 후 재조회 잔액이 남거나 결과가 없으면 완불 성공으로 응답하지 않는다',async()=>{
  for(const refreshed of [null,{...record,paid_amount:1000,balance:10000}]) {
    assert.equal((await api({getPaymentRecord:async()=>refreshed}).syncOrderPaidRecord('ORDER','cash')).reason,'partial_payment');
  }
});
test('결제수단 변경은 자동 이력만 바꾸고 추가 입금하지 않는다',async()=>{
  let writes=0;const updated=[];
  const client=api({getPaymentRecords:async()=>[{...record,paid_amount:11000,balance:0}],addPaymentHistory:async()=>{writes++;},
    getPaymentHistory:async()=>[{id:5,memo:'[자동] 완불체크 (현금)',method:'cash'},{id:6,memo:'수기 입금',method:'cash'}],
    updatePaymentHistory:async(id,patch)=>{updated.push(id);return {id,...patch};}});
  assert.equal((await client.syncOrderPaidRecord('ORDER','card')).success,true);assert.equal(writes,0);assert.deepEqual(updated,[5]);
});
test('입금 실패 시 완불 마커를 저장하지 않고 동일 결제수단 재시도를 수행한다',async()=>{
  let calls=0,marks=0;
  const client={syncOrderPaidRecord:async()=>++calls===1?{success:false,reason:'history_save_failed'}:{success:true},upsertManualPaid:async()=>{marks++;return{order_id:'RETRY',method:'cash'};}};
  assert.equal((await runManualPaidChange(client,'RETRY','cash')).success,false);assert.equal(marks,0);
  assert.equal((await runManualPaidChange(client,'RETRY','cash')).success,true);assert.equal(calls,2);assert.equal(marks,1);
});
test('완불 표시 저장 실패와 취소 실패를 성공으로 처리하지 않는다',async()=>{
  const markerFail=await runManualPaidChange({syncOrderPaidRecord:async()=>({success:true}),upsertManualPaid:async()=>null},'M','cash');
  assert.equal(markerFail.reason,'marker_save_failed');
  let removed=0;
  const revokeFail=await runManualPaidChange({revokeAutoPaidHistory:async()=>false,deleteManualPaid:async()=>{removed++;}},'C',null);
  assert.equal(revokeFail.reason,'revoke_failed');assert.equal(removed,0);
  assert.equal((await runManualPaidChange({revokeAutoPaidHistory:async()=>true,deleteManualPaid:async()=>false},'C',null)).reason,'marker_delete_failed');
});
test('같은 주문의 연속 완불/취소 호출은 중복 저장하지 않는다',async()=>{
  let release,calls=0;const client={syncOrderPaidRecord:async()=>{calls++;await new Promise(r=>release=r);return{success:true};},upsertManualPaid:async()=>({order_id:'LOCK',method:'cash'})};
  const first=runManualPaidChange(client,'LOCK','cash');
  assert.equal((await runManualPaidChange(client,'LOCK','cash')).reason,'busy');
  assert.equal((await runManualPaidChange(client,'LOCK',null)).reason,'busy');
  release();assert.equal((await first).success,true);assert.equal(calls,1);
});
test('일괄 동기화는 완불·반품을 미수로 재생성하지 않고 장바구니를 제외한다',async t=>{
  const posted=[];t.mock.method(globalThis,'fetch',async(url,opts)=>{
    assert.equal(opts.method,'POST');const rows=JSON.parse(opts.body);posted.push(...rows);
    return new Response(JSON.stringify(rows.map((r,i)=>({...r,id:i+1}))));
  });
  const client=api({getOrders:async()=>[order,{...order,id:'PAID'},{...order,id:'RETURN',total_returned:1000}],getPaymentRecords:async()=>[],
    getManualPaidAll:async()=>[{order_id:'PAID'}],syncSavedCartsToPaymentRecords:async()=>{throw new Error('초안 청구 금지');}});
  const result=await client.syncAllToPaymentRecords();assert.equal(result.totalInserted,1);assert.equal(result.orders.skippedNeedsReview,2);
  assert.equal(posted[0].supply_amount,10000);assert.equal(posted[0].vat_amount,1000);assert.equal(posted[0].order_id,'ORDER');
});
