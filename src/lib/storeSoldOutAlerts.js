import { catalogOptions, optionStock } from './storeCatalog.js';

export const SOLD_OUT_ALERT_KEY = 'move-store-sold-out-alerts-v1';
export const emptySoldOutState = () => ({ version: 1, initialized: false, products: {}, pending: [] });

function optionSnapshot(row) {
  const options = catalogOptions(row);
  const keys = options.map(option => {
    const id = option.id == null ? '' : String(option.id).trim();
    const name = String(option.name || '').trim();
    return id ? `id:${option.type || ''}:${id}` : name ? `name:${name}` : '';
  });
  const counts = keys.reduce((out, key) => { if (key) out[key] = (out[key] || 0) + 1; return out; }, {});
  const result = {};
  options.forEach((option, index) => {
    const key = keys[index], stock = optionStock(option);
    if (!key || counts[key] !== 1 || stock === null) return;
    result[key] = { name: String(option.name || '옵션명 미확인'), stock, usable: option.usable !== false };
  });
  return result;
}

// 네이버 동기화본의 확인 가능한 전환만 감지한다. 첫 조회·새 상품·미확인 재고는 기준값만 만든다.
export function updateSoldOutState(state, rows) {
  const previous = state?.version === 1 && state.products && Array.isArray(state.pending) ? state : emptySoldOutState();
  const products = { ...previous.products }, pending = [...previous.pending];
  for (const row of rows || []) {
    const id = String(row?.channel_product_no || '').trim();
    if (!id) continue;
    const timestamp = Date.parse(row.synced_at);
    const synced = Number.isFinite(timestamp) ? timestamp : 0;
    const old = products[id];
    if (old && synced <= old.synced) continue;
    const options = optionSnapshot(row);
    const status = String(row.status_type || '');
    const name = String(row.name || '상품명 미확인');
    if (previous.initialized && old && synced > 0) {
      if (old.status === 'SALE' && status === 'OUTOFSTOCK') pending.push({ key:`product:${id}:${synced}`, productId:id, name, option:'', kind:'product', synced });
      if (status === 'SALE' || status === 'OUTOFSTOCK') {
        for (const [key, option] of Object.entries(options)) {
          const before = old.options?.[key];
          if (before?.usable && before.stock > 0 && option.usable && option.stock === 0) pending.push({ key:`option:${id}:${key}:${synced}`, productId:id, name, option:option.name, kind:'option', synced });
        }
      }
    }
    products[id] = { synced, status, options: { ...(old?.options || {}), ...options } };
  }
  return { version:1, initialized:true, products, pending };
}

export function readSoldOutState(storage) {
  try {
    storage ||= globalThis.localStorage;
    const value = JSON.parse(storage?.getItem(SOLD_OUT_ALERT_KEY) || 'null');
    return value?.version === 1 && value.products && Array.isArray(value.pending) ? value : emptySoldOutState();
  } catch { return emptySoldOutState(); }
}
export function writeSoldOutState(state, storage) {
  try { storage ||= globalThis.localStorage; storage?.setItem(SOLD_OUT_ALERT_KEY, JSON.stringify(state)); return true; } catch { return false; }
}
