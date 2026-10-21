const identity = value => value == null || value === '' ? null : String(value);
const phoneKey = value => String(value || '').replace(/\D/g, '');

// 금액을 연결할 때는 부분일치/첫 번째 후보를 쓰지 않는다. 명시 ID는 이름보다 우선한다.
export function resolvePaymentCustomer(order, customers) {
  const id = identity(order.customer_id ?? order.customerId);
  if (id) return customers.find(c => identity(c.id) === id) || null;
  const name = String(order.customer_name ?? order.customerName ?? '').trim();
  const phone = phoneKey(order.customer_phone ?? order.customerPhone);
  const byName = name ? customers.filter(c => String(c.name || '').trim() === name) : [];
  const byPhone = phone ? customers.filter(c => phoneKey(c.phone) === phone) : [];
  if (byName.length && byPhone.length) {
    const common = byName.filter(c => byPhone.some(p => identity(p.id) === identity(c.id)));
    return common.length === 1 ? common[0] : null;
  }
  return byName.length === 1 ? byName[0] : byPhone.length === 1 ? byPhone[0] : null;
}

export function customerOrders(customer, orders, records, customers) {
  const id = identity(customer.id);
  const linked = new Map();
  for (const r of records) {
    if (!r.order_id) continue;
    const key = String(r.order_id);
    const owners = linked.get(key) || new Set();
    owners.add(identity(r.customer_id)); linked.set(key, owners);
  }
  return orders.filter(order => {
    const explicit = identity(order.customer_id ?? order.customerId);
    const owners = linked.get(String(order.id));
    if (explicit) return explicit === id && (!owners || (owners.size === 1 && owners.has(id)));
    if (owners) return owners.size === 1 && owners.has(id);
    return identity(resolvePaymentCustomer(order, customers)?.id) === id;
  });
}
