import { calculateDiscount } from './utils.js';
import { serializeDiscountedItem } from './discount.js';

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

export function editableReturnEntries(order) {
  const entries = new Map();
  for (const entry of order.returns || []) {
    if (/^RET-[A-Za-z0-9-]{1,96}$/.test(entry.returnId) && !entries.has(entry.returnId)) {
      entries.set(entry.returnId, entry);
    }
  }
  return [...entries.values()].reverse();
}

export function exchangeOrderCandidates(order, orders) {
  const customer = String(order.customerName || '').trim().replace(/\s+/g, '').toLowerCase();
  if (!customer) return [];
  return orders.filter(candidate =>
    candidate.orderNumber && candidate.orderNumber !== order.orderNumber &&
    String(candidate.customerName || '').trim().replace(/\s+/g, '').toLowerCase() === customer
  ).sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}

export function exchangeOrderOrigins(orders) {
  const origins = new Map();
  for (const order of orders) {
    const id = order.orderNumber || order.id;
    for (const { returnDetails } of order.returns || []) {
      if (returnDetails?.kind === 'exchange' && returnDetails.exchangeOrderNumber) {
        origins.set(returnDetails.exchangeOrderNumber, id);
      }
    }
  }
  for (const order of orders) {
    if (order.exchange_origin_order_id) origins.set(order.orderNumber || order.id, order.exchange_origin_order_id);
  }
  return origins;
}

export function exchangeProductQuote(product, quantity, priceType) {
  const basePrice = Number(priceType === 'retail' ? product.retail || product.wholesale : product.wholesale);
  const { discountedPrice, appliedTier, discountAmount } = calculateDiscount(product, quantity, basePrice, priceType);
  return { ...serializeDiscountedItem({
    ...product, quantity, unitPrice: basePrice, discountedPrice, appliedTier, discountAmount,
    taxFree: product.taxFree === true || product.tax_free === true,
  }, priceType), basePrice };
}
