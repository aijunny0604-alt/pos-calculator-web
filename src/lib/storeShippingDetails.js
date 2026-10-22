import { storeOrderStatus } from './storeOrderView.js';
const reasons = {PRODUCT_PREPARE:'상품 준비 중',CUSTOMER_REQUEST:'고객 요청',CUSTOM_BUILD:'주문 제작',RESERVED_DISPATCH:'예약 발송',OVERSEA_DELIVERY:'해외 배송',ETC:'기타'};
const statuses = {PAYED:'결제완료',PAYMENT_WAITING:'입금대기',PAY_WAITING:'입금대기',DELIVERING:'배송중',DISPATCHED:'발송완료',DELIVERED:'배송완료',PURCHASE_DECIDED:'구매확정',CANCELED:'취소',RETURNED:'반품',EXCHANGED:'교환',confirmed:'발주확인',shipped:'발송완료',converted:'내부주문 전환',cancelled:'취소'};
export function shippingDate(value) {
  if (!value) return '미제공';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '미제공';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
}
export function storeShippingDetails(order={},items=[],now=Date.now()) {
  const sources=items.length?items:[{raw_payload:order.raw_payload}];
  return sources.map((item,index)=>{
    // 각 상품주문의 원본을 사용한다. 다른 상품의 지연 사유/날짜를 복제하지 않는다.
    const raw=item.raw_payload||{},po=raw.productOrder||{},delivery=raw.delivery||{};
    const status=po.productOrderStatus||item.order_status||storeOrderStatus(order)||'';
    const dispatched=delivery.sendDate||item.dispatched_at||null;
    const done=!!dispatched || /^(DISPATCHED|DELIVERING|DELIVERED|DELIVERED_COMPLETED|PURCHASE_DECIDED|CANCELED|CANCELED_BY_NOPAYMENT|RETURNED|EXCHANGED|shipped|cancelled)$/.test(status) || (!items.length&&!!order.naver_dispatch_succeeded_at);
    const due=po.dispatchDueDate || (!items.length?order.dispatch_due_date:null);
    const delayed=!!(po.delayedDispatchReason||po.delayedDispatchDetailedReason);
    const dueTime=due?Date.parse(due):NaN;
    return {id:item.provider_product_order_id||po.productOrderId||index,name:item.provider_product_name||po.productName||'주문 발송 정보',status:statuses[status]||status||'상태 미제공',placeStatus:po.placeOrderStatus==='OK'?'발주확인 완료':po.placeOrderStatus==='NOT_YET'?'발주확인 전':po.placeOrderStatus||'미제공',due,delayed,reason:reasons[po.delayedDispatchReason]||po.delayedDispatchReason||'사유 미제공',detail:po.delayedDispatchDetailedReason||'',overdue:!done&&Number.isFinite(dueTime)&&dueTime<now,done,dispatched,confirmed:po.placeOrderDate,claim:po.claimStatus||null};
  });
}
