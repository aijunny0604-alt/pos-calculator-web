export function getClaimInfo(order, items = []) {
  const payloads = [order?.raw_payload?.productOrder, ...items.map(it => it?.raw_payload?.productOrder)].filter(Boolean);
  for (const po of payloads) {
    const cs = po.claimStatus || '', ct = po.claimType || '';
    if (!cs && !ct) continue;
    if (/DONE|REJECT|WITHDRAW|COMPLET|CANCEL_NOT|NOT_REQUEST/i.test(cs)) continue;
    const type = /RETURN/i.test(ct + cs) ? 'RETURN' : /EXCHANGE/i.test(ct + cs) ? 'EXCHANGE' : 'CANCEL';
    return {type,label:type==='RETURN'?'반품요청':type==='EXCHANGE'?'교환요청':'취소요청',claimStatus:cs,claimType:ct};
  }
  return null;
}
export function storeAlert(order) {
  const claim=getClaimInfo(order);
  const labels={CANCEL_REQUEST:'취소 요청',CANCELED:'취소',CANCEL:'취소',RETURNED:'반품',EXCHANGED:'교환'};
  const label=claim?.label||labels[order?.order_status];
  return label?{label,key:`${order.id}:${claim?.claimStatus||order.order_status}:${claim?.type||''}`} : null;
}
export async function saveStoreQueue(update,id,patch){
  const result=await update(id,patch);
  if(!result?.id) throw new Error('처리 요청을 저장하지 못했습니다. 주문은 처리되지 않았습니다. 새로고침 후 다시 시도하세요.');
  return result;
}
import { isOrderDone, PAYMENT_PENDING_STATUSES } from './orderStatus.js';
export function validateStoreConversion(order,items){
  if(order.internal_order_id)throw new Error('이미 내부 주문으로 전환된 주문입니다. 새로고침해주세요.');
  if(isOrderDone(order)||PAYMENT_PENDING_STATUSES.has(order.order_status)||getClaimInfo(order,items))throw new Error('미결제·취소/반품 요청·종결 주문은 전환할 수 없습니다. 네이버 상태를 확인해주세요.');
  if(!items.length||items.some(it=>!it.provider_product_name||it.provider_product_name.includes('⏳')||it.provider_product_name==='확인 필요'))throw new Error('주문 항목이 모두 준비되지 않아 전환을 중단했습니다.');
  if(items.some(it=>!Number.isSafeInteger(Number(it.quantity))||Number(it.quantity)<=0||it.unit_price==null||!Number.isFinite(Number(it.unit_price))||Number(it.unit_price)<0))throw new Error('수량 또는 금액이 올바르지 않아 전환을 중단했습니다.');
}
