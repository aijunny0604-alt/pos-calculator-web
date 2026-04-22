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

// 가격 포맷
export const formatPrice = (price) => {
  if (price === undefined || price === null) return '0';
  return Number(price).toLocaleString('ko-KR');
};

// VAT 제외 계산
export const calcExVat = (price) => Math.round(price / 1.1);

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
  d.setUTCMonth(d.getUTCMonth() + months);
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
