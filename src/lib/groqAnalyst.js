// Groq Function Calling 클라이언트 (Gemini 폴백용)
// OpenAI 호환 API라 도구 스키마/응답 형식이 Gemini와 다름 → 어댑터 내장
//
// 모델: llama-3.3-70b-versatile (무료, function calling 지원)
// 백업: llama-3.1-70b-versatile
//
// 키 저장: localStorage 'groqApiKey' (사용자가 직접 발급)
// 미설정 시 askGroq는 throw → dispatcher가 catch해서 Gemini 사용

import { GEMINI_TOOLS, executeTool, buildSystemPrompt } from './geminiTools';
import { recordApiCall, setContextTokens } from './apiUsageTracker';

const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile'];
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

// Groq 키는 localStorage에서만 로드 (GitHub Secret Scanning 회피 + 클라이언트 노출 최소화)
// 사용자가 AIAnalytics 헤더 ⚙️ 버튼으로 입력
export function getGroqKey() {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('groqApiKey');
      if (stored && stored.startsWith('gsk_')) return stored;
    }
  } catch {}
  return '';
}

export function hasGroqKey() {
  return Boolean(getGroqKey());
}

/**
 * 범용 Groq Chat (Function Calling 없이) — TextAnalyze.jsx 폴백용
 * @param {string} prompt
 * @param {object} options — { signal, temperature, maxTokens, jsonMode }
 * @returns {Promise<string>} text response
 */
export async function askGroqChat(prompt, { signal, temperature = 0.1, maxTokens = 8192, jsonMode = false } = {}) {
  const key = getGroqKey();
  if (!key) throw new Error('GROQ_NO_KEY');

  for (const model of MODELS) {
    for (let retry = 0; retry < 3; retry++) {
      const body = {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
      };
      if (jsonMode) body.response_format = { type: 'json_object' };

      const startedAt = Date.now();
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      });
      const durationMs = Date.now() - startedAt;

      if (response.ok) {
        const data = await response.json();
        const usage = data.usage || {};
        recordApiCall({
          model,
          promptTokens: usage.prompt_tokens || 0,
          candidatesTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
          ok: true, status: response.status, durationMs,
        });
        if (usage.prompt_tokens) setContextTokens(usage.prompt_tokens);
        return data?.choices?.[0]?.message?.content || '';
      }

      // 실패 기록
      recordApiCall({
        model, promptTokens: 0, candidatesTokens: 0, totalTokens: 0,
        ok: false, status: response.status, durationMs,
      });

      if ((response.status === 429 || response.status === 503) && retry < 2) {
        await sleep(2000);
        continue;
      }
      break;
    }
  }
  throw new Error('Groq Chat 호출 실패');
}

// Gemini 도구 스키마 → OpenAI tools 형식 변환
function toOpenAITools(geminiTools) {
  return geminiTools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postGroq(messages, { signal } = {}) {
  const key = getGroqKey();
  if (!key) throw new Error('GROQ_NO_KEY');

  let lastStatus = null;
  let lastMessage = '';

  for (const model of MODELS) {
    for (let retry = 0; retry < 3; retry++) {
      const startedAt = Date.now();
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages,
          tools: toOpenAITools(GEMINI_TOOLS),
          tool_choice: 'auto',
          temperature: 0.2,
          max_tokens: 4096,
        }),
      });

      const durationMs = Date.now() - startedAt;

      if (response.ok) {
        const json = await response.json();
        const usage = json.usage || {};
        recordApiCall({
          model,
          promptTokens: usage.prompt_tokens || 0,
          candidatesTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
          ok: true,
          status: response.status,
          durationMs,
        });
        // 컨텍스트 길이 = 입력 토큰만 (출력 제외). 다음 호출의 prompt 크기 추정
        if (usage.prompt_tokens) setContextTokens(usage.prompt_tokens);
        return json;
      }

      lastStatus = response.status;
      try {
        const err = await response.json();
        lastMessage = err?.error?.message || '';
      } catch {
        lastMessage = '';
      }

      // 실패 기록
      recordApiCall({
        model,
        promptTokens: 0,
        candidatesTokens: 0,
        totalTokens: 0,
        ok: false,
        status: response.status,
        durationMs,
      });

      // 429 (한도) / 503 (서버) 재시도, 그 외는 다음 모델
      if ((response.status === 429 || response.status === 503) && retry < 2) {
        await sleep(2000);
        continue;
      }
      break;
    }
  }

  if (lastStatus === 401) throw new Error('Groq API 키가 올바르지 않습니다');
  if (lastStatus === 429) throw new Error('Groq 사용량 초과 — 잠시 후 다시 시도');
  if (lastStatus === 503) throw new Error('Groq 서버 일시 장애');
  throw new Error(`Groq 오류 (${lastStatus || '연결 실패'}) ${lastMessage}`.trim());
}

