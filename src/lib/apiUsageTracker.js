// MOVIS API 사용량 실시간 트래커 (Gemini + Groq 듀얼)
// localStorage 기반 — 호출 기록 누적, 1초 단위 통계 집계
// 성능: in-memory 캐시 + 주기 flush (3초) — 호출 burst 시 write thrashing 방지

import { getTodayKST } from './utils';

const STORE_KEY = 'movis_api_usage_v1';
const MAX_RECORDS_PER_DAY = 5000; // 하루치 raw 기록 상한 (안전장치)
const BURN_WINDOW_MS = 5 * 60 * 1000; // 5분 burn rate 윈도우
const FLUSH_INTERVAL_MS = 3000; // 3초마다 localStorage flush

// 모델별 가격 (USD per 1M token) — 2025 기준
// https://ai.google.dev/pricing, https://groq.com/pricing
const MODEL_PRICING = {
  // Gemini (generative)
  'gemini-2.5-flash': { in: 0.075, out: 0.30, contextWindow: 1_000_000 },
  'gemini-2.0-flash': { in: 0.10, out: 0.40, contextWindow: 1_000_000 },
  'gemini-1.5-flash': { in: 0.075, out: 0.30, contextWindow: 1_000_000 },
  // Gemini (embedding — 무료티어 무제한 / 유료 input only)
  'text-embedding-004': { in: 0.0, out: 0.0, contextWindow: 2_048 },
  'gemini-embedding-001': { in: 0.0, out: 0.0, contextWindow: 2_048 },
  // Groq
  'llama-3.3-70b-versatile': { in: 0.59, out: 0.79, contextWindow: 128_000 },
  'llama-3.1-70b-versatile': { in: 0.59, out: 0.79, contextWindow: 128_000 },
  'llama-3.1-8b-instant': { in: 0.05, out: 0.08, contextWindow: 128_000 },
  'mixtral-8x7b-32768': { in: 0.24, out: 0.24, contextWindow: 32_768 },
};

// 무료 티어 한도 (보수적 기본값 — 사용자 플랜에 따라 조정 가능)
// Gemini: gemini-2.5-flash 무료 티어 (Google AI Studio 발급키 기준)
// Groq: developer tier 기본값 (developer console 기본값)
// 실제 플랜이 유료라면 localStorage 'movis_api_limits_override'로 덮어쓰기 가능
export const FREE_TIER_LIMITS = {
  gemini: { rpd: 250, rpm: 10 },
  groq: { rpd: 14_400, rpm: 30 },
};

function getEffectiveLimits() {
  try {
    const override = JSON.parse(localStorage.getItem('movis_api_limits_override') || 'null');
    if (override && typeof override === 'object') {
      return {
        gemini: { ...FREE_TIER_LIMITS.gemini, ...(override.gemini || {}) },
        groq: { ...FREE_TIER_LIMITS.groq, ...(override.groq || {}) },
      };
    }
  } catch {}
  return FREE_TIER_LIMITS;
}

// in-memory 캐시 + 주기 flush — burst write 방지
let memCache = null;
let dirty = false;
let flushTimer = null;

function ensureLoaded() {
  if (memCache !== null) return memCache;
  try {
    memCache = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  } catch {
    memCache = {};
  }
  return memCache;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL_MS);
}

function flush() {
  if (!dirty || !memCache) return;
  try {
    // 오늘 데이터만 유지 (용량 관리)
    const today = getTodayKST();
    const trimmed = {};
    if (memCache[today]) trimmed[today] = memCache[today];
    localStorage.setItem(STORE_KEY, JSON.stringify(trimmed));
    memCache = trimmed;
    dirty = false;
  } catch (error) {
    console.warn('API 사용량 저장 실패', error);
  }
}

// 탭 닫기/숨김 시 강제 flush — 데이터 손실 방지
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

const readStore = () => ensureLoaded();

const inferProvider = (model = '') => {
  if (model.startsWith('gemini')) return 'gemini';
  if (model.startsWith('llama') || model.startsWith('mixtral')) return 'groq';
  return 'unknown';
};

const computeCost = (model, promptTokens = 0, candidatesTokens = 0) => {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (promptTokens / 1_000_000) * pricing.in +
         (candidatesTokens / 1_000_000) * pricing.out;
};

/**
 * API 호출 기록.
 * @param {Object} entry
 * @param {string} entry.model - 모델 이름 (예: gemini-2.5-flash)
 * @param {number} entry.promptTokens
 * @param {number} entry.candidatesTokens
 * @param {number} [entry.totalTokens]
 * @param {boolean} entry.ok
 * @param {number} [entry.status] - HTTP status
 * @param {number} [entry.durationMs]
 */
