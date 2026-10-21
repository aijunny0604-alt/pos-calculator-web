import test from 'node:test';
import assert from 'node:assert/strict';
import { kstDate, signedPaymentAmount, customerBalanceSummary, enrichInvoiceRecords, partitionInvoiceRecords, calculateInvoice } from '../src/lib/invoiceLedger.js';
const rec = (id, total, paid, date, extra = {}) => ({ id, total_amount: total, paid_amount: paid, balance: total - paid, invoice_date: date, ...extra });

test('이월 선택·해제는 부분입금과 선입금을 포함한 최종 잔액을 바꾸지 않는다', () => {
  const current = [rec(1, 110000, 40000, '2026-10-21', { items: [{ name: '상품', quantity: 1, price: 110000 }] })];
  const prior = [rec(2, 220000, 100000, '2026-09-30'), rec(3, 11000, 16000, '2026-09-20')];
  for (const selected of [[], ['2026-09-30'], ['2026-09-20'], ['2026-09-30', '2026-09-20']]) {
    assert.equal(calculateInvoice(current, prior, new Set(selected)).totals.grandBalance, 185000);
  }
});
test('품목 없는 수기 명세서도 청구 금액·과세/비과세가 누락되지 않는다', () => {
  const { lines, totals } = calculateInvoice([rec(1,110000,10000,'2026-10-21',{supply_amount:100000,vat_amount:10000}), rec(2,7000,0,'2026-10-21',{is_vat_exempt:true})], []);
  assert.equal(lines.length, 2); assert.equal(totals.supply, 107000); assert.equal(totals.vat, 10000); assert.equal(totals.grandBalance, 107000);
});
test('부분반품·전액반품·할인 금액을 원장 기준 조정 행으로 표시한다', () => {
  for (const [total, paid] of [[88000,50000],[0,110000],[99000,0]]) {
    const r = rec(1,total,paid,'2026-10-21',{items:[{name:'상품',quantity:2,price:55000}]});
    const result = calculateInvoice([r], []);
    assert.equal(result.totals.grandBalance, total-paid);
    assert.equal(result.lines.at(-1).locked,true);
  }
});
test('품목별 반올림과 저장 세액의 1원 차이도 합계가 일치한다', () => {
  const result = calculateInvoice([rec(1,12,0,'2026-10-21',{supply_amount:11,vat_amount:1,items:[{price:6,quantity:1},{price:6,quantity:1}]})],[]);
  assert.equal(result.totals.supply,11); assert.equal(result.totals.vat,1); assert.equal(result.totals.grandBalance,12);
});
test('인쇄용 변경과 실제 원장 잔액을 분리하며 0원 단가는 유지한다', () => {
  const r=rec(1,10000,2000,'2026-10-21',{items:[{name:'상품',quantity:1,price:10000}]});
  const edited=calculateInvoice([r],[],new Set(),{'1:0':{unitWithVat:5000,qty:2}});
  assert.equal(edited.totals.grandBalance,8000);
  const zero=calculateInvoice([r],[],new Set(),{'1:0':{unitWithVat:0}});
  assert.equal(zero.totals.grandBalance,-2000); assert.equal(zero.totals.ledgerBalance,8000); assert.equal(zero.totals.displayAdjustment,-10000);
  assert.throws(()=>calculateInvoice([r],[],new Set(),{'1:0':{qty:0}}));
  assert.throws(()=>calculateInvoice([r],[],new Set(),{'1:0':{qty:-1}}));
});
test('월/연 경계, 자정은 한국 시간으로 구분한다', () => {
  assert.equal(kstDate('2026-09-30T15:00:00Z'),'2026-10-01');
  assert.equal(kstDate('2026-12-31T15:00:00Z'),'2027-01-01');
  const data=[rec(1,100,20,'2026-09-30'),rec(2,50,80,'2026-09-29'),rec(3,50,50,'2026-09-28'),rec(4,70,0,'2026-10-01'),rec(5,70,0,'2026-10-22'),rec(6,70,0,null,{created_at:'2026-09-25T01:00:00Z'})];
  const result=partitionInvoiceRecords(data,{from:'2026-10-01',to:'2026-10-21'});
  assert.deepEqual(result.current.map(r=>r.id),[4]);assert.deepEqual(result.carryover.map(r=>r.id),[1,2,6]);
});
test('기존 명세서는 중복 추가하지 않고 주문 차액을 감지한다',()=>{
  const orders=[{id:'a',total:100000,total_returned:10000,items:[]},{id:'b',total:50000,created_at:'2026-09-30T15:01:00Z',customer_name:'업체',items:[]}];
  const result=enrichInvoiceRecords([{...rec(1,100000,100000,'2026-10-01'),order_id:'a'}],orders,[{id:7,name:'업체'}]);
  assert.equal(result.length,2);assert.equal(result[0]._orderMismatch,true);assert.equal(result[0].total_amount,100000);
  assert.equal(result[1].customer_id,7);assert.equal(result[1].invoice_date,'2026-10-01');
});
test('동명이인·공유 전화번호는 거래처를 임의 배정하지 않는다',()=>{
  const records=enrichInvoiceRecords([],[{id:1,total:100,customer_name:'업체',customer_phone:'010-0000-0000'}],[{id:1,name:'업체',phone:'01000000000'},{id:2,name:'업체',phone:'01000000000'}]);
  assert.equal(records[0].customer_id,null);assert.equal(records[0].customer_name,'업체');
});
test('순입금은 입금에서 환불 출금을 차감한다',()=>{
  assert.equal([{amount:100,type:'income'},{amount:30,type:'expense'}].reduce((a,h)=>a+signedPaymentAmount(h),0),70);
});

test('선입금은 같은 업체의 미수만 차감하고 다른 업체와 상계하지 않는다',()=>{
  const summary = customerBalanceSummary([
    {id:1,customer_id:1,balance:100},{id:2,customer_id:'1',balance:-30},
    {id:3,customer_id:2,balance:-200},{id:4,customer_id:3,balance:50},
    {id:5,customer_id:null,balance:-100},{id:6,customer_id:null,balance:40},
  ]);
  assert.equal(summary.byCustomer.get('1'),70);
  assert.equal(summary.receivable,160);
  assert.equal(summary.credit,300);
});
test('연속 기간 이월과 무작위 부분입금/환불 200조합에서 보존식이 성립한다',()=>{
  for(let i=1;i<=200;i++) {
    const rows=[rec(1,i*100,i*77,'2026-08-15'),rec(2,i*50,i*61,'2026-09-15'),rec(3,i*70,-i*3,'2026-10-01')];
    const expected=rows.reduce((s,r)=>s+r.balance,0);
    for(const from of ['2026-09-01','2026-10-01','2026-11-01']) {
      const {current,carryover}=partitionInvoiceRecords(rows,{from,to:'2026-12-31'});
      for(const dates of [new Set(),new Set(carryover.map(r=>r.invoice_date))]) assert.equal(calculateInvoice(current,carryover,dates).totals.grandBalance,expected);
    }
  }
});
