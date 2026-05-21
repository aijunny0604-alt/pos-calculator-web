// RFM 분석 — Recency / Frequency / Monetary 점수 계산 + 5세그먼트 분류
//
// R (Recency): 마지막 주문 경과일. 짧을수록 점수↑
// F (Frequency): 기간 내 주문 건수. 많을수록 점수↑
// M (Monetary): 기간 내 총 매출. 클수록 점수↑
//
// 각 1~5점, 합산 점수와 패턴으로 세그먼트 분류
// 임계값은 LocalStorage 조정 가능 (pos_ai_rfm_thresholds_v1)

import {
  daysSinceLastOrder,
  sumRevenue,
  filterByPeriod,
  groupByCustomer,
} from './aggregations';

// 기본 임계값 (자동차 튜닝 업종 — 재구매 주기 길 수 있어 보수적 세팅)
// Recency 일수: 작을수록 점수↑ (역순)
// Frequency 건수: 클수록 점수↑
// Monetary 원: 클수록 점수↑
export const DEFAULT_RFM_THRESHOLDS = {
  // 마지막 주문 경과일 (3개월 기준)
  recency: [14, 30, 60, 90], // 점수 5=≤14일, 4=≤30일, 3=≤60일, 2=≤90일, 1=>90일
  // 기간 내 주문 건수
  frequency: [1, 2, 4, 7], // 점수 1=1건, 2=2~3건, 3=4~6건, 4=7~10건, 5=>10건
  // 기간 내 총 매출 (원)
  monetary: [100000, 500000, 1500000, 4000000], // 점수 1=≤10만, 2=≤50만, 3=≤150만, 4=≤400만, 5=>400만
};

const STORAGE_KEY = 'pos_ai_rfm_thresholds_v1';

// LocalStorage에서 임계값 로드 (없으면 기본값)
export function loadRFMThresholds() {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_RFM_THRESHOLDS;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RFM_THRESHOLDS;
    const parsed = JSON.parse(raw);
    // 형식 검증
    if (
      Array.isArray(parsed.recency) &&
      parsed.recency.length === 4 &&
      Array.isArray(parsed.frequency) &&
      parsed.frequency.length === 4 &&
      Array.isArray(parsed.monetary) &&
      parsed.monetary.length === 4
    ) {
      return parsed;
    }
  } catch {
    /* fall through */
  }
  return DEFAULT_RFM_THRESHOLDS;
}

export function saveRFMThresholds(thresholds) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds));
    return true;
  } catch {
    return false;
  }
}

// Recency 점수 (낮을수록 = 최근일수록 5점)
export function scoreRecency(days, thresholds = DEFAULT_RFM_THRESHOLDS) {
  if (days == null || !Number.isFinite(Number(days))) return 0;
  const d = Number(days);
  const [t1, t2, t3, t4] = thresholds.recency;
  if (d <= t1) return 5;
  if (d <= t2) return 4;
  if (d <= t3) return 3;
  if (d <= t4) return 2;
  return 1;
}

// Frequency 점수 (높을수록 5점)
export function scoreFrequency(count, thresholds = DEFAULT_RFM_THRESHOLDS) {
  const c = Number(count) || 0;
  const [t1, t2, t3, t4] = thresholds.frequency;
  if (c >= t4) return 5;
  if (c >= t3) return 4;
  if (c >= t2) return 3;
  if (c >= t1) return 2;
  return 1;
}

// Monetary 점수 (높을수록 5점)
export function scoreMonetary(amount, thresholds = DEFAULT_RFM_THRESHOLDS) {
  const a = Number(amount) || 0;
  const [t1, t2, t3, t4] = thresholds.monetary;
  if (a >= t4) return 5;
  if (a >= t3) return 4;
  if (a >= t2) return 3;
  if (a >= t1) return 2;
  return 1;
}

