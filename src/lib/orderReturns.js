export const RETURN_REASONS = ['오배송', '제품 불량', '주문 착오', '고객 요청', '기타'];

export const returnLinePrice = item => Number(item.price ?? item.wholesale ?? 0);
const productKey = (id, name) => id != null && id !== '' ? `id:${id}` : `name:${name || ''}`;

export function getReturnLines(order) {
  const lines = (order.items || []).map((item, index) => {
    const quantity = Number(item.quantity);
    const price = returnLinePrice(item);
    const available = Number.isSafeInteger(quantity) && quantity > 0 && Number.isFinite(price) && price >= 0 ? quantity : 0;
    return { index, name: item.name, price, available };
  });
  for (const entry of order.returns || []) {
    let remaining = Math.max(0, Number(entry.quantity ?? entry.returnQuantity) || 0);
    const key = productKey(entry.itemId, entry.itemName ?? entry.name);
    const matches = lines.filter(({ index }) => {
      const item = order.items[index];
      return productKey(item.id, item.name) === key;
    });
    const priced = matches.filter(line => line.price === Number(entry.price));
    for (const line of [...priced, ...matches.filter(line => !priced.includes(line))]) {
      const used = Math.min(remaining, line.available);
      line.available -= used;
      remaining -= used;
    }
  }
  return lines;
}

export function returnDetailsLabel(details) {
  return details?.kind === 'exchange' ? '반품 후 교체' : '반품';
}

export function exchangeOrderCandidates(order, orders) {
  const customer = String(order.customerName || '').trim().replace(/\s+/g, '').toLowerCase();
  if (!customer) return [];
  return orders.filter(candidate =>
    candidate.orderNumber && candidate.orderNumber !== order.orderNumber &&
    String(candidate.customerName || '').trim().replace(/\s+/g, '').toLowerCase() === customer
  ).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
