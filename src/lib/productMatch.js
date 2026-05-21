// 제품 매칭 유틸 — TextAnalyze.jsx의 matchWithTolerance 추출 + ai_learning 우선 매칭
// 사용: saveOrder / updateProductStock / updateProductPrice 등 쓰기 도구에서 공유

// 검색 텍스트 정리 (수량/단위 제거)
export function cleanSearchText(text) {
  if (!text) return '';
  return text
    .replace(/\d+\s*(개|세트|set|ea|pcs|본|장|박스|box)\s*$/i, '')
    .replace(/[x×*]\s*\d+\s*$/i, '')
    .replace(/[,.\-_/\\()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 숫자 ±1 허용 매칭 (TextAnalyze.jsx에서 추출)
export function matchWithTolerance(searchName, productName) {
  if (!searchName || !productName) return false;
  const cleanSearch = cleanSearchText(searchName);
  const cleanProduct = productName.trim();
  if (
    cleanProduct === cleanSearch ||
    cleanProduct.toLowerCase() === cleanSearch.toLowerCase() ||
    cleanProduct.includes(cleanSearch) ||
    cleanSearch.includes(cleanProduct)
  ) return true;
  const searchNums = cleanSearch.match(/\d+/g) || [];
  const productNums = cleanProduct.match(/\d+/g) || [];
  if (searchNums.length === 0 && productNums.length === 0) {
    const st = cleanSearch.replace(/\s+/g, '').toLowerCase();
    const pt = cleanProduct.replace(/\s+/g, '').toLowerCase();
    return st === pt || st.includes(pt) || pt.includes(st);
  }
  const searchTextOnly = cleanSearch.replace(/\d+/g, '').replace(/\s+/g, '').toLowerCase();
  const productTextOnly = cleanProduct.replace(/\d+/g, '').replace(/\s+/g, '').toLowerCase();
  const textMatch =
    searchTextOnly === productTextOnly ||
    searchTextOnly.includes(productTextOnly) ||
    productTextOnly.includes(searchTextOnly);
  if (!textMatch) return false;
  const minLen = Math.min(searchNums.length, productNums.length);
  if (minLen === 0) return textMatch;
  for (let i = 0; i < minLen; i++) {
    if (Math.abs(parseInt(searchNums[i], 10) - parseInt(productNums[i], 10)) > 1) return false;
  }
  return true;
}

// AI 학습 사례 우선 매칭 (ai_learning 테이블 활용)
export function findProductByLearning(query, products, aiLearningData) {
  if (!Array.isArray(aiLearningData) || aiLearningData.length === 0) return null;
  if (!Array.isArray(products) || products.length === 0) return null;
  const lower = (query || '').trim().toLowerCase();
  if (!lower) return null;
  // ai_learning original_text 정확/부분 매칭
  const learning =
    aiLearningData.find((l) => (l?.original_text || '').toLowerCase() === lower) ||
    aiLearningData.find((l) => {
      const orig = (l?.original_text || '').toLowerCase();
      return orig && (lower.includes(orig) || orig.includes(lower));
    });
  if (!learning?.product_name) return null;
  const productNameLower = learning.product_name.toLowerCase();
  return (
    products.find((p) => (p?.name || '').toLowerCase() === productNameLower) ||
    products.find((p) => (p?.name || '').toLowerCase().includes(productNameLower)) ||
    null
  );
}

// 통합 fuzzy 매칭 — 5단계 (학습 → 정확 → tolerance → 부분 → 토큰)
export function findProductSmart(query, products, aiLearningData) {
  if (!query || !Array.isArray(products) || products.length === 0) return null;
  // 1) AI 학습 사례 우선
  const learned = findProductByLearning(query, products, aiLearningData);
  if (learned) return learned;
  const lower = query.trim().toLowerCase();
  // 2) 정확 일치
  let p = products.find((x) => (x?.name || '').toLowerCase() === lower);
  if (p) return p;
  // 3) matchWithTolerance (숫자 ±1 허용)
  p = products.find((x) => matchWithTolerance(query, x.name));
  if (p) return p;
  // 4) 부분 일치
  p = products.find((x) => (x?.name || '').toLowerCase().includes(lower));
  if (p) return p;
  // 5) 토큰 단위 (모든 토큰 포함)
  const tokens = lower.replace(/[,.\-_/()]/g, ' ').split(/\s+/).filter(Boolean);
  if (tokens.length > 0) {
    p = products.find((x) => {
      const pn = (x?.name || '').toLowerCase();
      return tokens.every((t) => pn.includes(t));
    });
    if (p) return p;
  }
  return null;
}

// 비슷한 제품 후보 TOP N (매칭 실패 시 사용자에게 제안)
export function findProductCandidates(query, products, limit = 5) {
  if (!query || !Array.isArray(products)) return [];
  const lower = query.trim().toLowerCase();
  const tokens = lower.replace(/[,.\-_/()]/g, ' ').split(/\s+/).filter(Boolean);
  const scored = products
    .map((p) => {
      const pn = (p?.name || '').toLowerCase();
      let score = 0;
      if (pn === lower) score += 100;
      if (pn.includes(lower)) score += 50;
      for (const t of tokens) {
        if (pn.includes(t)) score += 10;
      }
      // tolerance 매칭 보너스
      if (matchWithTolerance(query, p.name)) score += 30;
      // 짧은 이름 가중치
      if (score > 0) score += Math.max(0, 20 - pn.length);
      return { name: p.name, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.name);
  return scored;
}
