import { GEMINI_TOOLS, executeTool, buildSystemPrompt } from './geminiTools';
import { getTodayKST } from './utils';
import { recordApiCall, setContextTokens } from './apiUsageTracker';

const CACHE_KEY = 'pos_ai_cache_v2'; // v1 → v2 (시스템 프롬프트 변경 시 옛 캐시 자동 무효화)
const CACHE_TTL = 300000;
const MAX_CACHE_ENTRIES = 100;
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

// 사용자에게 부정적인 답변(기능 부재/거절)은 캐시하지 않음 — 시스템 프롬프트 개선 후 새 답변 받게.
const NEGATIVE_PATTERNS = [
  /기능(은|이)?\s*없/,
  /할 수\s*없/,
  /지원하지\s*않/,
  /불가능/,
  /죄송합니다.*없어요/,
  /바로\s*알려드릴 수\s*있는 기능/,
];
const isNegativeAnswer = (answer) => {
  if (!answer || typeof answer !== 'string') return false;
  return NEGATIVE_PATTERNS.some((re) => re.test(answer));
};

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

// 쓰기 의도 감지 키워드 → 매칭 시 Gemini에 functionCall 강제 + 허용 도구 제한
const WRITE_INTENT_PATTERNS = [
  // 주문 등록 — "팔았어/나갔어/판매" 등 매장 실사용 동사 포함(거래처+제품 동반 시)
  // ⚠️ bare "배송"이 "배송지/배송주소/배송메모/배송비"까지 잡아 주문으로 오인식(배송지 변경→제품주문) → 부정 lookahead로 제외
  { re: /주문\s*(추가|넣|등록|해줘|좀)|배송(?!지|\s*주소|메모|\s*비|료)|배달(?!\s*비|료)|주문\s*해|([가-힣]+(에|한테|으로))[\s\S]{0,40}(팔|판매|나갔)/, tools: ['saveOrder'] },
  { re: /제품\s*(등록|추가|새로|신규)/, tools: ['addProduct', 'bulkAddProduct'] },
  { re: /거래처\s*(등록|추가|신규)/, tools: ['addCustomer', 'bulkAddCustomer'] },
  // 거래처 정보 수정 — 전화/연락처/번호·주소/배송지/납품처 동의어 대폭 포함 (거래처명 직접 호칭도 매칭)
  { re: /(거래처|업체|고객|손님|매장)[\s\S]{0,12}(수정|변경|바꿔|업데이트)|(전화|연락처|번호|핸드폰|폰\s*번호|주소|배송지|배송\s*주소|납품처|납품\s*주소|보내는\s*곳|위치|주소지)[\s\S]{0,30}(바꿔|변경|수정|업데이트|등록|기입|로\s*해|으로\s*해|로\s*변경|으로\s*변경)/, tools: ['updateCustomer', 'bulkUpdateCustomer'] },
  // 재고 변경 — "수량/개수/재고량"·"정정/맞춰"·"재고없음/품절/소진" 동의어 포함
  { re: /(재고|수량|개수|재고량)[\s\S]{0,12}(변경|수정|바꿔|입고|출고|들어왔|나갔|업데이트|로\s*해|으로\s*해|정정|채워|맞춰|로\s*맞|개로|개\s*남)|재고\s*없음|품절(로|\s*처리)?\s*(변경|수정|해|로)|소진/, tools: ['updateProductStock', 'bulkUpdateProductStock'] },
  // 원본/원래 금액으로 복원 — "되돌려/복원/원복/롤백" (가격 수정보다 먼저 매칭)
  { re: /(원래|원본|초기|처음|예전)[\s\S]{0,12}(가격|금액|단가|값)?[\s\S]{0,12}(되돌려|돌려|복원|원복|롤백)|(가격|금액|단가|값)[\s\S]{0,12}(원래|원본|초기|처음)\s*(대로|로)|되돌려\s*줘|복원해|원복해|롤백/, tools: ['revertProductPrice'] },
  // 단가 변경 이력/내역 조회 (읽기) — "얼마였어/예전 가격/변경 내역"
  { re: /(단가|가격|금액)\s*(이력|내역|변경\s*내역|히스토리|기록)|(원래|예전|처음|초기)\s*(가격|금액|단가)\s*(얼마|뭐|어떻게)|얼마였/, tools: ['getPriceHistory'] },
  // 가격뿐 아니라 금액·단가·도매가·소비자가 등도 포함 + 어순/비인접("도매가 5만원으로 수정") 대응
  { re: /(가격|금액|단가|도매가|소매가|소비자가|판매가)[\s\S]{0,25}(변경|수정|바꿔|올려|내려|업데이트|인상|인하|로\s*해)|(변경|수정|바꿔|올려|내려|인상|인하)[\s\S]{0,25}(가격|금액|단가|도매가|소매가|소비자가|판매가)/, tools: ['updateProductPrice', 'bulkUpdateProductPrice'] },
  // 제품명/이름 수정·이어붙이기 — "제품명 X로 바꿔", "이름 뒤에 (무정전 타입) 붙여줘/추가"
  { re: /(제품명|상품명|이름|품명)[\s\S]{0,20}(바꿔|변경|수정|붙여|덧붙|추가|뒤에|앞에|로\s*해|으로\s*해)|(붙여|덧붙|추가)[\s\S]{0,12}(줘|주세요|해)/, tools: ['updateProductName'] },
  // 블랙리스트 지정/해제 — "세븐카 블랙리스트 지정", "A랑 B 둘 다 블랙 지정" (다건은 bulk)
  { re: /(블랙리스트|블랙)[\s\S]{0,12}(지정|등록|추가|해제|풀어|빼|넣어|해줘)/, tools: ['updateCustomer', 'bulkUpdateCustomer'] },
  // 상호(거래처명) 변경 — "동래YB 상호 YB모터스로 변경" (과거 이력 자동 이전, 다건은 bulk)
  { re: /(상호|업체명|거래처명|거래처\s*이름)[\s\S]{0,25}(변경|바꿔|수정|로\s*해|으로\s*해)/, tools: ['updateCustomer', 'bulkUpdateCustomer'] },
  // 주문 메모 — "김철수 주문에 메모 남겨줘/적어줘"
  { re: /주문[\s\S]{0,15}(메모|노트)[\s\S]{0,15}(남겨|적어|추가|써|기록|달아)|(메모|노트)[\s\S]{0,10}(남겨|적어|달아)[\s\S]{0,6}(줘|주세요)/, tools: ['updateOrderMemo'] },
];
function detectWriteIntent(question) {
  if (!question) return null;
  for (const { re, tools } of WRITE_INTENT_PATTERNS) {
    if (re.test(question)) return tools;
  }
  return null;
}

