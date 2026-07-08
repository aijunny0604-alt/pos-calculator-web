// AI 분석 어시스턴트 채팅 상태 + Gemini 호출 + 히스토리 영속화
//
// localStorage 키:
//   - pos_ai_analytics_history_v1 : 메시지 히스토리 (FIFO 50건)
//   - pos_ai_quick_prompts_usage_v1 : 추천 질문 사용 빈도
//
// 메시지 구조:
//   { id, role: 'user'|'assistant'|'system'|'error', content, ts, toolCalls?, cached? }

import { useCallback, useEffect, useRef, useState } from 'react';
import { askAI, clearAnalystCache } from '../lib/aiAnalyst';

const HISTORY_KEY = 'pos_ai_analytics_history_v1';
const USAGE_KEY = 'pos_ai_quick_prompts_usage_v1';
const MAX_HISTORY = 50;

const GREETING_PATTERNS = [
  /^(안녕|안녕하세요|하이|hi|hello|헬로|ㅎㅇ|반가워|고마워|감사|땡큐|thanks|thank you)[\s!?.~]*$/i,
  /^(좋은\s*(아침|점심|저녁)|수고|수고해|수고했어|잘\s*지내)[\s!?.~]*$/i,
  /^(뭐해|누구야|너는\s*누구|도움말|도와줘)[\s!?.~]*$/i,
];

function isGreeting(text) {
  const normalized = String(text || '').trim();
  return GREETING_PATTERNS.some((pattern) => pattern.test(normalized));
}

// AI에 전달할 history에서 제외할 부정 답변 패턴
// (이게 컨텍스트에 들어가면 모델이 "기능 없다"는 인식을 강화함)
const NEGATIVE_HISTORY_PATTERNS = [
  /기능(은|이)?\s*없/,
  /할 수\s*없/,
  /지원하지\s*않/,
  /불가능/,
  /바로\s*알려드릴 수\s*있는 기능/,
];

// 옛 자동 메시지 패턴 (자율 분석/자동 인사이트) — loadHistory 시 자동 정리
const AUTO_MESSAGE_PATTERNS = [
  /MOVIS\s*자율\s*분석/,
  /오늘\s*매장에서\s*주목할\s*점/,
  /자동\s*검색\s*모드/,
];

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 옛 자동 메시지 (자율 분석/자동 인사이트 시스템 메시지 + 그 답변) 필터링
    const cleaned = parsed.filter((m) => {
      if (!m) return false;
      if (m.role === 'system' && AUTO_MESSAGE_PATTERNS.some((re) => re.test(m.content || ''))) return false;
      if (m.role === 'user' && /^오늘\s*매장에서\s*주목할\s*점/.test(m.content || '')) return false;
      return true;
    });
    // 정리된 결과 다시 저장
    if (cleaned.length !== parsed.length) {
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(cleaned)); } catch {}
    }
    return cleaned;
  } catch {
    return [];
  }
}

