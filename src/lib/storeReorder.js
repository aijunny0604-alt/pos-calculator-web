import { catalogState, soldOutOptions } from './storeCatalog.js';

export const REORDER_KEY = 'move-store-reorder-v1';
export const reorderKey = (row, option) => JSON.stringify([String(row.channel_product_no), option ? String(option.id ?? option.name) : null]);
export const validReorderQuantity = value => /^\d+$/.test(String(value)) && Number(value) >= 1 && Number(value) <= 999999;
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
