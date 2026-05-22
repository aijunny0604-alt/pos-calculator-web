// Gemini Embedding API (text-embedding-004) — 무료, 분당 1500
// 제품/거래처 텍스트를 768차원 벡터로 변환 → pgvector 의미 검색
//
// 사용:
//   const vec = await embedText('스덴 밴딩 파이프 38-45');
//   // → [0.123, -0.456, ...] (768차원)
//
// 설정:
//   localStorage 'geminiApiKey' (또는 내장 키 4개 자동 사용)

const EMBED_MODEL = 'text-embedding-004'; // Gemini 무료 임베딩
const EMBED_DIM = 768;
const BATCH_SIZE = 100; // 일괄 처리 단위

// Gemini 키 (geminiAnalyst.js와 동일)
function getGeminiKeys() {
  const keys = [];
  try { keys.push(atob('QUl6YVN5REpkWGxXMUx5MUVFOTJGZ2NUMmloemszcjV0Z040MGdz')); } catch {}
  try { keys.push(atob('QUl6YVN5RFpaT2wxZmF0WC1OcDQyQjliLTRBSHZiSEtONzZKOEQ0')); } catch {}
  try { keys.push(atob('QUl6YVN5Q3NaRzM4OER6RFJBbS1Nem9wUFo4VU11RHBiYW5ETlB3')); } catch {}
  try { keys.push(atob('QUl6YVN5QkZtcDhZYzB4VDBkQzA3ODRNNnc2c01JQm9aSVlIOFBj')); } catch {}
  try {
    const stored = localStorage.getItem('geminiApiKey');
    if (stored && !keys.includes(stored)) keys.push(stored);
  } catch {}
  return keys;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 단일 텍스트 → 768차원 벡터
 */
export async function embedText(text, { taskType = 'RETRIEVAL_DOCUMENT' } = {}) {
  if (!text || !text.trim()) return null;
  const keys = getGeminiKeys();
  if (keys.length === 0) throw new Error('Gemini 키 없음');

  for (const key of keys) {
    for (let retry = 0; retry < 3; retry++) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: { parts: [{ text: text.slice(0, 2000) }] },
              taskType,
            }),
          }
        );
        if (response.ok) {
          const data = await response.json();
          return data?.embedding?.values || null;
        }
        if (response.status === 429 || response.status === 503) {
          await sleep(1500);
          continue;
        }
        // 다음 키 시도
        break;
      } catch (e) {
        await sleep(500);
      }
    }
  }
  throw new Error('Embedding API 호출 실패 (모든 키)');
}

/**
 * 여러 텍스트를 일괄 임베딩 (분당 1500 제한 고려 — 70ms 간격)
 * @param {string[]} texts
 * @param {(idx, total) => void} onProgress
 */
export async function embedBatch(texts, onProgress) {
  const results = [];
  const total = texts.length;
  for (let i = 0; i < total; i++) {
    try {
      const vec = await embedText(texts[i]);
      results.push(vec);
    } catch (e) {
      console.warn(`Embed 실패 [${i}] "${texts[i]}":`, e?.message);
      results.push(null);
    }
    onProgress?.(i + 1, total);
    // 분당 1500 = 초당 25 = 40ms 간격 (안전 마진 70ms)
    if (i < total - 1) await sleep(70);
  }
  return results;
}

/**
 * 쿼리 텍스트 임베딩 (검색용 — taskType 다름)
 */
export async function embedQuery(query) {
  return embedText(query, { taskType: 'RETRIEVAL_QUERY' });
}

/**
 * 코사인 유사도 (-1 ~ 1, 클수록 유사)
 */
export function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export const EMBEDDING_DIM = EMBED_DIM;
export const EMBEDDING_BATCH_SIZE = BATCH_SIZE;
