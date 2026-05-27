// 거래처/제품 공통 fuzzy 매칭 — productMatch.js의 Levenshtein/초성 패턴 재사용
// Codex 위험 분석 반영: top1 자동 선택 금지, 정확 매칭만 exact로 통과

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

function similarity(a, b) {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

function normalize(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * 거래처/제품 등 임의 항목의 매칭 상태 + 후보 계산.
 *
 * 매칭 상태:
 * - 'exact':     정확히 일치 (대소문자/공백 무시)
 * - 'candidate': 유사 후보 있음 (top 0.6 이상)
 * - 'missing':   매칭 안 됨 (후보 없음)
 *
 * Codex 위험: top1 자동 선택 금지 → 'candidate' 상태에서는 사용자 명시 선택 필요
 *
 * @param {string} query - 사용자 입력
 * @param {Array<{id: any, name: string}>} items - 검색 대상 (customers / products)
 * @param {Object} [options]
 * @param {number} [options.maxCandidates=3] - 반환할 후보 최대 개수
 * @param {number} [options.threshold=0.6] - 후보 유사도 최소 임계
 * @returns {{ status: 'exact'|'candidate'|'missing', exact: object|null, candidates: Array<{item, score, reason}> }}
 */
export function matchItem(query, items, options = {}) {
  const { maxCandidates = 3, threshold = 0.6 } = options;
  const list = Array.isArray(items) ? items : [];
  const q = normalize(query);
  if (!q || list.length === 0) {
    return { status: 'missing', exact: null, candidates: [] };
  }

  // 1) 정확 매칭 (case/space-insensitive)
  const exact = list.find((it) => normalize(it?.name) === q);
  if (exact) {
    return { status: 'exact', exact, candidates: [] };
  }

  // 2) 후보 점수 계산 (각 항목별 다중 지표 → max)
  const qChoseong = getChoseong(query);
  const scored = list.map((it) => {
    const name = String(it?.name || '');
    const n = normalize(name);
    if (!n) return { item: it, score: 0, reason: '' };

    // a) 부분 일치 — DB이름이 입력을 포함하거나 그 반대
    //    "오토심슨"(DB) ⊂ "대구 오토심슨"(입력) → DB가 짧고 입력이 긴 케이스
    //    "오토심슨 대구"(DB) ⊃ "오토심슨"(입력) → DB가 길고 입력이 짧은 케이스
    let containScore = 0;
    let containReason = '';
    if (n === q) {
      containScore = 1.0;
      containReason = '정확';
    } else if (n.includes(q)) {
      containScore = q.length / n.length;
      containReason = `'${query}' 포함`;
    } else if (q.includes(n)) {
      containScore = n.length / q.length;
      containReason = `'${name}' 포함`;
    }

    // b) Levenshtein 유사도
    const sim = similarity(n, q);

    // c) 초성 매칭 ("오토" → "ㅇㅌ")
    const choseongName = getChoseong(name);
    const choseongMatch = qChoseong && choseongName && choseongName.includes(qChoseong)
      ? qChoseong.length / Math.max(choseongName.length, 1)
      : 0;

    // d) 토큰 단위 매칭 — "대구 오토심슨" → ["대구","오토심슨"]
    const qTokens = String(query).toLowerCase().split(/\s+/).filter(Boolean);
    const tokenHits = qTokens.filter((t) => n.includes(normalize(t))).length;
    const tokenScore = qTokens.length > 0 ? tokenHits / qTokens.length : 0;

    const score = Math.max(containScore, sim, choseongMatch, tokenScore);
    let reason = containReason || (sim > 0.7 ? '비슷한 글자' : choseongMatch > 0.5 ? '초성 일치' : tokenScore > 0 ? `${tokenHits}/${qTokens.length} 단어 일치` : '');

    return { item: it, score, reason };
  });

  const candidates = scored
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCandidates);

  if (candidates.length === 0) {
    return { status: 'missing', exact: null, candidates: [] };
  }

  return { status: 'candidate', exact: null, candidates };
}

/**
 * 거래처 매칭 (matchItem의 alias — 가독성)
 */
export function matchCustomer(query, customers, options) {
  return matchItem(query, customers, options);
}
