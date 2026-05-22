// 제품 매칭 유틸 — TextAnalyze.jsx의 matchWithTolerance 추출 + ai_learning 우선 매칭
// 사용: saveOrder / updateProductStock / updateProductPrice 등 쓰기 도구에서 공유

// 동의어 정규화 맵 (TextAnalyze.jsx에서 이식 + 보강)
// 입력 → 정규화: 사용자가 쓴 표현을 표준 표현으로 통일
const SYNONYMS = {
  // 재질
  '스텐': '스덴', '스테인': '스덴', '스테인레스': '스덴', 'sus': '스덴', 'sts': '스덴', 'stainless': '스덴',
  // 부품
  '밴드': '밴딩', '벤딩': '밴딩', '벤드': '밴딩', 'band': '밴딩', 'banding': '밴딩',
  '후렌지': '플랜지', '후란지': '플랜지', 'flange': '플랜지',
  '엘보우': '엘보', 'elbow': '엘보',
  '레듀서': '레듀샤', '리듀서': '레듀샤', 'reducer': '레듀샤',
  '니쁠': '니플', 'nipple': '니플',
  '쏘켓': '소켓', 'socket': '소켓',
  '유니언': '유니온', 'union': '유니온',
  '붓싱': '부싱', 'bushing': '부싱',
  '커플링': '카플링', 'coupling': '카플링',
  '겐또': '게이트', 'gate': '게이트',
  '볼벨브': '볼밸브',
  '첵크': '체크', 'check': '체크',
  // 통칭 → 코드
  '직관레조': 'CH', '직관 레조': 'CH', '공갈레조': 'CH', '뻥레조': 'CH',
  '가변소음기': 'TVB', '가변': 'TVB', '진공가변': 'TVB',
  // 약어
  '다파': '다운파이프', 'dp': '다운파이프', 'downpipe': '다운파이프', 'down pipe': '다운파이프',
  '머플러': '머플러', 'muffler': '머플러', '소음기': '머플러',
  'pipe': '파이프',
};

function applySynonyms(text) {
  if (!text) return text;
  let result = String(text).toLowerCase();
  Object.entries(SYNONYMS).forEach(([key, value]) => {
    result = result.replace(new RegExp(key.toLowerCase(), 'gi'), value);
  });
  return result;
}

// 숫자+단위 추출 (파이/mm/cm/인치/A/B/호) — TextAnalyze에서 이식
function extractNumberUnits(text) {
  if (!text) return [];
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(파이|pai|phi|mm|cm|m|인치|inch|")/gi,
    /(\d+(?:\.\d+)?)\s*(A|B|호)/gi,
  ];
  const units = [];
  patterns.forEach((p) => {
    let m;
    while ((m = p.exec(text)) !== null) {
      units.push({ number: parseFloat(m[1]), unit: m[2].toLowerCase() });
    }
  });
  return units;
}

// 초성 추출 — "스덴밴딩" → "ㅅㄷㅂㄷ"
const CHOSEONG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
function getChoseong(text) {
  if (!text) return '';
  let result = '';
  for (const ch of String(text)) {
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const idx = Math.floor((code - 0xAC00) / 588);
      result += CHOSEONG[idx];
    } else if (CHOSEONG.includes(ch)) {
      result += ch;
    }
  }
  return result;
}

// Levenshtein 거리 (편집 거리)
function levenshteinDistance(a, b) {
  if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]) + 1;
    }
  }
  return dp[m][n];
}

