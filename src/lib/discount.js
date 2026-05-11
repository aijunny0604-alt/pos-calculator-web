// 할인 계산 유틸 — 3가지 모드 지원
// - percent: 할인율 (10 = 10% off)
// - amount: 차감 금액 (5000 = 5,000원 깎기)
// - fixed: 최종 지정 단가 (100000 = 단가 100,000원으로 강제)

export function calcFinalPrice(base, type, value) {
  const b = Number(base) || 0;
  const v = Number(value) || 0;
  if (v <= 0) return b;
  if (type === 'percent') return Math.max(0, Math.round(b * (1 - Math.min(100, v) / 100)));
  if (type === 'amount') return Math.max(0, b - Math.round(v));
  if (type === 'fixed') return Math.max(0, Math.round(v));
  return b;
}

// 모드 전환 시 같은 결과를 유지하기 위한 value 변환
// base: 정가, currentFinal: 현재 최종가, newType: 전환 후 모드
export function convertDiscountValue(base, currentFinal, newType) {
  const b = Number(base) || 0;
  const f = Number(currentFinal) || 0;
  if (b <= 0) return 0;
  if (newType === 'percent') return b > 0 ? Math.round((1 - f / b) * 100) : 0;
  if (newType === 'amount') return Math.max(0, b - f);
  if (newType === 'fixed') return f;
  return 0;
}

// 사용자 표시 라벨
export function discountLabel(item, formatPrice) {
  if (!item || !item.discountType || !(Number(item.discountValue) > 0)) return '';
  const v = Number(item.discountValue);
  if (item.discountType === 'percent') return `${v}%`;
  if (item.discountType === 'amount') return `${formatPrice(v)}원`;
  if (item.discountType === 'fixed') return `특가`;
  return '';
}

// input placeholder
export function discountPlaceholder(type) {
  if (type === 'amount') return '차감 금액';
  if (type === 'fixed') return '지정 단가';
  return '할인 %';
}

export const DISCOUNT_TYPES = ['percent', 'amount', 'fixed'];
