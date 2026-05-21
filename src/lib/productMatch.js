// 제품 매칭 유틸 — TextAnalyze.jsx의 matchWithTolerance 추출 + ai_learning 우선 매칭
// 사용: saveOrder / updateProductStock / updateProductPrice 등 쓰기 도구에서 공유

// 검색 텍스트 정리 (수량/단위 제거 + 한글 자판 오타 ㅡ → - 변환)
export function cleanSearchText(text) {
  if (!text) return '';
  return text
    .replace(/ㅡ/g, '-')  // 한글 자판 "ㅡ" → ASCII "-"
    .replace(/\d+\s*(개|세트|set|ea|pcs|본|장|박스|box)\s*$/i, '')
    .replace(/[x×*]\s*\d+\s*$/i, '')
    .replace(/[,.\-_/\\()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 검색 토큰 노이즈 단어 (사이즈/형태 표기 등 매칭 정확도 저하)
// 예: "스덴 밴딩 54 30도" → "도" 제거 → ["스덴", "밴딩", "54", "30"]만 사용
const TOKEN_STOPWORDS = new Set([
  '도', '용', '급', '형', '타입', '정도', '개', '본', '장', '대', '쪽', '면', '겹',
  '제품', '상품', '재고', '가격', '원', '얼마', '있어', '있니', '있나', '있음',
  '알려', '알려줘', '확인', '조회', '보여', '보여줘', '주세요', '주실',
]);

function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[,.\-_/()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    // 숫자 뒤 한글 단위 정규화: "54도" → "54", "30개" → "30", "5본" → "5"
    .map((t) => t.replace(/^(\d+)[가-힣]+$/, '$1'))
    .filter((t) => !TOKEN_STOPWORDS.has(t));
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

// 통합 fuzzy 매칭 — 7단계 (학습 → 정확 → tolerance → 부분 → 토큰 100% → 토큰 70% → 압도적 1위)
export function findProductSmart(query, products, aiLearningData) {
  if (!query || !Array.isArray(products) || products.length === 0) return null;
  // 짧은/공백뿐인 쿼리 가드 (lower.includes('')는 true가 되어 첫 제품 잘못 반환되는 버그 방지)
  const trimmed = String(query).trim();
  if (trimmed.length < 2) return null;
  // 1) AI 학습 사례 우선
  const learned = findProductByLearning(query, products, aiLearningData);
  if (learned) return learned;
  // 한글 자판 "ㅡ" → "-" 변환 (사용자 입력 정규화)
  const lower = trimmed.toLowerCase().replace(/ㅡ/g, '-');
  // 2) 정확 일치
  let p = products.find((x) => (x?.name || '').toLowerCase() === lower);
  if (p) return p;
  // 3) matchWithTolerance (숫자 ±1 허용)
  p = products.find((x) => matchWithTolerance(query, x.name));
  if (p) return p;
  // 4) 부분 일치
  p = products.find((x) => (x?.name || '').toLowerCase().includes(lower));
  if (p) return p;
  // 공백 무시 비교 (사용자 "스덴밴딩" vs DB "스덴 밴딩" 매칭 위해)
  const lowerNoSpace = lower.replace(/\s+/g, '');
  p = products.find((x) => {
    const pn = (x?.name || '').toLowerCase().replace(/\s+/g, '');
    return pn === lowerNoSpace || pn.includes(lowerNoSpace) || lowerNoSpace.includes(pn);
  });
  if (p) return p;
  // 5) 토큰 100% 일치 (stopwords 제거 후, 공백 무시 비교)
  const tokens = tokenize(lower);
  if (tokens.length > 0) {
    p = products.find((x) => {
      const pnNoSpace = (x?.name || '').toLowerCase().replace(/\s+/g, '');
      return tokens.every((t) => pnNoSpace.includes(t.replace(/\s+/g, '')));
    });
    if (p) return p;
  }
  // 6) 토큰 70% 일치 + 숫자 모두 일치 (사용자 입력의 숫자가 핵심 식별자라고 가정)
  if (tokens.length >= 2) {
    const queryNums = tokens.filter((t) => /^\d+$/.test(t));
    const matches = products.filter((x) => {
      const pnNoSpace = (x?.name || '').toLowerCase().replace(/\s+/g, '');
      const hits = tokens.filter((t) => pnNoSpace.includes(t.replace(/\s+/g, ''))).length;
      const ratio = hits / tokens.length;
      const numsAllMatch = queryNums.length === 0 || queryNums.every((n) => pnNoSpace.includes(n));
      return ratio >= 0.7 && numsAllMatch;
    });
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      // 가장 짧은 이름 선택 (불필요한 부가어 적은 게 더 정확한 매치일 가능성)
      return matches.sort((a, b) => (a.name?.length || 0) - (b.name?.length || 0))[0];
    }
  }
  // 7) 압도적 1위 후보 자동 선택 (top1 score >= 50 && top1 - top2 >= 15)
  const scored = scoreProducts(query, products);
  if (scored.length >= 1 && scored[0].score >= 50) {
    const top1 = scored[0];
    const top2 = scored[1];
    if (!top2 || top1.score - top2.score >= 15) {
      return products.find((x) => x.name === top1.name) || null;
    }
  }
  return null;
}

// 내부 스코어 계산 (findProductCandidates와 공유). 공백 무시 비교로 더 관대.
function scoreProducts(query, products) {
  const lower = (query || '').trim().toLowerCase();
  const lowerNoSpace = lower.replace(/\s+/g, '');
  const tokens = tokenize(lower);
  const queryNums = tokens.filter((t) => /^\d+$/.test(t));
  return products
    .map((p) => {
      const pn = (p?.name || '').toLowerCase();
      const pnNoSpace = pn.replace(/\s+/g, '');
      let score = 0;
      if (pnNoSpace === lowerNoSpace) score += 100;
      if (pnNoSpace.includes(lowerNoSpace) || lowerNoSpace.includes(pnNoSpace)) score += 50;
      for (const t of tokens) {
        if (pnNoSpace.includes(t.replace(/\s+/g, ''))) score += 10;
      }
      // 숫자 토큰 모두 매칭 보너스 (54-30 같은 규격 식별자)
      if (queryNums.length > 0 && queryNums.every((n) => pnNoSpace.includes(n))) {
        score += 25;
      }
      if (matchWithTolerance(query, p.name)) score += 30;
      if (score > 0) score += Math.max(0, 20 - pn.length);
      return { name: p.name, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

// 비슷한 제품 후보 TOP N (매칭 실패 시 사용자에게 제안)
// findProductSmart 내부 scoreProducts와 동일한 점수 체계 사용
export function findProductCandidates(query, products, limit = 5) {
  if (!query || !Array.isArray(products)) return [];
  return scoreProducts(query, products).slice(0, limit).map((s) => s.name);
}