// 리뷰 답글 모드 감지 — 이 경우 쓰기 도구를 강제하지 않는다.
// ⚠️ 리뷰 본문에 "배송/주문" 등이 흔히 들어가 detectWriteIntent(saveOrder 등)를 잘못 트리거하면
//    MOVIS가 답글 대신 주문 생성을 시도함. 리뷰 키워드/네이버 리뷰 복사 형식/직전 모델의 리뷰 요청으로 판정.
const REVIEW_KW_RE = /리뷰|구매평|후기|답글|평점|별점/;
const REVIEW_PASTE_RE = /상품주문번호\s*[:：]/; // 네이버 리뷰·주문 복사 양식
function isReviewReplyContext(question, contents = []) {
  if (REVIEW_KW_RE.test(question || '') || REVIEW_PASTE_RE.test(question || '')) return true;
  // 직전 모델 턴이 "리뷰 붙여넣어 달라"고 했으면 = 리뷰 답글 흐름 진행 중 (이번이 붙여넣은 리뷰)
  for (let i = contents.length - 1; i >= 0 && i >= contents.length - 3; i--) {
    const c = contents[i];
    if (c?.role === 'model') {
      const txt = (c.parts || []).map((p) => p.text || '').join(' ');
      return /리뷰|구매평|답글|붙여넣/.test(txt);
    }
  }
  return false;
}