function getSimilarity(a, b) {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

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

// 🧠 비동기 벡터 검색 (pgvector + Gemini Embedding) — 0단계
// Codex 권장 threshold: 0.75 즉시 / 0.52 후보
// 한영 혼용 (스덴/STS/Stainless)에서 유사도 0.6~0.65 → 0.75 임계가 적정
export async function findProductSmartAsync(query, products, aiLearningData) {
  try {
    const trimmed = String(query || '').trim();
    if (trimmed.length >= 2) {
      const { embedQuery } = await import('./embedding');
      const { supabase } = await import('./supabase');
      // 입력 텍스트도 동의어 확장 후 임베딩 (한국어 표기 비표준화 보정)
      const expanded = applySynonyms(trimmed);
      const vec = await embedQuery(expanded);
      if (vec) {
        const matches = await supabase.searchProductsByVector(vec, { threshold: 0.52, limit: 5 });
        if (matches && matches.length > 0 && matches[0].similarity >= 0.75) {
          // 강한 매칭 → 즉시 반환
          const top = matches[0];
          return (products || []).find((p) => p.id === top.id) || top;
        }
      }
    }
  } catch (e) {
    console.warn('Vector search fallback:', e?.message);
  }
  // 기존 7단계 fuzzy fallback
  return findProductSmart(query, products, aiLearningData);
}

// 제품 임베딩 텍스트 구성 (Codex 권장 — name + 동의어 2~3개 + spec)
// 예: "스덴 / 스덴 밴딩 파이프 38-45 (스텐/STS/벤딩)"
export function buildProductEmbeddingText(product) {
  if (!product) return '';
  const name = String(product.name || '').trim();
  const category = String(product.category || '').trim();
  // 동의어 자동 확장 (제품명/카테고리에서 키워드 발견 시)
  const found = new Set();
  const lower = `${name} ${category}`.toLowerCase();
  Object.entries(SYNONYMS).forEach(([key, value]) => {
    if (lower.includes(value.toLowerCase()) || lower.includes(key.toLowerCase())) {
      found.add(key);
      found.add(value);
    }
  });
  // 본인은 제외
  const synonymList = [...found].filter((s) => !lower.includes(s.toLowerCase())).slice(0, 3);
  const parts = [];
  if (category) parts.push(category);
  parts.push(name);
  if (synonymList.length > 0) parts.push(`(${synonymList.join('/')})`);
  return parts.join(' / ');
}

// 거래처 임베딩 텍스트
export function buildCustomerEmbeddingText(customer) {
  if (!customer) return '';
  return [customer.name, customer.address].filter(Boolean).join(' / ');
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

// 내부 스코어 계산 — TextAnalyze.jsx calculateMatchScore 완전 이식 + 보강
// 1000점 만점 시스템 (정확 일치 = 1000)
function scoreProducts(query, products) {
  const lower = (query || '').trim().toLowerCase();
  const lowerNoSpace = lower.replace(/\s+/g, '');
  const tokens = tokenize(lower);
  const queryNums = tokens.filter((t) => /^\d+$/.test(t));
  const queryWithSyn = applySynonyms(lower);
  const queryChoseong = getChoseong(lowerNoSpace);
  const queryUnits = extractNumberUnits(query);
  return products
    .map((p) => {
      const pn = (p?.name || '').toLowerCase();
      const pnNoSpace = pn.replace(/\s+/g, '');
      const pnWithSyn = applySynonyms(pn);
      const pnChoseong = getChoseong(pnNoSpace);
      const productUnits = extractNumberUnits(p?.name || '');
      let score = 0;

      // 정확 일치 = 압도적 (이전 100 → 1000)
      if (pnNoSpace === lowerNoSpace) return { name: p.name, score: 1000 };

      // 부분 일치 가산
      if (pnNoSpace.includes(lowerNoSpace)) score += 100 + lowerNoSpace.length * 5;
      // 동의어 적용 후 부분 일치
      if (pnWithSyn.replace(/\s+/g, '').includes(queryWithSyn.replace(/\s+/g, ''))) score += 80 + lowerNoSpace.length * 4;

      // 토큰 매칭
      for (const t of tokens) {
        if (pnNoSpace.includes(t.replace(/\s+/g, ''))) score += 10;
      }

      // 숫자+단위 매칭 (파이/mm/인치 등) — TextAnalyze 핵심 알고리즘
      queryUnits.forEach((su) => {
        productUnits.forEach((pu) => {
          const diff = Math.abs(su.number - pu.number);
          if (diff === 0) {
            score += 50;
            if (su.unit === pu.unit || (su.unit === '파이' && pu.unit === 'mm')) score += 30;
          } else if (diff <= 1) {
            score += 35;
            if (su.unit === pu.unit) score += 20;
          }
        });
      });

      // 파트 순서 보너스 (한글/영문/숫자 순서대로 등장)
      const searchParts = lower.match(/[가-힣a-z]+|\d+/gi) || [];
      if (searchParts.length > 0) {
        let lastIndex = -1, sequentialMatches = 0;
        searchParts.forEach((part) => {
          const foundIndex = pn.indexOf(part, lastIndex + 1);
          if (foundIndex > lastIndex) {
            sequentialMatches++;
            lastIndex = foundIndex + part.length - 1;
            score += part.length * 3;
          }
        });
        if (sequentialMatches === searchParts.length && searchParts.length > 1) score += 40;
      }

      // 단어별 매칭 + fuzzy
      const searchWords = lower.split(/[\s\-_]+/).filter((w) => w.length > 0);
      const productWords = pn.split(/[\s\-_]+/).filter((w) => w.length > 0);
      let matchedWords = 0;
      searchWords.forEach((word) => {
        const synonymWord = applySynonyms(word);
        if (pnNoSpace.includes(word) || pnWithSyn.includes(synonymWord)) {
          matchedWords++;
          score += word.length * 2;
        } else if (word.length >= 2) {
          let bestSim = 0;
          productWords.forEach((pw) => {
            if (pw.length >= 2) {
              const sim = getSimilarity(word, pw);
              if (sim > bestSim) bestSim = sim;
            }
          });
          if (bestSim >= 0.7) {
            matchedWords++;
            score += Math.floor(word.length * bestSim * 1.5);
          }
        }
      });
      if (matchedWords === searchWords.length && searchWords.length > 1) score += 30;

      // 초성 매칭 ("ㅅㄷㅂㄷ" → "스덴밴딩")
      if (queryChoseong.length >= 2 && pnChoseong.includes(queryChoseong)) score += 20;

      // 매칭 비율 보너스 (짧은 쿼리가 긴 제품명에 잘 포함될 때)
      if (score > 0) {
        const matchRatio = lowerNoSpace.length / Math.max(1, pnNoSpace.length);
        if (matchRatio > 0.5) score += Math.floor(matchRatio * 20);
      }

      // 전체 유사도 (Levenshtein)
      const overallSim = getSimilarity(lowerNoSpace, pnNoSpace);
      if (overallSim >= 0.6) score += Math.floor(overallSim * 30);

      // 숫자 토큰 모두 매칭 (54-30 같은 규격 식별자)
      if (queryNums.length > 0 && queryNums.every((n) => pnNoSpace.includes(n))) {
        score += 25;
      }

      if (matchWithTolerance(query, p.name)) score += 30;

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