// 세그먼트 분류
// - Champion: R≥4 && F≥4 && M≥4 (최우선 관리)
// - Loyal: R≥3 && F≥3 (안정 단골)
// - At-Risk: R≤2 && (F≥3 || M≥3) (과거 VIP인데 최근 뜸함 → 재유도)
// - New: R≥4 && F≤2 (신규, 정착 유도)
// - Lost: R≤1 && F≤2 (휴면)
// - Regular: 위 어디에도 안 속함 (기본)
export function classifySegment({ r, f, m }) {
  const R = Number(r) || 0;
  const F = Number(f) || 0;
  const M = Number(m) || 0;
  if (R >= 4 && F >= 4 && M >= 4) return 'Champion';
  if (R >= 4 && F <= 2) return 'New';
  if (R <= 1 && F <= 2) return 'Lost';
  if (R <= 2 && (F >= 3 || M >= 3)) return 'At-Risk';
  if (R >= 3 && F >= 3) return 'Loyal';
  return 'Regular';
}

export const SEGMENT_META = {
  Champion: { label: 'VIP (Champion)', color: '#10b981', priority: 1, action: '최우선 관리 — 신제품 우선 안내, 특별 혜택' },
  Loyal: { label: '단골 (Loyal)', color: '#3b82f6', priority: 2, action: '안정 유지 — 정기 알림, 추가 추천' },
  'At-Risk': { label: '이탈 위험 (At-Risk)', color: '#f59e0b', priority: 1, action: '재유도 — 컴백 프로모션, 개인 연락' },
  New: { label: '신규 (New)', color: '#8b5cf6', priority: 2, action: '정착 유도 — 환영 메시지, 인기 제품 안내' },
  Lost: { label: '휴면 (Lost)', color: '#6b7280', priority: 3, action: '저순위 — 비용 효율적 일괄 캠페인' },
  Regular: { label: '일반 (Regular)', color: '#94a3b8', priority: 3, action: '관찰 — 패턴 변화 모니터링' },
};

// 거래처 1명의 RFM 점수 + 세그먼트 산출
// orders: 해당 거래처의 모든 주문 배열
// period: 'ALL' | '1M' | '3M' 등 (Frequency/Monetary 산출 기준)
export function calcCustomerRFM(customerOrders, { period = '3M', today, thresholds } = {}) {
  const th = thresholds || loadRFMThresholds();
  const recencyDays = daysSinceLastOrder(customerOrders, today);
  const periodOrders = filterByPeriod(customerOrders, period, today);
  const frequency = periodOrders.length;
  const monetary = sumRevenue(periodOrders);
  const r = scoreRecency(recencyDays, th);
  const f = scoreFrequency(frequency, th);
  const m = scoreMonetary(monetary, th);
  return {
    recencyDays,
    frequency,
    monetary,
    r,
    f,
    m,
    score: r + f + m,
    segment: classifySegment({ r, f, m }),
  };
}

// 전체 거래처에 대한 RFM 분석 + 세그먼트별 묶음
// 반환: { byCustomer: Map, bySegment: { Champion: [...], Loyal: [...], ... } }
export function analyzeAllCustomers(orders, customers, options = {}) {
  const { period = '3M', today, minOrders = 1, thresholds } = options;
  const grouped = groupByCustomer(orders);
  const byCustomer = new Map();
  const bySegment = {
    Champion: [],
    Loyal: [],
    'At-Risk': [],
    New: [],
    Lost: [],
    Regular: [],
  };
  // customer 마스터에서 id/연락처 lookup
  const customerByName = new Map(
    (customers || []).map((c) => [(c?.name || '').trim().toLowerCase(), c])
  );
  for (const [key, group] of grouped.entries()) {
    if (key === '__unknown') continue;
    if (group.orders.length < minOrders) continue;
    const rfm = calcCustomerRFM(group.orders, { period, today, thresholds });
    const customer = customerByName.get(key);
    const entry = {
      customerKey: key,
      name: group.name,
      customerId: customer?.id ?? null,
      phone: customer?.phone || '',
      address: customer?.address || '',
      orderCount: group.orders.length, // 전 기간 누적 주문수
      ...rfm,
    };
    byCustomer.set(key, entry);
    bySegment[rfm.segment].push(entry);
  }
  // 각 세그먼트는 점수 높은 순 → 매출 높은 순으로 정렬
  for (const seg of Object.keys(bySegment)) {
    bySegment[seg].sort((a, b) => b.score - a.score || b.monetary - a.monetary);
  }
  return { byCustomer, bySegment };
}