export function recordApiCall(entry) {
  const today = getTodayKST();
  const store = ensureLoaded();
  if (!store[today]) store[today] = [];

  const provider = inferProvider(entry.model);
  const cost = entry.ok
    ? computeCost(entry.model, entry.promptTokens, entry.candidatesTokens)
    : 0;

  store[today].push({
    t: Date.now(),
    m: entry.model,
    p: provider,
    pt: entry.promptTokens || 0,
    ct: entry.candidatesTokens || 0,
    tt: entry.totalTokens || (entry.promptTokens || 0) + (entry.candidatesTokens || 0),
    ok: !!entry.ok,
    s: entry.status || 0,
    d: entry.durationMs || 0,
    c: cost,
  });

  // 상한 초과 시 오래된 것부터 제거
  if (store[today].length > MAX_RECORDS_PER_DAY) {
    store[today] = store[today].slice(-MAX_RECORDS_PER_DAY);
  }

  dirty = true;
  scheduleFlush(); // 3초 후 flush (burst write 방지)
}

/**
 * 현재 컨텍스트 토큰 추정치 저장 (대화 길이용)
 */
export function setContextTokens(tokens) {
  try {
    sessionStorage.setItem('movis_ctx_tokens', String(tokens || 0));
  } catch {}
}

export function getContextTokens() {
  try {
    return parseInt(sessionStorage.getItem('movis_ctx_tokens') || '0', 10);
  } catch {
    return 0;
  }
}

/**
 * 통계 집계 — UI에서 1초마다 호출.
 */
export function getUsageStats() {
  const today = getTodayKST();
  const store = readStore();
  const records = store[today] || [];
  const now = Date.now();

  // 프로바이더별 집계
  const byProvider = { gemini: blankProvider(), groq: blankProvider() };

  let totalCost = 0;
  let burnCost = 0;
  let lastCallAt = 0;

  for (const r of records) {
    const target = byProvider[r.p];
    if (!target) continue;
    target.calls += 1;
    target.tokens.in += r.pt;
    target.tokens.out += r.ct;
    target.tokens.total += r.tt;
    target.cost += r.c;
    if (r.ok) target.success += 1; else target.errors += 1;
    if (r.t > target.lastAt) target.lastAt = r.t;
    if (r.t > lastCallAt) lastCallAt = r.t;
    totalCost += r.c;

    // burn rate 윈도우
    if (now - r.t < BURN_WINDOW_MS) {
      burnCost += r.c;
    }
  }

  // burn rate per hour
  const burnRatePerHour = burnCost * (3600_000 / BURN_WINDOW_MS);

  // 일일 한도 대비 %
  const geminiUsagePct = Math.min(100, (byProvider.gemini.calls / FREE_TIER_LIMITS.gemini.rpd) * 100);
  const groqUsagePct = Math.min(100, (byProvider.groq.calls / FREE_TIER_LIMITS.groq.rpd) * 100);

  // 최근 1분 RPM
  const oneMinAgo = now - 60_000;
  const recentMin = records.filter(r => r.t > oneMinAgo);
  const geminiRpm = recentMin.filter(r => r.p === 'gemini').length;
  const groqRpm = recentMin.filter(r => r.p === 'groq').length;

  // 컨텍스트 토큰 (현재 대화)
  const ctxTokens = getContextTokens();
  // 컨텍스트 윈도우 = 가장 최근 호출한 모델 기준 (없으면 Gemini 2.5 Flash 기본 1M)
  const lastModel = records.length > 0 ? records[records.length - 1].m : 'gemini-2.5-flash';
  const contextWindow = MODEL_PRICING[lastModel]?.contextWindow || 1_000_000;
  const ctxPct = Math.min(100, (ctxTokens / contextWindow) * 100);

  // 폴백 발동 여부 (오늘 Groq 호출이 1건 이상 = 폴백 동작)
  const fallbackActive = byProvider.groq.calls > 0;

  return {
    date: today,
    totalCost,
    burnRatePerHour,
    lastCallAt,
    context: {
      tokens: ctxTokens,
      window: contextWindow,
      pct: ctxPct,
      model: lastModel,
    },
    gemini: {
      ...byProvider.gemini,
      usagePct: geminiUsagePct,
      rpm: geminiRpm,
      rpmLimit: FREE_TIER_LIMITS.gemini.rpm,
      rpdLimit: FREE_TIER_LIMITS.gemini.rpd,
    },
    groq: {
      ...byProvider.groq,
      usagePct: groqUsagePct,
      rpm: groqRpm,
      rpmLimit: FREE_TIER_LIMITS.groq.rpm,
      rpdLimit: FREE_TIER_LIMITS.groq.rpd,
    },
    fallbackActive,
    totalCalls: records.length,
  };
}

function blankProvider() {
  return {
    calls: 0,
    success: 0,
    errors: 0,
    tokens: { in: 0, out: 0, total: 0 },
    cost: 0,
    lastAt: 0,
  };
}

/**
 * 사용량 데이터 전체 삭제 (테스트/리셋용)
 */
export function clearUsage() {
  try {
    localStorage.removeItem(STORE_KEY);
    sessionStorage.removeItem('movis_ctx_tokens');
  } catch {}
}