const postGemini = async (contents, { signal, systemPrompt, forcedTools } = {}) => {
  const keys = getGeminiKeys();
  let lastStatus = null;
  let lastMessage = '';

  for (const model of MODELS) {
    for (const key of keys) {
      for (let retry = 0; retry < 3; retry++) {
        const startedAt = Date.now();
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents,
              tools: [{ function_declarations: GEMINI_TOOLS }],
              // 쓰기 의도 감지 시 mode='ANY' + 허용 도구 제한 → functionCall 강제
              // (Gemini가 텍스트로 답하는 경로 차단, 모달 누락 방지)
              toolConfig: forcedTools && forcedTools.length > 0
                ? { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: forcedTools } }
                : { functionCallingConfig: { mode: 'AUTO' } },
              generationConfig: { temperature: 0.15, maxOutputTokens: 4096 },
            }),
          }
        );

        const durationMs = Date.now() - startedAt;

        if (response.ok) {
          const json = await response.json();
          // 사용량 트래커 기록 (Gemini usageMetadata)
          const usage = json.usageMetadata || {};
          recordApiCall({
            model,
            promptTokens: usage.promptTokenCount || 0,
            candidatesTokens: usage.candidatesTokenCount || 0,
            totalTokens: usage.totalTokenCount || 0,
            ok: true,
            status: response.status,
            durationMs,
            source: 'movis',
          });
          // 컨텍스트 길이 = 입력 토큰만 (출력 제외). 다음 호출의 prompt 크기 추정
          if (usage.promptTokenCount) setContextTokens(usage.promptTokenCount);
          return json;
        }

        lastStatus = response.status;
        try {
          const errorBody = await response.json();
          lastMessage = errorBody.error?.message?.split('.')[0] || '';
        } catch {
          lastMessage = '';
        }

        // 실패도 기록 (호출 횟수 카운트 — 429 한도 추적용)
        recordApiCall({
          model,
          promptTokens: 0,
          candidatesTokens: 0,
          totalTokens: 0,
          ok: false,
          status: response.status,
          durationMs,
          source: 'movis',
        });

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

// 모닝 브리핑 한 줄 요약 — 도구 없이 순수 텍스트만 생성 (가볍게)
// 실패하면 throw → 호출부에서 숫자 카드만 폴백 표시
export async function summarizeMorningBriefing(factsText, { signal } = {}) {
  if (!factsText || !factsText.trim()) return '';
  const keys = getGeminiKeys();
  const systemPrompt = [
    '너는 자동차 부품 매장 사장님의 비서다. 아래 "오늘의 사실 데이터"만 근거로,',
    '사장님이 아침에 읽을 브리핑을 자연스러운 한국어 2~3문장으로 요약한다.',
    '규칙: ① 가장 급한 일(발송마감 초과/당일, 배송지연)을 먼저 언급한다.',
    '② 데이터에 없는 숫자/거래처/제품명을 새로 지어내지 않는다.',
    '③ 정중하고 간결하게. 인사 한마디로 시작해도 좋다. ④ 마크다운/불릿 쓰지 말고 평문으로.',
  ].join(' ');
  for (const model of MODELS) {
    for (const key of keys) {
      for (let retry = 0; retry < 2; retry++) {
        let response;
        const startedAt = Date.now();
        try {
          response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal,
              body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text: `오늘의 사실 데이터:\n${factsText}` }] }],
                generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
              }),
            }
          );
        } catch (e) {
          if (e?.name === 'AbortError') throw e;
          break; // 네트워크 오류 → 다음 키
        }
        const durationMs = Date.now() - startedAt;
        if (response.ok) {
          const json = await response.json();
          const usage = json.usageMetadata || {};
          recordApiCall({ model, promptTokens: usage.promptTokenCount || 0, candidatesTokens: usage.candidatesTokenCount || 0, totalTokens: usage.totalTokenCount || 0, ok: true, status: 200, durationMs, source: 'movis' });
          const text = json.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join(' ') || '';
          return text.trim();
        }
        recordApiCall({ model, promptTokens: 0, candidatesTokens: 0, totalTokens: 0, ok: false, status: response.status, durationMs, source: 'movis' });
        if (response.status === 503 && retry < 1) { await sleep(1500); continue; }
        break;
      }
    }
  }
  throw new Error('briefing summary failed');
}

