// 명세서 회귀 검증용 가상 자료. 외부 저장은 network.js에서 차단한다.
import { kstDate } from '../lib/invoiceLedger';
const today = kstDate();
const previous = new Date(new Date(today + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
export function invoiceFixture(mode = false) {
  const record = (id, total, paid, date, orderId) => ({id,customer_id:1,order_id:orderId,total_amount:total,paid_amount:paid,balance:total-paid,invoice_date:date,created_at:date+'T00:00:00Z'});
  const mismatch = mode === 'mismatch';
  const fixture = {
    customers:[{id:1,name:'명세서 검증용 업체',phone:'010-0000-0000'}],
    orders:[{id:'CHECK-1',total:110000,created_at:previous+'T00:00:00Z',items:[{name:'이월 상품',quantity:1,price:110000}]},
      {id:'CHECK-2',total:30000,created_at:previous+'T00:00:00Z',items:[{name:'선입금 상품',quantity:1,price:30000}]},
      {id:'CHECK-3',total:mismatch?65000:55000,created_at:today+'T00:00:00Z',items:[{name:'당일 상품',quantity:1,price:55000}]}],
    payment_records:[record(901,110000,40000,previous,'CHECK-1'),record(902,30000,50000,previous,'CHECK-2'),record(903,55000,5000,today,'CHECK-3'),{...record(904,33000,0,today,null),memo:'수기 명세서',supply_amount:30000,vat_amount:3000}],
    manual_paid_orders:[],
    payment_history:[{id:1,payment_record_id:901,amount:40000,type:'income'},{id:2,payment_record_id:902,amount:50000,type:'income'},{id:3,payment_record_id:903,amount:7000,type:'income'},{id:4,payment_record_id:903,amount:2000,type:'expense'}],
  };
  if (mode === 'paid') {
    fixture.orders.push({id:'PAID-NO-LEDGER',customer_id:1,total:22000,created_at:today+'T00:00:00Z',items:[{name:'입금 확인 필요 샘플',quantity:1,price:22000}]});
    fixture.manual_paid_orders.push({order_id:'PAID-NO-LEDGER',method:'cash'});
  }
  return fixture;
}
