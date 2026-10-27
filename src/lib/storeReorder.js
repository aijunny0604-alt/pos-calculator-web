import { catalogState, soldOutOptions } from './storeCatalog.js';

export const REORDER_KEY = 'move-store-reorder-v1';
export const reorderKey = (row, option) => JSON.stringify([String(row.channel_product_no), option ? String(option.id ?? option.name) : null]);
export const validReorderQuantity = value => /^\d+$/.test(String(value)) && Number(value) >= 1 && Number(value) <= 999999;
// 매장 실재고와 확인한 미입고를 각각 한 번만 차감한다. 빈 값은 0이 아니다.
export function recommendReorder({ sales, stock, incoming, days }) {
  const values = [sales, stock, incoming, days];
  if (values.some(v => !/^\d+$/.test(String(v ?? '')) || Number(v) > 999999) || ![14, 30, 60, 90].includes(Number(days))) return null;
  return Math.max(0, Math.ceil(Number(sales) * Number(days) / 30) - Number(stock) - Number(incoming));
}
export function recentProductSales(orders, productId, now = Date.now()) {
  if (!Array.isArray(orders) || productId == null) return null;
  let quantity = 0, skippedReturns = 0, uncertain = false;
  for (const order of orders) {
    const items = Array.isArray(order.items) ? order.items.filter(item => !item.isCustom && String(item.id ?? item.product_id ?? '') === String(productId)) : null;
    const time = Date.parse(order.created_at || order.createdAt);
    if (!Number.isFinite(time)) { if (items?.length) uncertain = true; continue; }
    if (time < now - 30 * 86400000 || time > now) continue;
    if (/cancel|취소/i.test(String(order.status || ''))) continue;
    if (!items) { uncertain = true; continue; }
    if (!items.length) continue;
    if (Number(order.total_returned ?? order.totalReturned ?? 0) > 0) { skippedReturns++; continue; }
    for (const item of items) {
      const value = Number(item.quantity);
      if (!Number.isInteger(value) || value < 0) uncertain = true; else quantity += value;
    }
  }
  return { quantity, skippedReturns, uncertain };
}
export function normalizeReorders(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter(r => r && typeof r.key === 'string' && typeof r.name === 'string' && !seen.has(r.key) && seen.add(r.key)).map(r => ({
    key: r.key, name: r.name, productId: String(r.productId ?? ''), option: typeof r.option === 'string' ? r.option : '',
    quantity: validReorderQuantity(r.quantity) ? String(r.quantity) : '', note: typeof r.note === 'string' ? r.note : '', ordered: r.ordered === true,
  }));
}
export function readReorders() {
  try { return normalizeReorders(JSON.parse(localStorage.getItem(REORDER_KEY) || '[]')); } catch { return []; }
}
export function makeReorder(row, option = null) {
  return { key: reorderKey(row, option), productId: String(row.channel_product_no), name: row.name, option: option?.name || '', quantity: '', note: '', ordered: false };
}
export function appendShortages(existing, products) {
  const next = [...existing];
  const keys = new Set(next.map(r => r.key));
  for (const row of products.filter(r => ['soldout', 'options'].includes(catalogState(r)))) {
    const zeros = soldOutOptions(row);
    for (const option of zeros.length ? zeros : [null]) {
      const item = makeReorder(row, option);
      if (!keys.has(item.key)) { next.push(item); keys.add(item.key); }
    }
  }
  return next;
}
