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

// 주문 당시 가격과 실제 할인액을 저장해 나중에 상품 단가가 바뀌어도 이력이 유지된다.
export function serializeDiscountedItem(item, priceType) {
  const field = priceType === 'retail' ? 'retail' : 'wholesale';
  const unit = Number(item.unitPrice ?? item.price ?? 0);
  const final = Number(item.discountedPrice ?? unit);
  const manual = item.discountType && Number(item.discountValue) > 0 &&
    (!item.originalPriceField || item.originalPriceField === field);
  const original = manual && Number.isFinite(Number(item.originalPrice)) ? Number(item.originalPrice) : unit;
  const base = { id: item.id, name: item.name, price: final, quantity: item.quantity };
  if (item.category) base.category = item.category;
  if (item.taxFree === true) base.taxFree = true;
  if (manual && !(item.appliedTier && item.discountAmount > 0)) {
    Object.assign(base, { originalPrice: original, discountType: item.discountType, discountValue: Number(item.discountValue), originalPriceField: field });
  } else if (original > final) Object.assign(base, { originalPrice: original, discountType: 'amount', discountValue: original - final, originalPriceField: field });
  return base;
}

// 주문에 저장된 할인 전/후 단가만 사용한다. 현재 상품 가격으로 과거 할인을 추정하지 않는다.
export function getOrderDiscountSummary(order) {
  const priceField = order.priceType === 'retail' ? 'retail' : 'wholesale';
  let count = 0, saved = 0, complete = true;
  for (const item of order.items || []) {
    const value = Number(item?.discountValue);
    if (!DISCOUNT_TYPES.includes(item?.discountType) || !Number.isFinite(value) || value <= 0) continue;
    if (item.originalPriceField && item.originalPriceField !== priceField) continue;
    const base = item.originalPrice == null ? NaN : Number(item.originalPrice);
    const current = item.price == null ? NaN : Number(item.price);
    const quantity = Number(item.quantity);
    if (![base, current, quantity].every(Number.isSafeInteger) || base < 0 || current < 0 || quantity <= 0) {
      count++; complete = false; continue;
    }
    if (base <= current) continue; // 최종 지정 단가가 더 높거나 같으면 할인으로 표시하지 않는다.
    count++; saved += (base - current) * quantity;
  }
  const total = Number(order.totalAmount ?? order.total);
  complete = complete && Number.isSafeInteger(saved) && Number.isSafeInteger(total) && total >= 0 && Number.isSafeInteger(total + saved);
  return { hasDiscount: count > 0, count, saved: complete ? saved : null, originalTotal: complete && count > 0 ? total + saved : null };
}

// 표시 전용: 저장된 최종 단가를 다시 할인하지 않는다.
export function getItemDiscountSummary(item, priceType) {
  return getOrderDiscountSummary({ items: [item], priceType, totalAmount: Number(item.price) * Number(item.quantity) });
}

export function itemDiscountText(item, priceType, formatPrice) {
  const discount = getItemDiscountSummary(item, priceType);
  if (!discount.hasDiscount) return '';
  if (discount.saved == null) return '   할인 (할인 전 단가 기록 없음)\n';
  return `   단가: ${formatPrice(item.originalPrice)}원 → ${formatPrice(item.price)}원\n   할인: -${formatPrice(discount.saved)}원\n`;
}

export function orderDiscountText(order, formatPrice) {
  const discount = getOrderDiscountSummary(order);
  if (!discount.hasDiscount) return '';
  if (discount.saved == null) return '할인: 일부 할인 전 단가 기록 없음\n';
  return `할인 전 금액: ${formatPrice(discount.originalTotal)}원\n할인: -${formatPrice(discount.saved)}원\n`;
}
