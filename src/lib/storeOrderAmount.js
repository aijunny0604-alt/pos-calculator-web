const num = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value);
function orderLevelPayment(data) {
  if (!data) return 0;
  return ['generalPaymentAmount','naverMileagePaymentAmount','checkoutAccumulationPaymentAmount','payLaterPaymentAmount','chargeAmountPaymentAmount']
    .reduce((sum,key)=>sum+(num(data[key]) ?? 0),0);
}
export function orderPaymentTotal(order, items = []) {
  const whole = orderLevelPayment(order?.raw_payload?.order) || items.map(item=>orderLevelPayment(item?.raw_payload?.order)).find(value=>value>0) || 0;
  if (whole > 0) return whole;
  const payments = items.map(item=>num(item?.raw_payload?.productOrder?.totalPaymentAmount));
  if (payments.length && payments.every(value=>value!==null)) return payments.reduce((sum,value)=>sum+value,0);
  const lines = items.map(item=>{const price=num(item.unit_price), qty=num(item.quantity);return price===null||qty===null?null:price*qty;});
  if (lines.length && lines.every(value=>value!==null)) return lines.reduce((sum,value)=>sum+value,0);
  return num(order?.total_amount) ?? 0;
}
