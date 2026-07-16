// HTML 이스케이프
export const escapeHtml = (str) => {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
};

// 날짜 형식 이름 체크
export const isDateFormatName = (str) => {
  if (!str || str.length < 4) return false;
  const datePatterns = [/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/, /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/, /^\d{1,2}월\s*\d{1,2}일/, /^\d{4}년/];
  return datePatterns.some(p => p.test(str.trim()));
};

// 검색 함수
export const normalizeText = (text) => text.toLowerCase().replace(/[\s\-_]/g, '');

export const handleSearchFocus = (e) => e.target.select();

export const matchesSearchQuery = (productName, searchTerm) => {
  if (!searchTerm || !searchTerm.trim()) return true;
  if (!productName) return false;
  const normalizedName = normalizeText(productName);
  const normalizedSearch = normalizeText(searchTerm);
  if (normalizedName.includes(normalizedSearch)) return true;
  let searchIdx = 0;
  for (let i = 0; i < normalizedName.length && searchIdx < normalizedSearch.length; i++) {
    if (normalizedName[i] === normalizedSearch[searchIdx]) searchIdx++;
  }
  if (searchIdx === normalizedSearch.length) return true;
  const searchWords = searchTerm.trim().split(/\s+/);
  if (searchWords.length > 1) {
    return searchWords.every(word => normalizedName.includes(normalizeText(word)));
  }
  return false;
};

// 수량별 할인 계산
export const calculateDiscount = (product, quantity, unitPrice) => {
  if (!product?.discount_tiers || !Array.isArray(product.discount_tiers) || product.discount_tiers.length === 0) {
    return { discountedPrice: unitPrice, discountAmount: 0, appliedTier: null };
  }
  const sortedTiers = [...product.discount_tiers].sort((a, b) => (b.minQty || 0) - (a.minQty || 0));
  for (const tier of sortedTiers) {
    const minQty = tier.minQty || 0;
    const maxQty = tier.maxQty || Infinity;
    if (quantity >= minQty && quantity <= maxQty) {
      let discountedPrice;
      if (tier.type === 'percent') {
        discountedPrice = Math.round(unitPrice * (1 - tier.value / 100));
      } else {
        discountedPrice = unitPrice - tier.value;
      }
      discountedPrice = Math.max(0, discountedPrice);
      return { discountedPrice, discountAmount: unitPrice - discountedPrice, appliedTier: tier };
    }
  }
  return { discountedPrice: unitPrice, discountAmount: 0, appliedTier: null };
};

export const calculateItemDiscount = (item, products) => {
  const product = products.find(p => p.id === item.id);
  if (!product) return { discountedPrice: item.price, discountAmount: 0, appliedTier: null };
  return calculateDiscount(product, item.quantity, item.price);
};

// 가격 포맷 (NaN-safe: undefined/null/NaN은 모두 '0')
export const formatPrice = (price) => {
  const n = Number(price);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('ko-KR');
};

// VAT 제외 계산
export const calcExVat = (price) => Math.round(price / 1.1);

// ───────── 비과세 항목 (2026-07-15) ─────────
// 택배비/퀵비/수수료/커스텀 = 우리 상품이 아니라 실비 대납 성격 → 부가세 계산에서 제외.
// 이 항목들은 "받은 금액 = 공급가액, 부가세 0". 일반 제품은 기존대로 VAT 포함가라 /1.1.
//
// ⚠️ 과거 데이터 보호: 기존 주문에는 taxFree 필드가 없다. 필드 없으면 과세로 본다(기존 동작 유지)
//    → 과거 명세서 금액이 소급해서 바뀌지 않음. 사장님 결정(2026-07-15).
export const isTaxFreeItem = (item) => item?.taxFree === true;

// 라인 합계(부가세 포함가 기준)를 구하는 기본 규칙 — 화면마다 제각각이라 여기 모아둠
const lineTotal = (item) => {
  if (!item) return 0;
  // 이미 계산된 합계가 있으면 그걸 신뢰 (할인 적용된 finalTotal 등)
  if (Number.isFinite(Number(item.finalTotal))) return Number(item.finalTotal);
  const price = Number(item.price ?? item.wholesale ?? item.retail) || 0;
  return price * (Number(item.quantity) || 1);
};

/**
 * 주문/카트의 공급가액·부가세를 **품목 단위**로 계산.
 * 총액(부가세 포함)은 그대로 두고, 비과세 항목만 부가세 0으로 빼서 공급가액을 올린다.
 *
 * 예) 플랜지 60,500(과세) + 택배비 6,000×2(비과세)
 *     → total 72,500 / supply 67,000 / vat 5,500  (기존 전역 /1.1이면 65,909 / 6,591)
 *
 * @param items 라인 배열. 각 항목 { price|wholesale|retail, quantity, finalTotal?, taxFree? }
 * @param opts.priceOf 라인 합계를 직접 구하는 함수(화면별 가격 규칙이 다를 때). 없으면 기본 규칙
 * @returns {{ total, supply, vat, taxableTotal, taxFreeTotal }}
 */
export const calcOrderVat = (items, opts = {}) => {
  const get = opts.priceOf || lineTotal;
  let taxableTotal = 0;
  let taxFreeTotal = 0;
  for (const it of items || []) {
    const amount = Number(get(it)) || 0;
    if (isTaxFreeItem(it)) taxFreeTotal += amount;
    else taxableTotal += amount;
  }
  const supplyTaxable = calcExVat(taxableTotal);
  const vat = taxableTotal - supplyTaxable;
  return {
    total: taxableTotal + taxFreeTotal,
    supply: supplyTaxable + taxFreeTotal, // 비과세는 받은 금액 전액이 공급가액
    vat,
    taxableTotal,
    taxFreeTotal,
  };
};

// 한국시간(KST) 기준 오늘 날짜 (YYYY-MM-DD)
// getTime()은 항상 UTC 밀리초를 반환하므로 9시간만 더하면 KST
export const getTodayKST = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
};

// KST YYYY-MM-DD 문자열에서 일수를 더하거나 빼서 새 YYYY-MM-DD 반환
export const offsetDateKST = (dateStr, days) => {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
};

// KST YYYY-MM-DD 문자열에서 월을 빼서 새 YYYY-MM-DD 반환
export const offsetMonthKST = (dateStr, months) => {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDate();
  // 월말(3/31 등) overflow 방지: 1일로 옮겨 月 이동 후, 목표 월의 말일로 clamp [bug-hunt 7]
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().split('T')[0];
};

// 날짜 문자열을 한국시간 기준 YYYY-MM-DD로 변환
export const toDateKST = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
};

// 날짜 포맷
export const formatDate = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('ko-KR');
};

export const formatDateTime = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
};

// 시간만 (HH:MM)
export const formatTime = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleTimeString('ko-KR', {
    hour: '2-digit', minute: '2-digit',
  });
};
