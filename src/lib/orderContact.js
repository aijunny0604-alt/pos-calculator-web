const clean = value => typeof value === 'string' ? value.trim() : '';
// 주문에 기록된 수령 정보를 우선한다. 동명이인이면 거래처 정보를 추측하지 않는다.
export function orderContactText(order = {}, customers = []) {
  const name = clean(order.customerName ?? order.customer_name ?? order.name);
  const id = order.customerId ?? order.customer_id;
  const matches = id != null
    ? customers.filter(c => String(c.id) === String(id))
    : customers.filter(c => clean(c.name) === name && name);
  const customer = matches.length === 1 ? matches[0] : {};
  const phone = clean(order.customerPhone ?? order.customer_phone ?? order.phone) || clean(customer.phone);
  const address = clean(order.customerAddress ?? order.customer_address ?? order.address) || clean(customer.address);
  return (phone ? `연락처: ${phone}\n` : '') + (address ? `주소: ${address}\n` : '');
}