export async function askAnalyst(question, context, options = {}) {
  const {
    signal,
    onProgress,
    maxIterations = 5,
    skipCache,
    history = [], // 이전 대화 [{role:'user'|'assistant', content}]
  } = options;

  const toolCalls = [];
  let iterations = 0;
  const hasHistory = Array.isArray(history) && history.length > 0;

  try {
    // 컨텍스트 있는 질문은 캐시 건너뜀 (같은 질문도 컨텍스트마다 답 다름)
    if (!skipCache && !hasHistory) {
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

    // 이전 대화 history를 Gemini contents 포맷으로 변환 후 현재 질문 추가
    const contents = [];
    for (const h of history) {
      if (!h?.content) continue;
      contents.push({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(h.content).slice(0, 2000) }], // 안전한 길이 제한
      });
    }
    contents.push({ role: 'user', parts: [{ text: question }] });
    // WHY: 같은 함수와 같은 인자를 반복 호출하면 모델 루프가 길어지고 비용이 늘어 중복 실행을 막는다.
    const seenCalls = new Set();
    // 시스템 프롬프트 동적 생성 (DB 메타 컨텍스트 주입 — 카테고리/거래처/최근 활동)
    const systemPrompt = buildSystemPrompt(context);
    // 쓰기 의도 감지 → 첫 iteration에서만 functionCall 강제 (이후 후속 분석은 AUTO)
    // 단, 리뷰 답글 모드면 강제 OFF (리뷰 본문의 "배송/주문" 오탐으로 saveOrder 강제되는 것 방지)
    const writeIntent = isReviewReplyContext(question, contents) ? null : detectWriteIntent(question);

    while (iterations < maxIterations) {
      // iteration 0 + 쓰기 의도일 때만 mode=ANY로 강제
      const forcedTools = (iterations === 0 && writeIntent) ? writeIntent : null;
      const data = await postGemini(contents, { signal, systemPrompt, forcedTools });
      const parts = data.candidates?.[0]?.content?.parts || [];
      const functionCalls = parts
        .filter(part => part.functionCall)
        .map(part => part.functionCall);

      if (functionCalls.length === 0) {
        const answer = parts[0]?.text || '';
        // 컨텍스트 있는 질문 또는 부정적 답변은 캐시하지 않음
        // (대화 상태별 답이 다름 + "기능 없음" 같은 답은 프롬프트 개선으로 곧 바뀜)
        if (!hasHistory && !isNegativeAnswer(answer)) {
          saveCachedAnswer(question, answer, toolCalls);
        }
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

      // 🤔 Clarification: 도구 dry-run이 되물음을 요청하면 추가 모델 호출 없이 질문을 바로 답변으로 반환
      // (모호한 쓰기를 추측 실행하는 대신 사용자에게 1회 확인 — 토큰 절약 + 오작동 방지)
      const clarify = results.find(({ result }) => result?.ok && result?.data?.__clarification);
      if (clarify) {
        return {
          answer: clarify.result.data.question,
          toolCalls,
          iterations: iterations + 1,
          cached: false,
          needsClarification: true,
        };
      }

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
  // 옛 버전 캐시도 같이 정리
  try {
    localStorage.removeItem('pos_ai_cache_v1');
  } catch {}
}

// 모듈 로드 시 옛 v1 캐시 자동 삭제 (시스템 프롬프트가 바뀌었으므로 옛 답변 무효)
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('pos_ai_cache_v1')) {
    localStorage.removeItem('pos_ai_cache_v1');
  }
} catch {}

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