/**
 * Groq Function Calling 루프 (askAnalyst 동일 인터페이스)
 * @param {string} question
 * @param {{orders, customers, products}} context
 * @param {object} options — { signal, onProgress, maxIterations }
 * @returns {Promise<{answer, toolCalls, iterations, cached:false, provider:'groq', error?}>}
 */
export async function askGroq(question, context, options = {}) {
  const { signal, onProgress, maxIterations = 5, history = [] } = options;
  const toolCalls = [];
  let iterations = 0;

  if (!hasGroqKey()) {
    return { answer: 'Groq 키가 설정되지 않았습니다.', toolCalls, iterations, cached: false, provider: 'groq', error: 'GROQ_NO_KEY' };
  }

  // 이전 대화 history → OpenAI messages 포맷 (assistant role 그대로 사용)
  const historyMsgs = Array.isArray(history)
    ? history
        .filter((h) => h?.content)
        .map((h) => ({
          role: h.role === 'assistant' ? 'assistant' : 'user',
          content: String(h.content).slice(0, 2000),
        }))
    : [];

  // 시스템 프롬프트 동적 생성 (DB 메타 주입)
  const messages = [
    { role: 'system', content: buildSystemPrompt(context) },
    ...historyMsgs,
    { role: 'user', content: question },
  ];

  // 중복 호출 차단
  const seenCalls = new Set();

  try {
    while (iterations < maxIterations) {
      const data = await postGroq(messages, { signal });
      const choice = data?.choices?.[0];
      const msg = choice?.message || {};
      const toolReqs = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

      if (toolReqs.length === 0) {
        // 최종 답변
        const answer = msg.content || '';
        return { answer, toolCalls, iterations, cached: false, provider: 'groq' };
      }

      // 새 호출만 실행 (중복 차단)
      const fresh = toolReqs.filter((tc) => {
        const fn = tc?.function?.name;
        const args = tc?.function?.arguments || '{}';
        const callKey = `${fn}|${args}`;
        if (seenCalls.has(callKey)) return false;
        seenCalls.add(callKey);
        return true;
      });

      if (fresh.length === 0) {
        return {
          answer: '최대 반복 횟수 초과 — 중간 결과를 확인하세요',
          toolCalls,
          iterations,
          cached: false,
          provider: 'groq',
        };
      }

      // 모델 메시지 + tool_calls 그대로 다음 turn에 보존
      messages.push({
        role: 'assistant',
        content: msg.content || '',
        tool_calls: fresh,
      });

      // 도구 병렬 실행
      const results = await Promise.all(fresh.map(async (tc) => {
        const name = tc?.function?.name;
        let args = {};
        try {
          args = JSON.parse(tc?.function?.arguments || '{}');
        } catch {
          args = {};
        }
        onProgress?.({ name, args });
        let result;
        try {
          result = await executeTool(name, args, context);
        } catch (e) {
          result = { error: e?.message || String(e) };
        }
        return { id: tc.id, name, args, result };
      }));

      // tool 응답 추가
      for (const r of results) {
        toolCalls.push({ name: r.name, args: r.args, result: r.result });
        messages.push({
          role: 'tool',
          tool_call_id: r.id,
          content: JSON.stringify(r.result),
        });
      }

      iterations++;
    }

    return {
      answer: '최대 반복 횟수 초과 — 중간 결과를 확인하세요',
      toolCalls,
      iterations,
      cached: false,
      provider: 'groq',
    };
  } catch (e) {
    return {
      answer: e?.message || 'Groq 호출 실패',
      toolCalls,
      iterations,
      cached: false,
      provider: 'groq',
      error: e?.message,
    };
  }
}

export function saveGroqKey(key) {
  try {
    if (key) localStorage.setItem('groqApiKey', key);
    else localStorage.removeItem('groqApiKey');
    return true;
  } catch {
    return false;
  }
}