function saveHistory(messages) {
  try {
    const trimmed = messages.slice(-MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('AI 히스토리 저장 실패', e);
  }
}

function loadUsage() {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveUsage(usage) {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  } catch (e) {
    console.warn('AI 사용 빈도 저장 실패', e);
  }
}

const newId = () => `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default function useAIAnalystChat({
  orders = [],
  customers = [],
  products = [],
  savedCarts = [],
  aiLearningData = [],
  paymentRecords = [],
  paymentHistory = [],
  customerReturns = [],
  externalOrders = [],
  externalProducts = [],
} = {}) {
  const [messages, setMessages] = useState(() => loadHistory());
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  // Claude/GPT식 추론 트레이스 — 단계 누적([{id,label,status:'active'|'done'}]). 새 단계 추가 시 이전은 done.
  const [loadingSteps, setLoadingSteps] = useState([]);
  const pushStep = useCallback((label) => {
    setLoadingSteps((prev) => [
      ...prev.map((s) => (s.status === 'active' ? { ...s, status: 'done' } : s)),
      { id: `${Date.now()}_${prev.length}`, label, status: 'active' },
    ]);
  }, []);
  const [pendingActions, setPendingActions] = useState([]); // 쓰기 도구 confirm 대기
  const abortRef = useRef(null);

  // 메시지 변경 시 영속화
  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  // 컴포넌트 unmount 시 진행 중인 요청 취소
  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  // 사용 빈도 기록 (추천 질문 정렬용)
  const recordUsage = useCallback((key) => {
    if (!key) return;
    const usage = loadUsage();
    usage[key] = (usage[key] || 0) + 1;
    saveUsage(usage);
  }, []);

  const send = useCallback(async (text, { promptId } = {}) => {
    const question = (text || '').trim();
    if (!question || isLoading) return;

    // 사용자 메시지 즉시 추가
    const userMsg = { id: newId(), role: 'user', content: question, ts: Date.now() };
    // WHY: 직전 12메시지(약 6왕복)를 컨텍스트로 전달 → "이전 대화 기억" 가능
    // 부정 답변("기능 없습니다" 류)이 히스토리에 포함되면 AI가 부정 맥락을 강화해서 반복하므로 필터링.
    const history = messages
      .filter((m) => {
        if (m.role !== 'user' && m.role !== 'assistant') return false;
        if (m.role === 'assistant') {
          return !NEGATIVE_HISTORY_PATTERNS.some((re) => re.test(m.content || ''));
        }
        return true;
      })
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setLoadingStep('🤖 MOVIS가 생각 중...');
    setLoadingSteps([{ id: `${Date.now()}_0`, label: '질문을 이해하는 중', status: 'active' }]);

    if (promptId) recordUsage(promptId);

    // 진행 중인 호출 있으면 취소
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // ThinkingChip 최소 표시 시간 (캐시 hit 시에도 사용자가 칩을 볼 수 있게)
    const startedAt = Date.now();
    const MIN_THINKING_MS = 450;

    try {
      const result = await askAI(question, {
        orders,
        customers,
        products,
        savedCarts,
        aiLearningData,
        paymentRecords,
        paymentHistory,
        customerReturns,
        externalOrders,
        externalProducts,
      }, {
        signal: controller.signal,
        history, // ← 이전 대화 컨텍스트
        onProgress: (call) => {
          // 특수 신호: 폴백 시작
          if (call?.name === '__fallback__') {
            setLoadingStep('⚡ Gemini 한도 초과 → Groq로 폴백 중...');
            pushStep('⚡ Groq 엔진으로 전환');
            return;
          }
          const friendly = friendlyToolName(call?.name) || call?.name || '데이터 조회';
          setLoadingStep(`🔍 ${friendly}`);
          pushStep(`${friendly}`);
        },
      });

      pushStep('답변 정리 중');
      // 캐시 hit 등으로 너무 빠르면 ThinkingChip을 잠깐 더 보여줌
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_THINKING_MS) {
        await new Promise((r) => setTimeout(r, MIN_THINKING_MS - elapsed));
      }

      // 빈 응답 시 자동 폴백 — 질문 키워드로 직접 검색해서 후보 제시 (AI 도구 호출 실패 보완)
      const hasAnswer = !!(result.answer && result.answer.trim());
      let content = hasAnswer ? result.answer : '';
      let fallbackUsed = false;
      let fallbackToolCalls = null;
      if (!content) {
        if (isGreeting(question)) {
          content = '안녕하세요! MOVIS AI입니다. 매출, 재고, 거래처, 미수금, 주문 내역처럼 매장 데이터에 대해 편하게 물어보세요.';
        } else {
          const fallback = autoFallbackSearch(question, { products, customers, orders });
          if (fallback) {
            content = fallback;
            fallbackUsed = true;
            // 폴백 시 차트도 자동 생성 (toolCalls 모방 → ResultRenderer 자동 렌더)
            fallbackToolCalls = buildFallbackToolCalls(question, { products, customers, orders });
          } else {
            const errorMessage = typeof result.error === 'string'
              ? result.error
              : result.error?.message;
            content = errorMessage
              ? `⚠️ MOVIS가 답변을 만들지 못했어요.\n\n오류: ${errorMessage}\n\n잠시 후 다시 시도하거나 조금 더 구체적으로 질문해주세요.`
              : '⚠️ MOVIS가 답변을 만들지 못했어요. 조금 더 구체적으로 질문해주세요. '
                + '예: "스덴밴딩 종류 보여줘", "강남오토 매출 얼마야?", "재고 부족한 거 알려줘"';
          }
        }
      }
      // role 결정: AI 에러 있어도 폴백 성공이면 assistant로 표시 (사용자에게 유용한 결과)
      // 정말 못 만든 경우(폴백도 실패)만 'error'
      const role = (result.error && !fallbackUsed && !hasAnswer && !content)
        ? 'error'
        : (!content)
          ? 'error'
          : 'assistant';
      // 추천 후속 질문 자동 생성 (도구 호출 결과 + 질문 기반)
      const followUps = generateFollowUpQuestions(question, result.toolCalls || fallbackToolCalls);
      // ✉️ 메시지 초안(draftMessage) 추출 → 복사 가능한 인라인 카드로 렌더 (모달 아님)
      const messageDrafts = (result.toolCalls || [])
        .filter((tc) => tc?.result?.ok && tc?.result?.data?.__messageDraft)
        .map((tc) => ({
          recipientName: tc.result.data.recipientName,
          purpose: tc.result.data.purpose,
          message: tc.result.data.message,
        }));
      const assistantMsg = {
        id: newId(),
        role,
        content,
        ts: Date.now(),
        // 폴백 시 모방 toolCalls를 사용 → ResultRenderer가 자동 차트 렌더
        toolCalls: result.toolCalls?.length > 0 ? result.toolCalls : (fallbackToolCalls || []),
        cached: result.cached,
        iterations: result.iterations,
        provider: result.provider, // 'gemini' | 'groq' | 'gemini→groq'
        fallback: fallbackUsed,
        followUps,
        messageDrafts,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // 쓰기 도구 pending action 추출 → confirm 모달 표시
      const pending = (result.toolCalls || [])
        .filter((tc) => tc?.result?.ok && tc?.result?.data?.__pending)
        .map((tc) => ({
          id: newId(),
          messageId: assistantMsg.id,
          action: tc.result.data.action,
          params: tc.result.data.params,
          preview: tc.result.data.preview,
          warnings: tc.result.data.warnings || [],
        }));
      if (pending.length > 0) {
        setPendingActions((prev) => [...prev, ...pending]);
      } else if (result.needsClarification) {
        // 🤔 되물음(Clarification): 추측 실행 대신 확인 질문 — pending/합성 스킵, 질문만 표시
      } else {
        // 🔧 폴백: AI가 답변에 쓰기 미리보기를 텍스트로만 작성하고 functionCall 누락한 경우
        // 텍스트에서 거래처/제품/수량 파싱 → saveOrder pendingAction 합성 (Codex 권장)
        const synthesized = synthesizeOrderFromText(content, assistantMsg.id);
        if (synthesized) {
          setPendingActions((prev) => [...prev, synthesized]);
        } else {
          // 합성도 실패 시 사용자에게 안내
          const WRITE_PREVIEW_PATTERNS = [
            /🛒\s*주문\s*추가/, /📦\s*제품\s*등록/, /📦\s*재고\s*변경/, /💵\s*가격\s*변경/,
            /거래처\s*정보\s*수정/, /거래처\s*등록/,
          ];
          if (WRITE_PREVIEW_PATTERNS.some((re) => re.test(content))) {
            setTimeout(() => {
              setMessages((prev) => [...prev, {
                id: newId(),
                role: 'system',
                content: '⚠️ 실행 버튼이 안 떴어요. 더 명확히 다시 말씀해주세요. 예: "명성에 실리콘 엘보 90SEL60 2개 주문 추가해줘" — 거래처명+제품명+수량+동사를 한 문장에.',
                ts: Date.now(),
              }]);
            }, 100);
          }
        }
      }
    } catch (e) {
      if (e?.name !== 'AbortError') {
        const errorMsg = {
          id: newId(),
          role: 'error',
          content: e?.message || 'AI 호출에 실패했습니다.',
          ts: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } finally {
      setIsLoading(false);
      setLoadingStep('');
      setLoadingSteps([]);
      abortRef.current = null;
    }
  }, [orders, customers, products, savedCarts, aiLearningData, paymentRecords, paymentHistory, customerReturns, externalOrders, externalProducts, isLoading, recordUsage, pushStep]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setLoadingStep('');
    setLoadingSteps([]);
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
  }, []);

  const clearCache = useCallback(() => {
    clearAnalystCache();
  }, []);

  // 시스템 메시지 추가 (실행 결과 알림용)
  const addSystemMessage = useCallback((content) => {
    setMessages((prev) => [...prev, { id: newId(), role: 'system', content, ts: Date.now() }]);
  }, []);

  // pending action 제거 (사용자가 confirm 또는 cancel)
  const resolvePendingAction = useCallback((actionId) => {
    setPendingActions((prev) => prev.filter((p) => p.id !== actionId));
  }, []);
  // 대기 액션 전체 비우기 — 취소 시 한 번에 닫기(여러 건 잘못 인식돼 모달이 안 닫히던 문제 방지)
  const clearPendingActions = useCallback(() => setPendingActions([]), []);

  return {
    messages,
    isLoading,
    loadingStep,
    loadingSteps,
    pendingActions,
    resolvePendingAction,
    clearPendingActions,
    addSystemMessage,
    send,
    cancel,
    clear,
    clearCache,
    getUsage: loadUsage,
  };
}

// 빈 응답 자동 폴백 — 질문 키워드 추출 후 제품/거래처/주문 교차 검색해서 markdown 생성
// 거래처+제품 키워드 둘 다 있으면 orders 교차 검색까지 (예: "WP튠 포천 FL63 주문한적?")
function autoFallbackSearch(question, { products = [], customers = [], orders = [] }) {
  if (!question) return null;
  const NOISE = /^(있어|있니|있나|있음|좀|좀더|어때|어떄|뭐|뭐가|뭐있|뭐있어|뭔가|얼마|얼마야|몇개|몇\s*개|개|개수|종류|종류는|제품|제품들|상품|상품들|좀|보여|보여줘|알려|알려줘|확인|조회|어떤|어떤거|뭐가|있을까|있을까요|들|들은|이|가|을|를|은|는|의|에|와|과|로|으로|및|또는|혹은|아니면|또|만|밖에|최근|최근에|주문|주문한|주문한적|적|있어|있어요|적이|적이있)$/i;
  const kw = String(question)
    .replace(/[?.,!~]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim().replace(/ㅡ/g, '-'))
    .filter((t) => t.length >= 2 && !NOISE.test(t));
  if (kw.length === 0) return null;

  // 각 키워드로 제품/거래처 매칭
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
  const productMatchesByKw = {};
  const customerMatchesByKw = {};
  kw.forEach((k) => {
    const kn = norm(k);
    productMatchesByKw[k] = (products || []).filter((p) =>
      norm(p?.name).includes(kn) || norm(p?.category).includes(kn));
    customerMatchesByKw[k] = (customers || []).filter((c) =>
      norm(c?.name).includes(kn));
  });

  // 매칭된 키워드 분류
  const matchedProductKws = kw.filter((k) => productMatchesByKw[k].length > 0);
  const matchedCustomerKws = kw.filter((k) => customerMatchesByKw[k].length > 0);

  // ⭐ 거래처+제품 키워드 둘 다 매칭 → orders 교차 검색 ("WP튠 포천 FL63 주문한적?")
  if (matchedCustomerKws.length > 0 && matchedProductKws.length > 0) {
    const targetCustomers = new Set();
    matchedCustomerKws.forEach((k) => customerMatchesByKw[k].forEach((c) => targetCustomers.add(c.name)));
    const targetProductNames = new Set();
    matchedProductKws.forEach((k) => productMatchesByKw[k].forEach((p) => targetProductNames.add(p.name)));

    // 해당 거래처 + 해당 제품 포함 주문 찾기
    const cutoff90 = new Date(); cutoff90.setDate(cutoff90.getDate() - 90);
    const matchedOrders = (orders || []).filter((o) => {
      if (!targetCustomers.has(o?.customerName)) return false;
      const items = o?.items || [];
      return items.some((it) => targetProductNames.has(it?.name || it?.productName));
    });

    let md = `🔍 "${matchedCustomerKws.join(', ')}" 거래처의 "${matchedProductKws.join(', ')}" 제품 주문 이력\n\n`;
    if (matchedOrders.length === 0) {
      md += `해당 거래처가 검색된 제품을 주문한 이력을 찾지 못했어요.\n\n`;
      md += `**검색된 거래처**: ${[...targetCustomers].join(', ')}\n`;
      md += `**검색된 제품**: ${[...targetProductNames].slice(0, 10).join(', ')}${targetProductNames.size > 10 ? ` 외 ${targetProductNames.size - 10}건` : ''}\n`;
    } else {
      md += `**주문 ${matchedOrders.length}건 발견**\n`;
      matchedOrders
        .sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))
        .slice(0, 20)
        .forEach((o) => {
          const date = String(o.orderDate || '').slice(0, 10);
          const items = (o.items || [])
            .filter((it) => targetProductNames.has(it?.name || it?.productName))
            .map((it) => `${it.name || it.productName} ${it.quantity || 0}개`)
            .join(', ');
          md += `- ${date} · ${o.customerName} · ${items} · ${Number(o.total || 0).toLocaleString('ko-KR')}원\n`;
        });
      if (matchedOrders.length > 20) md += `- ... 외 ${matchedOrders.length - 20}건\n`;
    }
    md += '\n💡 더 구체적인 분석이 필요하면 알려주세요.';
    return md;
  }

  // 단일 키워드 검색 (제품/거래처)
  const primary = kw.sort((a, b) => b.length - a.length)[0];
  const productHits = productMatchesByKw[primary] || [];
  const customerHits = customerMatchesByKw[primary] || [];
  if (productHits.length === 0 && customerHits.length === 0) {
    // 모든 키워드로 한 번 더 검색
    const allProductHits = [...new Set(matchedProductKws.flatMap((k) => productMatchesByKw[k]))];
    const allCustomerHits = [...new Set(matchedCustomerKws.flatMap((k) => customerMatchesByKw[k]))];
    if (allProductHits.length === 0 && allCustomerHits.length === 0) return null;
    return formatList(primary, allProductHits, allCustomerHits, orders);
  }
  return formatList(primary, productHits, customerHits, orders);
}

// 검색 결과 마크다운 포맷 (제품 30 + 거래처 30 + 거래처별 최근 주문 1건)
function formatList(keyword, productHits, customerHits, orders) {
  let md = `🔍 "${keyword}" 검색 결과 (자동 폴백)\n\n`;
  if (productHits.length > 0) {
    md += `**제품 ${productHits.length}건**\n`;
    productHits.slice(0, 30).forEach((p) => {
      md += `- ${p.name} (${p.category || '미분류'}) · 재고 ${p.stock || 0}개 · 도매 ${Number(p.wholesale || 0).toLocaleString('ko-KR')}원\n`;
    });
    if (productHits.length > 30) md += `- ... 외 ${productHits.length - 30}건 (전체 보려면 "${keyword} 전체 보여줘"라고 질문)\n`;
    md += '\n';
  }
  if (customerHits.length > 0) {
    md += `**거래처 ${customerHits.length}건**\n`;
    customerHits.slice(0, 30).forEach((c) => {
      // 최근 주문 1건 요약
      const recent = (orders || [])
        .filter((o) => o.customerName === c.name || o.customerId === c.id)
        .sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))[0];
      const recentTxt = recent
        ? ` · 최근 주문 ${String(recent.orderDate || '').slice(0, 10)} (${Number(recent.total || 0).toLocaleString('ko-KR')}원)`
        : ' · 주문 이력 없음';
      md += `- ${c.name}${c.phone ? ` (${c.phone})` : ''}${recentTxt}\n`;
    });
    if (customerHits.length > 30) md += `- ... 외 ${customerHits.length - 30}건\n`;
  }
  md += '\n💡 더 구체적으로 알고 싶은 항목이 있으면 말씀해주세요.';
  return md;
}

// 폴백 결과에 차트 추가 — toolCalls 모방으로 ResultRenderer 자동 차트 렌더
// 제품 카테고리별 분포 / 거래처 매출 TOP / 주문 추이 자동 생성
export function buildFallbackToolCalls(question, { products = [], customers = [], orders = [] }) {
  if (!question) return [];
  const NOISE = /^(있어|있니|있나|있음|좀|좀더|어때|어떄|뭐|뭐가|뭐있|뭐있어|뭔가|얼마|얼마야|몇개|몇\s*개|개|개수|종류|종류는|제품|제품들|상품|상품들|보여|보여줘|알려|알려줘|확인|조회|어떤|어떤거|있을까|있을까요|들|들은|이|가|을|를|은|는|의|에|와|과|로|으로|및|또는|혹은|아니면|또|만|밖에|최근|주문|주문한|주문한적|적|있어요|적이|적이있)$/i;
  const kw = String(question)
    .replace(/[?.,!~]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim().replace(/ㅡ/g, '-'))
    .filter((t) => t.length >= 2 && !NOISE.test(t));
  if (kw.length === 0) return [];

  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
  const productMatchesByKw = {};
  const customerMatchesByKw = {};
  kw.forEach((k) => {
    const kn = norm(k);
    productMatchesByKw[k] = (products || []).filter((p) =>
      norm(p?.name).includes(kn) || norm(p?.category).includes(kn));
    customerMatchesByKw[k] = (customers || []).filter((c) =>
      norm(c?.name).includes(kn));
  });
  const matchedProductKws = kw.filter((k) => productMatchesByKw[k].length > 0);
  const matchedCustomerKws = kw.filter((k) => customerMatchesByKw[k].length > 0);
  const calls = [];

  // ⭐ Case 1: 거래처+제품 교차 → 거래처별 매출 막대
  if (matchedCustomerKws.length > 0 && matchedProductKws.length > 0) {
    const targetCustomers = new Set();
    matchedCustomerKws.forEach((k) => customerMatchesByKw[k].forEach((c) => targetCustomers.add(c.name)));
    const targetProductNames = new Set();
    matchedProductKws.forEach((k) => productMatchesByKw[k].forEach((p) => targetProductNames.add(p.name)));
    const matchedOrders = (orders || []).filter((o) => {
      if (!targetCustomers.has(o?.customerName)) return false;
      return (o?.items || []).some((it) => targetProductNames.has(it?.name || it?.productName));
    });
    if (matchedOrders.length > 0) {
      // 거래처별 매출 집계
      const byCustomer = {};
      matchedOrders.forEach((o) => {
        byCustomer[o.customerName] = (byCustomer[o.customerName] || 0) + Number(o.total || 0);
      });
      const results = Object.entries(byCustomer)
        .sort(([, a], [, b]) => b - a)
        .map(([name, revenue], i) => ({ rank: i + 1, name, revenue, count: matchedOrders.filter((o) => o.customerName === name).length }));
      calls.push({
        name: 'getTopCustomers',
        args: { period: '검색 범위', sortBy: 'revenue' },
        result: { ok: true, data: { results, sortBy: 'revenue', period: `${[...targetProductNames].slice(0, 2).join('/')} 주문` } },
      });
    }
    return calls;
  }

  // Case 2: 제품 키워드만 → 카테고리별 분포
  if (matchedProductKws.length > 0) {
    const allProducts = [...new Set(matchedProductKws.flatMap((k) => productMatchesByKw[k]))];
    if (allProducts.length >= 3) {
      const catCount = {};
      allProducts.forEach((p) => {
        const c = p.category || '미분류';
        catCount[c] = (catCount[c] || 0) + 1;
      });
      if (Object.keys(catCount).length >= 2) {
        const results = Object.entries(catCount)
          .sort(([, a], [, b]) => b - a)
          .map(([category, quantity], i) => ({ rank: i + 1, category, quantity, revenue: quantity }));
        calls.push({
          name: 'getTopProducts',
          args: { byCategory: true, sortBy: 'quantity' },
          result: { ok: true, data: { results, byCategory: true, sortBy: 'quantity', period: `"${kw.join(' ')}" 검색 ${allProducts.length}건` } },
        });
      }
    }
  }

  // Case 3: 거래처 키워드만 → 거래처별 매출 막대
  if (matchedCustomerKws.length > 0) {
    const allCustomers = [...new Set(matchedCustomerKws.flatMap((k) => customerMatchesByKw[k]))];
    if (allCustomers.length >= 2) {
      const byCustomer = {};
      const countByCustomer = {};
      allCustomers.forEach((c) => {
        const my = (orders || []).filter((o) => o.customerName === c.name || o.customerId === c.id);
        byCustomer[c.name] = my.reduce((s, o) => s + Number(o.total || 0), 0);
        countByCustomer[c.name] = my.length;
      });
      const results = Object.entries(byCustomer)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 15)
        .map(([name, revenue], i) => ({ rank: i + 1, name, revenue, count: countByCustomer[name] }));
      if (results.length > 0) {
        calls.push({
          name: 'getTopCustomers',
          args: { period: '전체', sortBy: 'revenue' },
          result: { ok: true, data: { results, sortBy: 'revenue', period: `"${kw.join(' ')}" 검색 ${allCustomers.length}곳` } },
        });
      }
    }
  }

  return calls;
}

// 🔧 텍스트 파싱 폴백 — AI가 functionCall 누락 시 답변 텍스트에서 주문 정보 추출
// "🛒 주문 추가 / 거래처: X / 항목: A 2개, B 3개 / 합계: ₩N" 같은 markdown 미리보기 파싱
function synthesizeOrderFromText(content, messageId) {
  if (!content) return null;
  if (!/주문\s*(추가|등록)|🛒|saveOrder/i.test(content)) return null;

  // 거래처명 추출
  const customerMatch = content.match(/거래처\s*[:：]\s*([^\n(\r]+)/);
  const customerName = customerMatch?.[1]?.trim().replace(/\*+$/, '').trim();

  // 가격 모드
  const priceTypeMatch = content.match(/(도매가?|소비자가?|소매가?)/);
  const priceType = priceTypeMatch?.[1]?.includes('소비자') || priceTypeMatch?.[1]?.includes('소매')
    ? 'retail' : 'wholesale';

  // 항목 파싱: "- 제품명 N개" 또는 "- 제품명 × N = ₩금액" 또는 "• 제품명 2개"
  const itemPatterns = [
    /[-•*]\s*(.+?)\s*[x×]\s*(\d+)/g,           // "- 제품 × 2"
    /[-•*]\s*(.+?)\s+(\d+)\s*개/g,             // "- 제품 2개"
  ];
  const itemsMap = new Map();
  for (const re of itemPatterns) {
    let m;
    while ((m = re.exec(content)) !== null) {
      const name = m[1].trim().replace(/[*`]+/g, '').replace(/\s+/g, ' ');
      const qty = Number(m[2]);
      if (name && qty > 0 && !itemsMap.has(name)) {
        itemsMap.set(name, qty);
      }
    }
  }
  const items = [...itemsMap.entries()].map(([name, quantity]) => ({ name, quantity }));

  if (!customerName || items.length === 0) return null;

  // 합계 추출 (선택)
  const totalMatch = content.match(/합계\s*[:：]?\s*[₩\\₩]?\s*([\d,]+)/);
  const total = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : 0;

  return {
    id: newId(),
    messageId,
    action: 'saveOrder',
    params: {
      customerName,
      priceType,
      items: items.map((i) => ({ productName: i.name, quantity: i.quantity })),
    },
    preview: `🛒 주문 등록 (AI 텍스트 폴백)\n• 거래처: ${customerName}\n• 가격: ${priceType === 'retail' ? '소비자' : '도매'}\n• 항목 ${items.length}개:\n${items.map((i) => `  - ${i.name} × ${i.quantity}`).join('\n')}${total > 0 ? `\n• 합계: ${total.toLocaleString('ko-KR')}원 (VAT 포함)` : ''}`,
    warnings: ['⚠️ functionCall 누락으로 AI 답변 텍스트에서 복원함. 정보가 맞는지 확인 후 실행해주세요.'],
  };
}

