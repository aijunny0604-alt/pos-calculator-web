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
} = {}) {
  const [messages, setMessages] = useState(() => loadHistory());
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
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
      }, {
        signal: controller.signal,
        history, // ← 이전 대화 컨텍스트
        onProgress: (call) => {
          // 특수 신호: 폴백 시작
          if (call?.name === '__fallback__') {
            setLoadingStep('⚡ Gemini 한도 초과 → Groq로 폴백 중...');
            return;
          }
          const friendly = friendlyToolName(call?.name) || call?.name || '데이터 조회';
          setLoadingStep(`🔍 ${friendly}`);
        },
      });

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
        const fallback = autoFallbackSearch(question, { products, customers, orders });
        if (fallback) {
          content = fallback;
          fallbackUsed = true;
          // 폴백 시 차트도 자동 생성 (toolCalls 모방 → ResultRenderer 자동 렌더)
          fallbackToolCalls = buildFallbackToolCalls(question, { products, customers, orders });
        } else {
          content = '⚠️ MOVIS가 답변을 만들지 못했어요. 조금 더 구체적으로 질문해주세요. '
            + '예: "스덴밴딩 종류 보여줘", "강남오토 매출 얼마야?", "재고 부족한 거 알려줘"';
        }
      }
      // role 결정: AI 에러 있어도 폴백 성공이면 assistant로 표시 (사용자에게 유용한 결과)
      // 정말 못 만든 경우(폴백도 실패)만 'error'
      const role = (result.error && !fallbackUsed && !hasAnswer)
        ? 'error'
        : (!hasAnswer && !fallbackUsed)
          ? 'error'
          : 'assistant';
      // 추천 후속 질문 자동 생성 (도구 호출 결과 + 질문 기반)
      const followUps = generateFollowUpQuestions(question, result.toolCalls || fallbackToolCalls);
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
      abortRef.current = null;
    }
  }, [orders, customers, products, savedCarts, aiLearningData, paymentRecords, paymentHistory, customerReturns, isLoading, recordUsage]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setLoadingStep('');
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

  return {
    messages,
    isLoading,
    loadingStep,
    pendingActions,
    resolvePendingAction,
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

// 추천 후속 질문 자동 생성 — 도구 호출 결과 + 질문 패턴 기반
// 답변 하단에 칩 3개로 표시되어 사용자가 다음 질문 클릭만으로 진행 가능
function generateFollowUpQuestions(question, toolCalls = []) {
  const calls = Array.isArray(toolCalls) ? toolCalls : [];
  const callNames = calls.map((c) => c?.name).filter(Boolean);
  const q = String(question || '');

  // 도구별 후속 질문 매핑
  if (callNames.includes('getTopCustomers')) {
    return ['1위 거래처 최근 주문 추이 보여줘', '휴면 거래처 알려줘', '미수 거래처 TOP 5'];
  }
  if (callNames.includes('getTopProducts')) {
    return ['재고 부족한 인기 제품 알려줘', '재주문 추천 리스트 줘', '카테고리별 매출 비교해줘'];
  }
  if (callNames.includes('getCustomerInfo')) {
    return ['이 거래처 최근 3개월 주문 추이', '이 거래처 자주 사는 제품', '이 거래처 미수금 알려줘'];
  }
  if (callNames.includes('getProductInfo')) {
    return ['이 제품 카테고리 다른 제품들', '이 제품 최근 판매 추이', '이 제품 재주문 추천 수량'];
  }
  if (callNames.includes('searchProducts')) {
    return ['이 중 재고 부족한 것만 보여줘', '카테고리별 매출 TOP', '재주문 추천 리스트'];
  }
  if (callNames.includes('searchCustomers')) {
    return ['이 중 휴면 위험 거래처', '이 중 미수 있는 거래처', '매출 TOP 3 알려줘'];
  }
  if (callNames.includes('getCustomerSegments')) {
    return ['VIP 거래처 자주 사는 제품', '신규 거래처 추이', '휴면 거래처 컴백 전략'];
  }
  if (callNames.includes('getLowStockProducts') || callNames.includes('getStockSummary')) {
    return ['재주문 추천 리스트 줘', '품절 임박 제품들 우선 알려줘', '카테고리별 재고 현황'];
  }
  if (callNames.includes('getOverdueCustomers') || callNames.includes('getPaymentSummary')) {
    return ['미수 회수 액션 플래너 짜줘', '60일 이상 미수만 보여줘', 'TOP 미수 거래처 매출 추이'];
  }
  if (callNames.includes('getCollectionPlan')) {
    return ['1순위 거래처 최근 거래 보여줘', '회수 문구 다른 톤으로 작성', '60일 이상 미수만 보여줘'];
  }
  if (callNames.includes('getStockCoverageForecast')) {
    return ['1위 제품 재주문 추천 수량', '카테고리별 품절 임박 분석', '재고 가치 합계'];
  }
  if (callNames.includes('getNextBestOffers')) {
    return ['이 거래처 자주 같이 사는 제품', '이 거래처 최근 매출 추이', '비슷한 패턴 거래처들'];
  }
  if (callNames.includes('getProductBundleSuggestions')) {
    return ['상위 묶음 제품 재고 확인', '이 묶음 구매 거래처 TOP', '비슷한 카테고리 묶음 추천'];
  }
  if (callNames.includes('getMarginLeakage')) {
    return ['1위 제품 가격 인상 시뮬레이션', '카테고리별 평균 마진 비교', '도매가 이하 판매한 거래처'];
  }
  if (callNames.includes('getReturnAnalysis')) {
    return ['반품 자주 나는 제품 TOP', '반품 많은 거래처', '카테고리별 반품률'];
  }
  if (callNames.includes('getCompositeSummary')) {
    return ['이번 달 매출 TOP 거래처', '재고 부족한 인기 제품', '미수금 현황'];
  }

  // 패턴 기반 fallback
  if (/매출|판매|수익/.test(q)) {
    return ['거래처 TOP 5', '인기 제품 TOP 10', '카테고리별 매출 비교'];
  }
  if (/재고|입고|품절/.test(q)) {
    return ['재고 부족 제품 알려줘', '재주문 추천 리스트', '품절 제품 목록'];
  }
  if (/거래처|고객/.test(q)) {
    return ['VIP 거래처 알려줘', '휴면 거래처 알려줘', '미수금 있는 거래처'];
  }
  // 기본
  return ['이번 달 매출 TOP 5', '재고 부족 제품 알려줘', '미수 거래처 알려줘'];
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
