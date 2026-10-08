import { useCallback, useEffect, useRef, useState } from 'react';
import { askCodex, clearMovisThread } from '../lib/codexAnalyst';
import { loadMovisLibraries } from '../lib/movisLibraries';
const HISTORY = 'movis_history_v2',
  USAGE = 'pos_ai_quick_prompts_usage_v1';
const id = () => crypto.randomUUID();
function stored(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}
export function writeContextSnapshot() {} // Retained for older dashboard imports; no hidden prompt routing.
export default function useAIAnalystChat(context = {}) {
  const [messages, setMessages] = useState(() => stored(HISTORY, stored('pos_ai_analytics_history_v1', [])));
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [loadingSteps, setLoadingSteps] = useState([]);
  const [streamingText, setStreamingText] = useState('');
  const [pendingActions, setPendingActions] = useState([]);
  const [dataState, setDataState] = useState({});
  const latest = useRef({
    context,
    messages
  });
  latest.current = {
    context,
    messages
  };
  const abortRef = useRef(null),
    busy = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abortRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    // Persist text and tool evidence, not large inline image payloads or hidden inference.
    try {
      localStorage.setItem(HISTORY, JSON.stringify(messages.slice(-200).map(({
        image,
        ...m
      }) => m)));
    } catch {/* Keep the current conversation in memory if storage is full. */}
  }, [messages]);
  const addSystemMessage = useCallback(content => setMessages(prev => [...prev, {
    id: id(),
    role: 'system',
    content,
    ts: Date.now()
  }]), []);
  const send = useCallback(async (text, {
    promptId,
    image
  } = {}) => {
    const question = String(text || '').trim();
    if (!question || busy.current) return;
    busy.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    const {
      context: current,
      messages: previous
    } = latest.current;
    const history = previous.filter(m => ['user', 'assistant', 'system'].includes(m.role)).slice(-200).map(m => ({
      role: m.role,
      content: m.content
    }));
    setMessages(prev => [...prev, {
      id: id(),
      role: 'user',
      content: question,
      image,
      ts: Date.now()
    }]);
    setIsLoading(true);
    setStreamingText('');
    const step = label => {
      if (!alive.current || controller.signal.aborted) return;
      setLoadingStep(label);
      setLoadingSteps(prev => [...prev.map(s => ({
        ...s,
        status: 'done'
      })), {
        id: id(),
        label,
        status: 'active'
      }]);
    };
    step('최신 POS 자료 확인');
    if (promptId) {
      const usage = stored(USAGE, {});
      usage[promptId] = (usage[promptId] || 0) + 1;
      try {
        localStorage.setItem(USAGE, JSON.stringify(usage));
      } catch {}
    }
    try {
      const fresh = await (current.loadLibraries || loadMovisLibraries)(controller.signal);
      if (controller.signal.aborted) throw new DOMException('중지됨', 'AbortError');
      setDataState(fresh.dataState || {});
      const input = {
        ...current,
        ...fresh
      };
      // Analytics functions use these established camelCase aliases. Preserve original fields for raw-library access.
      input.orders = (input.orders || []).map(o => ({
        ...o,
        orderNumber: o.orderNumber ?? o.id,
        customerName: o.customerName ?? o.customer_name,
        createdAt: o.createdAt ?? o.created_at,
        priceType: o.priceType ?? o.price_type,
        totalAmount: o.totalAmount ?? o.total ?? o.total_amount ?? 0,
        customerPhone: o.customerPhone ?? o.customer_phone,
        totalReturned: o.totalReturned ?? o.total_returned ?? 0,
        returns: o.returns || [],
        items: o.items || []
      }));
      step('질문과 대화 맥락 확인');
      let streamItem;
      const result = await askCodex(question, input, {
        history,
        image,
        signal: controller.signal,
        onProgress: call => step(call.name === 'verifyWork' ? '조회 근거와 결과 자체 검증' : `자료 확인 · ${call.name}`),
        onDelta: (delta, itemId) => {
          if (!controller.signal.aborted && alive.current) {
            const changed = streamItem !== itemId;
            streamItem = itemId;
            setStreamingText(prev => changed ? delta : prev + delta);
          }
        }
      });
      if (controller.signal.aborted || !alive.current) return;
      const messageId = id();
      const messageDrafts = result.toolCalls.filter(c => c.result?.data?.__messageDraft).map(c => c.result.data);
      setMessages(prev => [...prev, {
        ...result,
        id: messageId,
        role: 'assistant',
        content: result.answer,
        messageDrafts,
        ts: Date.now()
      }]);
      const pending = result.toolCalls.filter(c => c.result?.ok && c.result?.data?.__pending).map(c => ({
        id: id(),
        messageId,
        ...c.result.data,
        verification: result.verification
      }));
      setPendingActions(pending);
      const nav = result.toolCalls.find(c => c.result?.ok && c.result?.data?.__navigate);
      if (nav) current.onNavigate?.(nav.result.data.page);
    } catch (error) {
      if (alive.current) {
        if (error.name === 'AbortError') addSystemMessage('요청을 중지했습니다. 확인하지 않은 변경은 적용하지 않았습니다.');else setMessages(prev => [...prev, {
          id: id(),
          role: 'error',
          content: error.message || '연결에 실패했습니다.',
          ts: Date.now()
        }]);
      }
    } finally {
      busy.current = false;
      abortRef.current = null;
      if (alive.current) {
        setIsLoading(false);
        setLoadingStep('');
        setLoadingSteps([]);
        setStreamingText('');
      }
    }
  }, [addSystemMessage]);
  const sendImage = useCallback(async file => {
    if (busy.current) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      addSystemMessage('사진은 5MB 이하의 JPG·PNG·WebP로 첨부해주세요.');
      return;
    }
    const image = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return send('이 이미지의 내용을 정확히 읽고 POS 자료와 대조해 정리해줘. 불명확한 글자는 확인해줘. 변경은 내가 명시적으로 요청한 경우에만 미리보기를 만들어줘.', {
      image
    });
  }, [send, addSystemMessage]);
  const clear = useCallback(() => {
    if (busy.current) return;
    setMessages([]);
    setPendingActions([]);
    clearMovisThread();
    localStorage.removeItem(HISTORY);
  }, []);
  return {
    messages,
    isLoading,
    loadingStep,
    loadingSteps,
    streamingText,
    pendingActions,
    dataState,
    send,
    sendImage,
    clear,
    clearCache: clearMovisThread,
    addSystemMessage,
    cancel: () => abortRef.current?.abort(),
    getUsage: () => stored(USAGE, {}),
    resolvePendingAction: actionId => setPendingActions(prev => prev.filter(p => p.id !== actionId)),
    clearPendingActions: () => setPendingActions([])
  };
}