// 추천 후속 질문 자동 생성 — 도구 결과 데이터 기반 동적 + 컨텍스트 + 사용 빈도
// 답변 하단에 칩으로 표시 (category: action/analysis/compare/sim)
// 반환: [{ text, category, icon? }] 또는 [string] (호환)

// 답변 데이터에서 첫 번째 결과 이름 추출 (거래처/제품)
function extractFirstName(toolCalls = []) {
  for (const tc of toolCalls) {
    const data = tc?.result?.data;
    if (!data) continue;
    if (Array.isArray(data.results) && data.results[0]?.name) return data.results[0].name;
    if (Array.isArray(data.items) && data.items[0]?.name) return data.items[0].name;
    if (data.name) return data.name;
    if (data.customerName) return data.customerName;
    if (data.productName) return data.productName;
  }
  return null;
}

// 답변 데이터에서 상위 N개 이름 추출
function extractTopNames(toolCalls = [], n = 3) {
  for (const tc of toolCalls) {
    const data = tc?.result?.data;
    if (!data) continue;
    const arr = data.results || data.items;
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.slice(0, n).map((r) => r?.name).filter(Boolean);
    }
  }
  return [];
}

// 사용 빈도 기반 우선 정렬 (자주 쓴 질문 패턴 우선)
function sortByUsage(suggestions) {
  try {
    const usage = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
    return [...suggestions].sort((a, b) => {
      const at = typeof a === 'string' ? a : a.text;
      const bt = typeof b === 'string' ? b : b.text;
      return (usage[bt] || 0) - (usage[at] || 0);
    });
  } catch { return suggestions; }
}

