// 운영 자료는 메모리에서만 비교한다. GET만 사용하며 개인정보 없이 불일치 거래 식별자와 금액만 출력한다.
import { readFileSync } from 'node:fs';
import { calculateInvoice, enrichInvoiceRecords, partitionInvoiceRecords, kstDate } from '../src/lib/invoiceLedger.js';
const source = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8');
const base = source.match(/SUPABASE_URL = '([^']+)'/)[1];
const key = source.match(/SUPABASE_ANON_KEY = '([^']+)'/)[1];
const headers = { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' };
async function read(table, select) {
  const all = []; let count;
  for (let offset = 0; ; offset += 500) {
    const response = await fetch(`${base}/rest/v1/${table}?select=${select}&order=id.asc&offset=${offset}&limit=500`, { headers });
    if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
    count = Number(response.headers.get('content-range')?.split('/')[1]);
    const rows = await response.json(); all.push(...rows);
    if (rows.length < 500) break;
  }
  if (Number.isFinite(count) && all.length !== count) throw new Error(`${table}: incomplete read`);
  return all;
}
const [records, history, orders] = await Promise.all([
  read('payment_records', 'id,order_id,customer_id,total_amount,supply_amount,vat_amount,paid_amount,balance,invoice_date,created_at'),
  read('payment_history', 'id,payment_record_id,amount,type,paid_at'),
  read('orders', 'id,total,total_returned,created_at,items'),
]);
const byOrder = new Map(orders.map(o => [String(o.id), o]));
const byRecord = new Map(records.map(r => [String(r.id), r]));
const sum = new Map();
for (const h of history) sum.set(String(h.payment_record_id), (sum.get(String(h.payment_record_id)) || 0) + (h.type === 'expense' ? -1 : 1) * Number(h.amount));
const orderCounts = new Map();
for (const r of records) if(r.order_id) orderCounts.set(String(r.order_id), (orderCounts.get(String(r.order_id)) || 0) + 1);
const report = {
  checkedAt: new Date().toISOString(), readOnly: true,
  counts: { records: records.length, history: history.length, orders: orders.length },
  invalidPayments: history.filter(h => !Number.isSafeInteger(Number(h.amount)) || Number(h.amount) <= 0 || !['income','expense'].includes(h.type)).length,
  orphanHistory: history.filter(h => !byRecord.has(String(h.payment_record_id))).length,
  paidMismatch: records.filter(r => Number(r.paid_amount) !== (sum.get(String(r.id)) || 0)).length,
  balanceMismatch: records.filter(r => Number(r.balance) !== Number(r.total_amount) - Number(r.paid_amount)).length,
  taxTotalMismatch: records.filter(r => Number(r.supply_amount) + Number(r.vat_amount) !== Number(r.total_amount)).length,
  duplicatedOrderLinks: [...orderCounts.values()].filter(n => n > 1).length,
  orderAmountMismatch: records.filter(r => byOrder.has(String(r.order_id)) && Number(r.total_amount) !== Number(byOrder.get(String(r.order_id)).total) - Number(byOrder.get(String(r.order_id)).total_returned || 0)).length,
  negativeBalances: records.filter(r => Number(r.balance) < 0).length,
  missingInvoiceDates: records.filter(r => !r.invoice_date).length,
  withoutLinkedOrder: records.filter(r => !byOrder.has(String(r.order_id))).length,
  ordersWithoutRecords: orders.filter(o => !orderCounts.has(String(o.id)) && Number(o.total) - Number(o.total_returned || 0) > 0).length,
  returnedOrders: orders.filter(o => Number(o.total_returned) > 0).length,
};
console.log(JSON.stringify(report, null, 2));

let calculationFailures = 0, carryoverFailures = 0;
const enriched = enrichInvoiceRecords(records, orders, []);
for (const r of enriched) {
  try {
    if (calculateInvoice([r], []).totals.grandBalance !== Number(r.balance)) calculationFailures++;
    const {current,carryover} = partitionInvoiceRecords([r], {from:kstDate(),to:kstDate()});
    if (calculateInvoice(current,carryover).totals.grandBalance !== calculateInvoice(current,carryover,new Set(carryover.map(x=>x.invoice_date))).totals.grandBalance) carryoverFailures++;
  } catch { calculationFailures++; }
}
console.log(JSON.stringify({calculatedRecords:enriched.length,calculationFailures,carryoverFailures,orderDifferences:records.filter(r=>byOrder.has(String(r.order_id)) && Number(r.total_amount)!==Number(byOrder.get(String(r.order_id)).total)-Number(byOrder.get(String(r.order_id)).total_returned||0)).map(r=>({recordId:r.id,orderId:r.order_id,ledgerTotal:Number(r.total_amount),orderNet:Number(byOrder.get(String(r.order_id)).total)-Number(byOrder.get(String(r.order_id)).total_returned||0),returned:Number(byOrder.get(String(r.order_id)).total_returned||0)}))},null,2));
