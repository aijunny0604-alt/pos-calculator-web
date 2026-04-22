// 부가세 계산 헬퍼
export function calcVat({ total, supply, vatRate = 10, isExempt = false }) {
  if (isExempt) {
    if (total != null) return { total: Number(total), supply: Number(total), vat: 0 };
    if (supply != null) return { total: Number(supply), supply: Number(supply), vat: 0 };
    return { total: 0, supply: 0, vat: 0 };
  }
  const rate = Number(vatRate) / 100;
  if (supply != null && supply !== '') {
    const s = Number(supply);
    const v = Math.round(s * rate);
    return { total: s + v, supply: s, vat: v };
  }
  if (total != null && total !== '') {
    const t = Number(total);
    const s = Math.round(t / (1 + rate));
    return { total: t, supply: s, vat: t - s };
  }
  return { total: 0, supply: 0, vat: 0 };
}

export const DEFAULT_CATEGORIES = [
  { key: 'sales', label: '매출', icon: '💼', vat_exempt: false },
  { key: 'shipping', label: '택배비', icon: '📦', vat_exempt: true },
  { key: 'quick', label: '퀵비', icon: '🚚', vat_exempt: true },
  { key: 'ad', label: '광고비', icon: '📢', vat_exempt: true },
  { key: 'other', label: '기타', icon: '📋', vat_exempt: false },
];

export function getCategoryInfo(categories, key) {
  return categories?.find((c) => c.key === key) || DEFAULT_CATEGORIES.find((c) => c.key === key) || DEFAULT_CATEGORIES[0];
}