function generateFollowUpQuestions(question, toolCalls = []) {
  const calls = Array.isArray(toolCalls) ? toolCalls : [];
  const callNames = calls.map((c) => c?.name).filter(Boolean);
  const q = String(question || '');
  const firstName = extractFirstName(calls); // "강남오토" 또는 "스덴 밴딩 파이프 54-30"
  const topNames = extractTopNames(calls, 3);

  // 시간대 기반 (오전/오후/저녁)
  const hour = new Date().getHours();
  const timeContext = hour < 11 ? 'morning' : hour < 17 ? 'day' : 'evening';

  // 카테고리 분류: action(액션) / analysis(분석) / compare(비교) / sim(시뮬레이션)
  const A = (text) => ({ text, category: 'action' });   // 즉시 행동
  const N = (text) => ({ text, category: 'analysis' }); // deep dive 분석
  const C = (text) => ({ text, category: 'compare' });  // 비교
  const S = (text) => ({ text, category: 'sim' });      // What-if

  let suggestions = [];

  // ✅ 1. 도구 결과 데이터 기반 동적 추천 (실제 이름 활용)
  if (callNames.includes('getTopCustomers') && firstName) {
    suggestions.push(N(`${firstName} 최근 3개월 추이`));
    suggestions.push(N(`${firstName} 자주 사는 제품 TOP 5`));
    suggestions.push(A(`${firstName} 다음 판매 제안`));
    suggestions.push(N(`TOP ${topNames.length}곳 매출 비교`));
  } else if (callNames.includes('getTopProducts') && firstName) {
    suggestions.push(N(`${firstName} 판매 추이`));
    suggestions.push(A(`${firstName} 재주문 추천 수량`));
    suggestions.push(S(`${firstName} 가격 10% 올리면?`));
    suggestions.push(A(`${firstName} 묶음 판매 추천`));
  } else if (callNames.includes('getCustomerInfo') && firstName) {
    suggestions.push(N(`${firstName} 3개월 매출 추이`));
    suggestions.push(A(`${firstName} 권할 제품 (Next Best Offer)`));
    suggestions.push(N(`${firstName} 자주 같이 사는 제품 묶음`));
    suggestions.push(C(`${firstName} vs 동급 거래처 매출 비교`));
  } else if (callNames.includes('getProductInfo') && firstName) {
    suggestions.push(N(`${firstName} 판매 추이 6개월`));
    suggestions.push(A(`${firstName} 재주문 50개 시뮬`));
    suggestions.push(S(`${firstName} 가격 인상 시뮬`));
    suggestions.push(N(`${firstName} 같이 팔린 부품`));
  } else if (callNames.includes('searchProducts')) {
    suggestions.push(A('이 중 재고 부족한 것만'));
    suggestions.push(N('카테고리별 매출 TOP'));
    suggestions.push(A('재주문 추천 리스트'));
    suggestions.push(S('1위 제품 가격 시뮬'));
  } else if (callNames.includes('searchCustomers')) {
    suggestions.push(N('이 중 휴면 위험 거래처'));
    suggestions.push(A('이 중 미수 있는 거래처'));
    suggestions.push(N('LTV 추정 TOP 5'));
  } else if (callNames.includes('getCustomerSegments')) {
    suggestions.push(A('VIP 자주 사는 제품 분석'));
    suggestions.push(A('휴면 거래처 컴백 전략'));
    suggestions.push(N('신규 거래처 정착률'));
  } else if (callNames.includes('getLowStockProducts') || callNames.includes('getStockSummary') || callNames.includes('getStockCoverageForecast')) {
    suggestions.push(A('재주문 추천 리스트'));
    if (firstName) suggestions.push(S(`${firstName} 100개 발주 시뮬`));
    suggestions.push(N('품절 인기 제품 우선순위'));
    suggestions.push(N('카테고리별 재고 가치'));
  } else if (callNames.includes('getOverdueCustomers') || callNames.includes('getPaymentSummary')) {
    suggestions.push(A('💸 미수 회수 액션 플래너'));
    suggestions.push(N('60일 이상 지연만 보기'));
    if (firstName) suggestions.push(N(`${firstName} 매출 추이`));
    suggestions.push(N('최근 입금 이력'));
  } else if (callNames.includes('getCollectionPlan')) {
    if (firstName) suggestions.push(N(`${firstName} 최근 거래 보기`));
    suggestions.push(A('회수 문구 다른 톤으로'));
    suggestions.push(N('60일 이상 미수만'));
    suggestions.push(N('미수 거래처 LTV 분석'));
  } else if (callNames.includes('getNextBestOffers') && firstName) {
    suggestions.push(N('이 거래처 같이 사는 제품 묶음'));
    suggestions.push(N('비슷한 구매 패턴 거래처'));
    suggestions.push(A(`${firstName} 주문 등록`));
  } else if (callNames.includes('getProductBundleSuggestions') && firstName) {
    suggestions.push(A('상위 묶음 제품 재고 확인'));
    suggestions.push(N(`${firstName} 구매 거래처 TOP`));
    suggestions.push(N('카테고리별 묶음 패턴'));
  } else if (callNames.includes('getMarginLeakage')) {
    if (firstName) suggestions.push(S(`${firstName} 가격 15% 인상 시뮬`));
    suggestions.push(C('카테고리별 마진 비교'));
    suggestions.push(N('도매가 이하 판매한 거래처'));
  } else if (callNames.includes('simulatePriceChange')) {
    suggestions.push(S('변동률 -5% / +20%도 시뮬'));
    if (firstName) suggestions.push(S(`${firstName} 발주 100개 시뮬`));
    suggestions.push(N('비슷한 마진 다른 제품'));
  } else if (callNames.includes('simulateRestock')) {
    if (firstName) suggestions.push(S(`${firstName} 가격 시뮬`));
    suggestions.push(N('같은 카테고리 재고 커버리지'));
    suggestions.push(A('재주문 추천 전체 리스트'));
  } else if (callNames.includes('getRevenueVolatility')) {
    suggestions.push(N('이상치 날짜 거래처 분석'));
    suggestions.push(C('이번 달 vs 지난달 매출'));
    suggestions.push(N('요일별 매출 패턴 상세'));
  } else if (callNames.includes('getCustomerLifetimeValue')) {
    if (firstName) suggestions.push(N(`${firstName} 다음 판매 제안`));
    suggestions.push(N('휴면 위험 거래처만 LTV'));
    suggestions.push(A('VIP 컴백 전략'));
  } else if (callNames.includes('getReturnAnalysis')) {
    suggestions.push(N('반품 자주 나는 제품 TOP'));
    suggestions.push(N('반품 많은 거래처'));
    suggestions.push(N('카테고리별 반품률'));
  } else if (callNames.includes('getCompositeSummary')) {
    suggestions.push(A('💸 미수 회수 액션 플래너'));
    suggestions.push(N('재고 부족한 인기 제품'));
    suggestions.push(N('이번 달 매출 TOP 5'));
  }

  // ✅ 2. 패턴 기반 fallback (도구 결과 없거나 매칭 안 되면)
  if (suggestions.length === 0) {
    if (/매출|판매|수익/.test(q)) {
      suggestions = [N('거래처 TOP 5'), N('인기 제품 TOP 10'), C('카테고리별 매출 비교'), N('매출 변동성 분석')];
    } else if (/재고|입고|품절/.test(q)) {
      suggestions = [A('재주문 추천 리스트'), N('재고 부족 제품'), S('주요 제품 발주 시뮬'), N('품절 예상일 예측')];
    } else if (/거래처|고객/.test(q)) {
      suggestions = [A('💎 LTV TOP 분석'), N('VIP 거래처'), N('휴면 거래처'), A('미수 회수 플래너')];
    } else if (/가격|마진/.test(q)) {
      suggestions = [N('마진 누수 점검'), S('TOP 제품 가격 시뮬'), C('카테고리별 마진 비교')];
    } else {
      // 시간대 기반 기본 추천
      if (timeContext === 'morning') {
        suggestions = [N('📊 오늘 주목할 점 3가지'), N('어제 매출 정리'), A('재고 부족 알려줘')];
      } else if (timeContext === 'evening') {
        suggestions = [N('오늘 매출 마감'), N('내일 발주할 거'), A('미수 거래처 정리')];
      } else {
        suggestions = [N('이번 달 매출 TOP 5'), A('재고 부족 알려줘'), A('미수 거래처')];
      }
    }
  }

  // ✅ 3. 데이터 상태 기반 우선 칩 (Codex CONTEXT-AWARE)
  // 매장 상황별 긴급 추천 — 미수 많을 때 / 재고 부족 많을 때 / 매출 급감 시
  try {
    const contextData = readContextSnapshot();
    if (contextData) {
      const urgentChips = [];
      if (contextData.overdueCount >= 5) {
        urgentChips.push(A('💸 미수 회수 액션 플래너'));
      }
      if (contextData.lowStockCount >= 10) {
        urgentChips.push(A('🚚 재주문 추천 리스트'));
      }
      if (contextData.popularOutOfStock >= 3) {
        urgentChips.push(A('📦 품절 인기 제품 우선'));
      }
      // 긴급 칩이 있고 이미 suggestions에 없으면 최상위로
      urgentChips.forEach((urgent) => {
        const exists = suggestions.some((s) => (typeof s === 'string' ? s : s.text) === urgent.text);
        if (!exists) suggestions.unshift(urgent);
      });
    }
  } catch {}

  // ✅ 4. 사용 빈도 정렬
  suggestions = sortByUsage(suggestions);

  // ✅ 5. 동적 개수 (단일 조회 3개 / 복합 분석 4~5개)
  const maxCount = callNames.length >= 2 ? 5 : 3;
  return suggestions.slice(0, maxCount);
}

