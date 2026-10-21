// 운영 조회 전용: 요청은 GET만, 개인 정보는 출력하지 않는다.
import { readFileSync } from 'node:fs';
import { fetchPosRows } from '../src/lib/posConnection.js';
const source = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8');
const base = source.match(/SUPABASE_URL = '([^']+)'/)[1];
const key = source.match(/SUPABASE_ANON_KEY = '([^']+)'/)[1];
const read = (table, select, order='id.asc') => fetchPosRows(`${base}/rest/v1/${table}?select=${select}&order=${order}`, {headers:{apikey:key,Authorization:`Bearer ${key}`}});
const [markers, records, orders, customers] = await Promise.all([
  read('manual_paid_orders','order_id,method','order_id.asc'),
  read('payment_records','id,order_id,customer_id,total_amount,paid_amount,balance'),
  read('orders','id,total,total_returned,customer_name,customer_phone'),
  read('customers','id,name,phone'),
]);
const byOrder = new Map(records.map(r=>[String(r.order_id),r]));
const ids = new Set(orders.map(o=>String(o.id)));
const names = new Map(), phones = new Map();
for(const c of customers) {
  const n=c.name?.trim(), p=String(c.phone||'').replace(/\D/g,'');
  if(n) names.set(n,(names.get(n)||0)+1);
  if(p) phones.set(p,(phones.get(p)||0)+1);
}
console.log(JSON.stringify({checkedAt:new Date().toISOString(),readOnly:true,
  markers:markers.length,records:records.length,orders:orders.length,customers:customers.length,
  markedWithoutLedger:markers.filter(m=>ids.has(String(m.order_id))&&!byOrder.has(String(m.order_id))).length,
  markedWithoutLedgerPositive:markers.filter(m=>orders.some(o=>String(o.id)===String(m.order_id)&&Number(o.total)-Number(o.total_returned||0)>0)&&!byOrder.has(String(m.order_id))).length,
  markedWithOutstanding:markers.filter(m=>Number(byOrder.get(String(m.order_id))?.balance)>0).length,
  markedWithoutOrder:markers.filter(m=>!ids.has(String(m.order_id))).length,
  duplicatedCustomerNames:[...names.values()].filter(n=>n>1).length,
  sharedCustomerPhones:[...phones.values()].filter(n=>n>1).length,
  ordersWithAmbiguousName:orders.filter(o=>(names.get(o.customer_name?.trim())||0)>1).length,
},null,2));
