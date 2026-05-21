import { GEMINI_TOOLS, executeTool, ANALYST_SYSTEM_PROMPT } from './geminiTools';
import { getTodayKST } from './utils';

const CACHE_KEY = 'pos_ai_cache_v1';
const CACHE_TTL = 300000;
const MAX_CACHE_ENTRIES = 100;
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

const getGeminiKeys = () => {
  const keys = [];
  // 내장 키 (프로젝트별 분리, 할당량 분산용 최신 키 우선)
  try { keys.push(atob('QUl6YVN5REpkWGxXMUx5MUVFOTJGZ2NUMmloemszcjV0Z040MGdz')); } catch {} // 프로젝트D
  try { keys.push(atob('QUl6YVN5RFpaT2wxZmF0WC1OcDQyQjliLTRBSHZiSEtONzZKOEQ0')); } catch {} // 프로젝트C
  try { keys.push(atob('QUl6YVN5Q3NaRzM4OER6RFJBbS1Nem9wUFo4VU11RHBiYW5ETlB3')); } catch {} // 프로젝트B
  try { keys.push(atob('QUl6YVN5QkZtcDhZYzB4VDBkQzA3ODRNNnc2c01JQm9aSVlIOFBj')); } catch {} // 프로젝트A
  const stored = localStorage.getItem('geminiApiKey');
  if (stored && !keys.includes(stored)) keys.push(stored);
  return keys;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const normalizeQuestion = (question) => question.trim().toLowerCase().replace(/\s+/g, ' ');

const getCacheHash = (question) => `${normalizeQuestion(question)}|${getTodayKST()}`;

const readCache = () => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
};

const writeCache = (cache) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn('AI 캐시 저장 실패', error);
  }
};

const getCachedAnswer = (question) => {
  const cache = readCache();
  const hash = getCacheHash(question);
  const entry = cache[hash];

  if (!entry) return null;

  if (Date.now() - entry.ts > CACHE_TTL) {
    delete cache[hash];
    writeCache(cache);
    return null;
  }

  return entry;
};

const saveCachedAnswer = (question, answer, toolCalls) => {
  const cache = readCache();
  const hash = getCacheHash(question);

  cache[hash] = {
    answer,
    toolCalls,
    ts: Date.now(),
    question,
  };

  const entries = Object.entries(cache);
  if (entries.length > MAX_CACHE_ENTRIES) {
    // WHY: localStorage 용량을 예측 가능하게 유지하려고 가장 오래된 항목부터 제거한다.
    entries
      .sort(([, a], [, b]) => (a?.ts || 0) - (b?.ts || 0))
      .slice(0, entries.length - MAX_CACHE_ENTRIES)
      .forEach(([key]) => {
        delete cache[key];
      });
  }

  writeCache(cache);
};

const getErrorMessage = (status, fallback) => {
  if (status === 429) return 'AI 일일 사용량 초과 — 잠시 후 다시 시도하세요';
  if (status === 503) return 'AI 서버 일시 장애';
  if (status === 403) return 'AI 접근 권한 없음';
  return fallback || `AI 서버 오류 (${status || '연결 실패'})`;
};

const postGemini = async (contents, { signal } = {}) => {
  const keys = getGeminiKeys();
  let lastStatus = null;
  let lastMessage = '';

  for (const model of MODELS) {
    for (const key of keys) {
      for (let retry = 0; retry < 3; retry++) {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
              system_instruction: { parts: [{ text: ANALYST_SYSTEM_PROMPT }] },
              contents,
              tools: [{ function_declarations: GEMINI_TOOLS }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
            }),
          }
        );

        if (response.ok) return response.json();

        lastStatus = response.status;
        try {
          const errorBody = await response.json();
          lastMessage = errorBody.error?.message?.split('.')[0] || '';
        } catch {
          lastMessage = '';
        }

        if (response.status === 503 && retry < 2) {
          await sleep(2000);
          continue;
        }

        break;
      }
    }
  }

  throw new Error(getErrorMessage(lastStatus, lastMessage));
};

export async function askAnalyst(question, context, options = {}) {
  const {
    signal,
    onProgress,
    maxIterations = 5,
    skipCache,
  } = options;

  const toolCalls = [];
  let iterations = 0;

  try {
    if (!skipCache) {
      const cached = getCachedAnswer(question);
      if (cached) {
        return {
          answer: cached.answer,
          toolCalls: cached.toolCalls,
          iterations: 0,
          cached: true,
        };
      }
    }

    const contents = [{ role: 'user', parts: [{ text: question }] }];
    // WHY: 같은 함수와 같은 인자를 반복 호출하면 모델 루프가 길어지고 비용이 늘어 중복 실행을 막는다.
    const seenCalls = new Set();

    while (iterations < maxIterations) {
      const data = await postGemini(contents, { signal });
      const parts = data.candidates?.[0]?.content?.parts || [];
      const functionCalls = parts
        .filter(part => part.functionCall)
        .map(part => part.functionCall);

      if (functionCalls.length === 0) {
        const answer = parts[0]?.text || '';
        saveCachedAnswer(question, answer, toolCalls);
        return { answer, toolCalls, iterations, cached: false };
      }

      const newCalls = functionCalls.filter(call => {
        const callKey = call.name + JSON.stringify(call.args || {});
        if (seenCalls.has(callKey)) return false;
        seenCalls.add(callKey);
        return true;
      });

      if (newCalls.length === 0) {
        return {
          answer: '최대 반복 횟수 초과 — 중간 결과를 확인하세요',
          toolCalls,
          iterations,
          cached: false,
        };
      }

      contents.push({
        role: 'model',
        parts: newCalls.map(functionCall => ({ functionCall })),
      });

      // WHY: 독립적인 분석 도구 호출은 병렬 실행해 응답 지연을 줄인다.
      const results = await Promise.all(newCalls.map(async (call) => {
        onProgress?.(call);
        let result;
        try {
          result = await executeTool(call.name, call.args, context);
        } catch (error) {
          result = { error: error.message };
        }
        return { call, result };
      }));

      results.forEach(({ call, result }) => {
        toolCalls.push({ name: call.name, args: call.args, result });
        contents.push({
          role: 'function',
          parts: [{
            functionResponse: {
              name: call.name,
              response: { result },
            },
          }],
        });
      });

      iterations++;
    }

    return {
      answer: '최대 반복 횟수 초과 — 중간 결과를 확인하세요',
      toolCalls,
      iterations,
      cached: false,
    };
  } catch (error) {
    return {
      answer: error.message || 'AI 오류',
      toolCalls,
      iterations,
      cached: false,
      error: error.message,
    };
  }
}

export function clearAnalystCache() {
  localStorage.removeItem(CACHE_KEY);
}

export function getCacheStats() {
  const cache = readCache();
  const timestamps = Object.values(cache)
    .map(entry => entry?.ts)
    .filter(ts => typeof ts === 'number');

  if (timestamps.length === 0) {
    return { size: 0, oldest: null, newest: null };
  }

  return {
    size: timestamps.length,
    oldest: Math.min(...timestamps),
    newest: Math.max(...timestamps),
  };
}
