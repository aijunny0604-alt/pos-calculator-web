import test from 'node:test';
import assert from 'node:assert/strict';
import { getOverdueCustomers, getPaymentInflow } from '../src/lib/analytics/payments.js';

test('미수 분석은 업체 ID로 묶고 같은 업체의 선입금만 차감한다', () => {
  const records = [
    {id:1,customer_id:1,customer_name:'동일 상호',balance:100,invoice_date:'2026-01-01'},
    {id:2,customer_id:'1',customer_name:'동일 상호',balance:-30,invoice_date:'2026-01-02'},
    {id:3,customer_id:2,customer_name:'동일 상호',balance:50,invoice_date:'2026-01-02'},
    {id:4,customer_id:3,balance:-200,invoice_date:'2026-01-02'},
  ];
  const result = getOverdueCustomers(records);
  assert.equal(result.total, 2);
  assert.deepEqual(result.results.map(r=>r.totalBalance), [70,50]);
});

test('입출금 분석에서 환불은 합계와 결제 수단별 금액을 차감한다', () => {
  const result = getPaymentInflow([
    {amount:100,type:'income',method:'현금',paid_at:'2026-01-01'},
    {amount:30,type:'expense',method:'현금',paid_at:'2026-01-02'},
  ], {period:'ALL'});
  assert.equal(result.totalAmount,70);
  assert.equal(result.byMethod[0].amount,70);
  assert.equal(result.recent[1].amount,-30);
});
