import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshDeliveryStatuses,createDeliveryRefresher} from '../bridge/naver-delivery-refresh.mjs';
import {storeOrderStatus} from '../src/lib/storeOrderView.js';

const sample=(id,status='DELIVERING')=>({id,external_order_id:`o-${id}`,provider_product_order_id:`p-${id}`,detail_fetched_at:'2026-10-21T00:00:00Z',raw_payload:{productOrder:{productOrderId:`p-${id}`,productOrderStatus:status,remainPaymentAmount:10000},order:{unchanged:true}}});
const parent=item=>({id:item.external_order_id,provider:'naver',provider_order_id:`order-${item.id}`,order_status:'shipped'});
const detail=(item,status='DELIVERED')=>({order:{orderId:`order-${item.id}`},productOrder:{productOrderId:item.provider_product_order_id,productOrderStatus:status}});
const setup=items=>{const patches=[];return {patches,loadCandidates:async()=>items,loadParents:async()=>items.map(parent),fetchDetails:async()=>Object.fromEntries(items.map(item=>[item.provider_product_order_id,detail(item)])),patchItem:async(item,patch)=>{patches.push({item,patch});return true;}};};
test('네이버 배송완료 8건만 기존 데이터와 금액을 보존하며 반영한다',async()=>{
 const items=Array.from({length:8},(_,i)=>sample(String(i))),deps=setup(items);
 const result=await refreshDeliveryStatuses({...deps,now:Date.parse('2026-10-28T00:00:00Z')});
 assert.equal(result.updated,8);assert.equal(deps.patches.length,8);
 for(const {item,patch} of deps.patches){assert.equal(item.raw_payload.productOrder.productOrderStatus,'DELIVERING');assert.equal(patch.raw_payload.productOrder.remainPaymentAmount,10000);assert.deepEqual(patch.raw_payload.order,{unchanged:true});assert.equal(storeOrderStatus(parent(item),[{raw_payload:patch.raw_payload}]),'DELIVERED');}
});
test('부분 배송은 모든 활성 상품이 완료될 때만 주문 전체를 완료로 표시한다',()=>{
 const a=sample('a'),b=sample('b');a.raw_payload.productOrder.productOrderStatus='DELIVERED';
 assert.equal(storeOrderStatus(parent(a),[a,b]),'DELIVERING');
});
test('다른 주문·클레임·취소·매칭되지 않은 상품에는 쓰지 않는다',async()=>{
 const items=['a','b','c','d','e'].map(id=>sample(id)),deps=setup(items);
 items[1].raw_payload.productOrder.claimStatus='RETURN_REQUEST';
 deps.loadParents=async()=>items.map((item,index)=>({...parent(item),...(index===2?{provider:'mock'}:{}),...(index===3?{order_status:'CANCELED'}:{})}));
 deps.fetchDetails=async()=>({ 'p-a':detail(items[0],'DELIVERING'), 'p-e':{...detail(items[4]),order:{orderId:'other'}} });
 const result=await refreshDeliveryStatuses({...deps});assert.equal(result.updated,0);assert.equal(deps.patches.length,0);
});
test('상태 변경 경합 시 다시 조회하도록 예약하고 손실된 네이버 응답을 성공 처리하지 않는다',async()=>{
 const item=sample('x'),deps=setup([item]),checked=new Map();deps.patchItem=async()=>false;
 let result=await refreshDeliveryStatuses({...deps,checked,now:1000000});assert.equal(result.conflicted,1);assert.equal(checked.has('x'),false);
 deps.fetchDetails=async()=>({});result=await refreshDeliveryStatuses({...deps,checked,now:1000001});assert.equal(result.checked,0);assert.equal(checked.has('x'),true);
});
test('운영 조회 래퍼는 네이버 오류를 빈 성공으로 처리하지 않고 수정 요청을 보내지 않는다',async()=>{
 const item=sample('x');let patches=0;
 const run=createDeliveryRefresher({sbGet:async table=>table==='external_order_items'?[item]:[parent(item)],callNaver:async()=>({ok:false,status:429}),patchCas:async()=>{patches++;return true;}});
 await assert.rejects(run(),/HTTP 429/);assert.equal(patches,0);
});
test('운영 조회 래퍼는 조건과 300개 이하 상세 일괄 요청을 사용한다',async()=>{
 const item=sample('x'),paths=[];let patches=0;
 const run=createDeliveryRefresher({sbGet:async(table,query)=>{paths.push(query);return table==='external_order_items'?[item]:[parent(item)];},callNaver:async(path,options)=>{assert.equal(path,'/external/v1/pay-order/seller/product-orders/query');assert.deepEqual(JSON.parse(options.body).productOrderIds,['p-x']);return {ok:true,json:async()=>({data:[detail(item)]})};},patchCas:async()=>{patches++;return true;}});
 const result=await run();assert.equal(result.updated,1);assert.equal(patches,1);assert.match(decodeURIComponent(paths[0]),/DELIVERING,DISPATCHED/);
});
test('연속 실행은 최근 확인한 항목을 건너뛰고 나머지를 순차 처리한다',async()=>{
 const items=['a','b','c'].map(id=>sample(id)),deps=setup(items),checked=new Map();
 await refreshDeliveryStatuses({...deps,checked,max:2,now:1000000});
 await refreshDeliveryStatuses({...deps,checked,max:2,now:1000001});
 assert.deepEqual(deps.patches.map(value=>value.item.id),['a','b','c']);
});
