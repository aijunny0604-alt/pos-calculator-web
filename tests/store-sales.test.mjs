import test from 'node:test';
import assert from 'node:assert/strict';
import { kstDay, summarizeStoreSales, storeSalesOrdersUrl } from '../src/lib/storeSales.js';
import { fetchPosRows } from '../src/lib/posConnection.js';

const order = (id,status='PAYED',more={}) => ({id,provider:'naver',order_status:status,received_at:'2026-10-20T15:30:00Z',...more});
const item = po => ({raw_payload:{productOrder:po}});
test('조회 종료일은 한국시간 다음 날 미만이며 윤일과 잘못된 날짜를 처리한다',()=>{
 const params=new URL(storeSalesOrdersUrl('https://example.com','2024-02-01','2024-02-29')).searchParams;
 assert.deepEqual(params.getAll('received_at'),['gte.2024-02-01T00:00:00+09:00','lt.2024-03-01T00:00:00+09:00']);
 assert.throws(()=>storeSalesOrdersUrl('https://example.com','2026-02-30','2026-03-01'));
 assert.throws(()=>storeSalesOrdersUrl('https://example.com','2026-03-01','2026-02-28'));
});
test('기간 주문이 500건을 넘어도 나머지 페이지를 모두 조회한다',async()=>{
 const url=storeSalesOrdersUrl('https://example.com','2026-01-01','2026-01-31');
 const fixture=Array.from({length:620},(_,index)=>({id:index}));
 const fetcher=async address=>{const params=new URL(address).searchParams,offset=Number(params.get('offset')),limit=Number(params.get('limit'));return new Response(JSON.stringify(fixture.slice(offset,offset+limit)),{headers:{'content-range':`${offset}-${Math.min(offset+limit,620)-1}/620`}});};
 const rows=await fetchPosRows(url,{},fetcher);assert.equal(rows.length,620);assert.equal(rows.at(-1).id,619);
});
test('한국 시간 기준 상품별 잔여금액을 우선하고 부분 반품 금액을 유지한다',()=>{
 const result=summarizeStoreSales([order('one')],{one:[item({remainPaymentAmount:6000,totalPaymentAmount:10000,claimStatus:'RETURN_DONE'}),item({remainPaymentAmount:12000})]});
 assert.equal(kstDay('2026-10-20T15:30:00Z'),'2026-10-21');
 assert.equal(result.total,18000);assert.equal(result.claims,1);assert.equal(result.days[0].date,'2026-10-21');
});
test('미결제·취소 및 다른 마켓 제외, 초기금액과 누락금액 분리',()=>{
 const orders=[order('paid'),order('pending','PAYMENT_WAITING'),order('canceled','CANCELED'),order('other','PAYED',{provider:'mock'})];
 const result=summarizeStoreSales(orders,{paid:[item({totalPaymentAmount:11000}),item({claimStatus:'RETURN_REQUEST',totalPaymentAmount:2000}),{}],canceled:[item({productOrderStatus:'CANCELED',totalPaymentAmount:4000})]});
 assert.equal(result.total,11000);assert.equal(result.initial,1);assert.equal(result.missing,2);assert.equal(result.unpaid,1);assert.equal(result.canceledCount,1);assert.equal(result.claims,1);
});
test('동일 주문에 취소와 정상 상품이 섞여도 정상 상품을 잃지 않는다',()=>{
 const result=summarizeStoreSales([order('mixed','CANCELED')],{mixed:[item({productOrderStatus:'CANCELED',remainPaymentAmount:0}),item({productOrderStatus:'PAYED',remainPaymentAmount:5000})]});
 assert.equal(result.total,5000);assert.equal(result.missing,0);
});
test('금액 누락은 0으로 위장하지 않으며 잘못된 숫자를 합산하지 않는다',()=>{
 const result=summarizeStoreSales([order('x'),order('y')],{x:[item({remainPaymentAmount:null,totalPaymentAmount:'-1'})],y:[]});
 assert.equal(result.total,0);assert.equal(result.missing,2);assert.equal(result.products,0);
});
test('종결 상태와 잔여 금액이 충돌하면 매출에 포함하지 않고 확인 대상으로 남긴다',()=>{
 const result=summarizeStoreSales([order('x')],{x:[item({productOrderStatus:'CANCELED',remainPaymentAmount:10000})]});
 assert.equal(result.total,0);assert.equal(result.missing,1);
});
test('여러 상품 주문의 취소 상태가 불명확할 때 최초 금액을 매출로 단정하지 않는다',()=>{
 const result=summarizeStoreSales([order('x','CANCELED')],{x:[item({totalPaymentAmount:8000}),item({productOrderStatus:'PAYED',remainPaymentAmount:5000})]});
 assert.equal(result.total,5000);assert.equal(result.missing,1);
});
