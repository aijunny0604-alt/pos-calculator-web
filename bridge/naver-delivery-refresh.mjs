// 네이버가 실제로 배송완료/구매확정을 반환한 상품만 반영한다.
// 조회·쓰기 구현은 주입하여 기존 동기화 큐와 분리하고 안전하게 시험한다.
const pending = new Set(['DELIVERING', 'DISPATCHED']);
const completed = new Set(['DELIVERED', 'DELIVERED_COMPLETED', 'PURCHASE_DECIDED']);
const blockedOrders = new Set(['cancelled', 'CANCELED', 'CANCELED_BY_NOPAYMENT', 'RETURNED', 'EXCHANGED', 'CANCEL_REQUEST']);
const claimActive = po => {
  const status = String(po?.claimStatus || '');
  return !!status && !/REJECT|WITHDRAW|RELEASE/i.test(status);
};

export async function refreshDeliveryStatuses({loadCandidates,loadParents,fetchDetails,patchItem,checked=new Map(),now=Date.now(),max=100,cooldownMs=15*60*1000}) {
  const candidates = await loadCandidates();
  if (!Array.isArray(candidates)) throw new Error('배송 상태 조회 자료가 올바르지 않습니다.');
  const valid = candidates.filter(item=>item?.id && item.external_order_id && item.provider_product_order_id && pending.has(item.raw_payload?.productOrder?.productOrderStatus) && !claimActive(item.raw_payload.productOrder));
  const validIds = new Set(valid.map(item=>item.id));
  for (const id of checked.keys()) if (!validIds.has(id)) checked.delete(id);
  const batch = valid.filter(item=>!checked.has(item.id)||now-checked.get(item.id)>=cooldownMs)
    .sort((a,b)=>(checked.get(a.id)||0)-(checked.get(b.id)||0)).slice(0,max);
  if (!batch.length) return {candidates:valid.length,checked:0,updated:0,conflicted:0};
  const parents = await loadParents([...new Set(batch.map(item=>item.external_order_id))]);
  if (!Array.isArray(parents)) throw new Error('배송 주문 확인 자료가 올바르지 않습니다.');
  const parentMap = new Map(parents.map(order=>[order.id,order]));
  const eligible = batch.filter(item=>{const order=parentMap.get(item.external_order_id);return order?.provider==='naver' && order.provider_order_id && !blockedOrders.has(order.order_status) && !order.naver_cancel_succeeded_at;});
  const eligibleIds = new Set(eligible.map(item=>item.id));
  for(const item of batch)if(!eligibleIds.has(item.id))checked.set(item.id,now);
  const details = await fetchDetails([...new Set(eligible.map(item=>String(item.provider_product_order_id)))]);
  if (!details || typeof details!=='object' || Array.isArray(details)) throw new Error('네이버 상품주문 응답을 확인하지 못했습니다.');
  let inspected=0,updated=0,conflicted=0;
  for (const item of eligible) {
    const id=String(item.provider_product_order_id),detail=details[id],po=detail?.productOrder,parent=parentMap.get(item.external_order_id);
    if (!po || String(po.productOrderId||'')!==id || String(detail?.order?.orderId||'')!==String(parent.provider_order_id)) {checked.set(item.id,now);continue;}
    checked.set(item.id,now);inspected++;
    if (!completed.has(po.productOrderStatus) || claimActive(po)) continue;
    const payload={...item.raw_payload,productOrder:{...item.raw_payload.productOrder,productOrderStatus:po.productOrderStatus}};
    if (await patchItem(item,{raw_payload:payload,detail_fetched_at:new Date(now).toISOString()})) updated++;
    else {conflicted++;checked.delete(item.id);}
  }
  return {candidates:valid.length,checked:inspected,updated,conflicted};
}

// 기존 bridge의 인증된 읽기 함수와 조건부 쓰기 함수를 사용한다.
export function createDeliveryRefresher({sbGet,callNaver,patchCas,now=()=>Date.now()}) {
  const checked=new Map();let running=false;
  return async function refresh() {
    if (running) return {skipped:true};
    running=true;
    try {
      return await refreshDeliveryStatuses({checked,now:now(),
        loadCandidates:async()=>{
          const rows=[];
          for(let offset=0;offset<20000;offset+=200){
            const q=new URLSearchParams({select:'id,external_order_id,provider_product_order_id,raw_payload,detail_fetched_at','raw_payload->productOrder->>productOrderStatus':'in.(DELIVERING,DISPATCHED)',provider_product_order_id:'not.is.null',order:'id.asc',limit:'200',offset:String(offset)});
            const page=await sbGet('external_order_items',`?${q}`);
            if(!Array.isArray(page))throw new Error('배송 상품 응답 형식 오류');
            rows.push(...page);if(page.length<200)return rows;
          }
          throw new Error('배송 상품이 너무 많아 재확인을 중단했습니다.');
        },
        loadParents:async ids=>{
          const rows=[];
          for(let i=0;i<ids.length;i+=50){
            const q=new URLSearchParams({id:`in.(${ids.slice(i,i+50).join(',')})`,select:'id,provider,provider_order_id,order_status,naver_cancel_succeeded_at'});
            const page=await sbGet('external_orders',`?${q}`);if(!Array.isArray(page))throw new Error('배송 주문 응답 형식 오류');rows.push(...page);
          }
          return rows;
        },
        fetchDetails:async ids=>{
          if(!ids.length)return {};
          const response=await callNaver('/external/v1/pay-order/seller/product-orders/query',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({productOrderIds:ids,quantityClaimCompatibility:true}),signal:AbortSignal.timeout(20000)});
          if(!response.ok)throw new Error(`네이버 배송 상세 조회 실패 (HTTP ${response.status})`);
          const data=await response.json();if(!Array.isArray(data?.data))throw new Error('네이버 배송 상세 응답 형식 오류');
          return Object.fromEntries(data.data.filter(row=>row?.productOrder?.productOrderId).map(row=>[String(row.productOrder.productOrderId),row]));
        },
        patchItem:patchCas,
      });
    } finally {running=false;}
  };
}