// 매장 상태 스냅샷 (localStorage 캐시 — 매번 계산 안 하도록)
const CONTEXT_SNAPSHOT_KEY = 'pos_ai_context_snapshot_v1';
function readContextSnapshot() {
  try {
    const raw = localStorage.getItem(CONTEXT_SNAPSHOT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // 5분 이내 데이터만 신뢰
    if (Date.now() - (data.ts || 0) > 5 * 60 * 1000) return null;
    return data;
  } catch { return null; }
}
export function writeContextSnapshot({ products = [], paymentRecords = [], orders = [] }) {
  try {
    const overdueCount = paymentRecords.filter((r) => Number(r?.balance || 0) > 0).length;
    const lowStockCount = products.filter((p) => {
      const s = Number(p?.stock || 0);
      return s > 0 && s <= 5;
    }).length;
    // 품절 인기 제품 (재고 0 + 최근 30일 판매)
    const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const popularOutOfStock = products.filter((p) => {
      if (Number(p?.stock || 0) > 0) return false;
      return orders.some((o) => {
        if (!o?.orderDate || new Date(o.orderDate).getTime() < cutoff30) return false;
        return (o.items || []).some((it) => (it?.name || it?.productName) === p?.name);
      });
    }).length;
    localStorage.setItem(CONTEXT_SNAPSHOT_KEY, JSON.stringify({
      overdueCount, lowStockCount, popularOutOfStock, ts: Date.now(),
    }));
  } catch {}
}

// 도구 이름 → 사용자 친화 한국어 라벨
function friendlyToolName(name) {
  const map = {
    // 분석 (read)
    getTopCustomers: '매출 TOP 거래처 조회',
    getCustomerTrend: '거래처 추이 분석',
    getCustomerSegments: 'VIP 세그먼트 분석',
    getDormantCustomers: '휴면 거래처 탐색',
    getTopProducts: '인기 제품 집계',
    getProductTrend: '제품 추이 분석',
    getRepeatPurchaseGap: '재주문 주기 계산',
    getCustomerProductAffinity: '거래처 구매 패턴 분석',
    getCompositeSummary: '종합 KPI 산출',
    getInventoryStatus: '재고 현황 분석',
    getProductInfo: '제품 정보 조회',
    getCustomerInfo: '거래처 정보 조회',
    searchProducts: '제품 키워드 검색',
    searchCustomers: '거래처 키워드 검색',
    getStockSummary: '재고 요약 집계',
    getProductsByStockStatus: '재고 상태별 조회',
    getRestockRecommendations: '재주문 추천 분석',
    getLowStockProducts: '재고 부족 제품 조회',
    getOverdueCustomers: '미수 거래처 조회',
    getPaymentInflow: '입금 이력 분석',
    getReturnAnalysis: '반품 통계',
    getPendingCarts: '저장 장바구니 조회',
    getLearningStats: 'AI 학습 통계',
    getSmartstoreOrders: '스마트스토어 주문 조회',
    getPaymentSummary: '미수금 집계',
    getReturnedItems: '반품 내역 조회',
    getSavedCartsByCustomer: '저장 장바구니 조회',
    getAILearningStats: 'AI 학습 통계',
    // 쓰기 (write) — Confirm 모달 전 미리보기 준비
    addProduct: '제품 등록 준비',
    addCustomer: '거래처 등록 준비',
    updateProductStock: '재고 변경 준비',
    updateProductPrice: '가격 변경 준비',
    updateCustomer: '거래처 정보 수정 준비',
    saveOrder: '주문 등록 준비',
    bulkAddProduct: '제품 일괄 등록 준비',
    bulkAddCustomer: '거래처 일괄 등록 준비',
    bulkUpdateProductStock: '재고 일괄 변경 준비',
    bulkUpdateProductPrice: '가격 일괄 변경 준비',
    bulkUpdateCustomer: '거래처 정보 일괄 변경 준비',
    // Codex 제안 5종
    getCollectionPlan: '미수 회수 액션 플래너',
    getStockCoverageForecast: '품절 예상일 분석',
    getNextBestOffers: '거래처 추천 제품 산출',
    getProductBundleSuggestions: '묶음 판매 패턴 분석',
    getMarginLeakage: '마진 누수 점검',
    // 시뮬레이션 4종
    simulatePriceChange: '가격 변동 시뮬레이션',
    simulateRestock: '발주 시뮬레이션',
    getRevenueVolatility: '매출 변동성 분석',
    getCustomerLifetimeValue: '거래처 LTV 추정',
  };
  return map[name] || null;
}
