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

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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

      // 빈 응답이면 친절한 안내 메시지로 대체
      const emptyResponseMsg = '⚠️ AI가 응답을 주지 않았어요. 잠시 후 다시 시도해주세요. '
        + '계속 같은 증상이면 ⚙️ 설정에서 "AI 캐시 비우기"를 누른 뒤 다시 질문해주세요.';
      const content = result.answer && result.answer.trim()
        ? result.answer
        : emptyResponseMsg;
      const assistantMsg = {
        id: newId(),
        role: result.error || !result.answer ? 'error' : 'assistant',
        content,
        ts: Date.now(),
        toolCalls: result.toolCalls,
        cached: result.cached,
        iterations: result.iterations,
        provider: result.provider, // 'gemini' | 'groq' | 'gemini→groq'
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
  };
  return map[name] || null;
}
