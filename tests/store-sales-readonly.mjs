// 운영 데이터 읽기 전용 진단. 주문자·상품·금액 등은 출력하지 않는다.
import {build} from 'esbuild';
import {mkdirSync} from 'node:fs';
import {summarizeStoreSales,kstDay} from '../src/lib/storeSales.js';
mkdirSync('tests/.artifacts',{recursive:true});
await build({entryPoints:['src/lib/supabase.js'],bundle:true,platform:'node',format:'esm',outfile:'tests/.artifacts/store-sales-db.mjs',logLevel:'silent'});
const {supabase}=await import('./.artifacts/store-sales-db.mjs');
const end=kstDay(new Date()), start=`${end.slice(0,7)}-01`;
const orders=await supabase.getStoreSalesOrders(start,end);
const items=await supabase.getExternalOrderItemsByOrders(orders.map(order=>order.id),{strict:true});
const result=summarizeStoreSales(orders,items);
let orderDateComparable=0,orderDateMismatch=0;
for(const order of orders){const source=order.raw_payload?.order?.orderDate || (items[order.id]||[]).find(item=>item.raw_payload?.order?.orderDate)?.raw_payload?.order?.orderDate;if(source){orderDateComparable++;if(kstDay(source)!==kstDay(order.received_at))orderDateMismatch++;}}
console.log(JSON.stringify({orders:orders.length,pricedProducts:result.products,initialFallback:result.initial,missing:result.missing,claims:result.claims,unpaid:result.unpaid,orderDateComparable,orderDateMismatch}));
