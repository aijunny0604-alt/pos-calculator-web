import { useMemo, useState, useEffect, useRef } from 'react';
import { Menu, ArrowLeft, Sparkles, Crown, Package, Users, TrendingDown, BarChart3, RefreshCw, Settings, X, Check, AlertTriangle, Trash2, Volume2, VolumeX, DollarSign, Wallet, PackageX, LayoutGrid, Truck, Undo2, Brain, TrendingUp, Clock, AudioLines, MessageSquareOff } from 'lucide-react';
import ChatPanel from '@/components/analytics/ChatPanel';
import JarvisHeader from '@/components/analytics/JarvisHeader';
import QuantumSpaceField from '@/components/analytics/QuantumSpaceField';
import '@/components/analytics/ai-analytics.css';
import useAIAnalystChat, { writeContextSnapshot } from '@/hooks/useAIAnalystChat';

// 🧠 AI 학습 저장 전 개인정보 마스킹 + 길이 제한 (Codex 확장)
const LEARNING_MASK_PATTERNS = [
  { re: /\b(?:01[016789]|0[2-6][1-5]?)-?\d{3,4}-?\d{4}\b/g, label: '[전화]' },
  { re: /\b\d{6}-?[1-4]\d{6}\b/g, label: '[주민번호]' },
  { re: /\b\d{3}-?\d{2}-?\d{5}\b/g, label: '[사업자번호]' },
  { re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, label: '[이메일]' },
  { re: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, label: '[카드번호]' },
  { re: /\d{2,3}[가-힣]\s?\d{4}/g, label: '[차량]' },
];
function sanitizeForLearning(text) {
  if (!text || typeof text !== 'string') return '';
  let result = text;
  LEARNING_MASK_PATTERNS.forEach(({ re, label }) => {
    result = result.replace(re, label);
  });
  return result.replace(/\s+/g, ' ').trim().slice(0, 200);
}

// 동일 원문 매칭은 학습 가치 없음 (DB 비대 방지) — Codex 권장
function shouldLearn(originalInput, matchedName) {
  if (!originalInput || !matchedName) return false;
  const a = String(originalInput).trim().toLowerCase().replace(/\s+/g, '');
  const b = String(matchedName).trim().toLowerCase().replace(/\s+/g, '');
  return a !== b; // 다른 경우만 학습 (별칭/오타/줄임말 → 정답 매핑)
}
import useVoiceInput from '@/hooks/useVoiceInput';
import useTextToSpeech from '@/hooks/useTextToSpeech';
import { hasGroqKey, saveGroqKey, getGroqKey, getProviderPreference, setProviderPreference } from '@/lib/aiAnalyst';
import { sfxMicOn, sfxMicOff, sfxMessageArrive, sfxAnswerComplete, sfxError, isMuted, setMuted, unlockAudio } from '@/lib/jarvisSound';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { supabase } from '@/lib/supabase';

// 추천 질문 14개 (좌7 + 우7 분할)
const DEFAULT_PROMPTS = [
  // 좌측 7개 — 매출/VIP/제품 중심
  { id: 'summary', label: '이번 달 전체 요약', icon: BarChart3, side: 'left' },
  { id: 'topRevenue', label: '이번 달 매출 TOP 5', icon: Crown, side: 'left' },
  { id: 'vipSegments', label: 'VIP 세그먼트 분석', icon: Users, side: 'left' },
  { id: 'topProducts', label: '인기 제품 TOP 10', icon: Package, side: 'left' },
  { id: 'category', label: '카테고리별 매출 분석', icon: LayoutGrid, side: 'left' },
  { id: 'productTrend', label: '최근 3개월 매출 추이', icon: TrendingUp, side: 'left' },
  { id: 'reactivate', label: '재주문 유도 추천 액션', icon: RefreshCw, side: 'left' },
  // 우측 7개 — 운영/위험/재고 중심
  { id: 'lowStock', label: '재고 부족한 제품', icon: PackageX, side: 'right' },
  { id: 'restock', label: '재주문 추천 (시급도)', icon: Package, side: 'right' },
  { id: 'overdue', label: '미수 30일 이상 거래처', icon: DollarSign, side: 'right' },
  { id: 'paymentInflow', label: '이번 달 입금 이력', icon: Wallet, side: 'right' },
  { id: 'dormant', label: '휴면 거래처 알려줘', icon: TrendingDown, side: 'right' },
  { id: 'pending', label: '출고 예정 주문', icon: Truck, side: 'right' },
  { id: 'returns', label: '반품률 분석', icon: Undo2, side: 'right' },
];

export default function AIAnalytics({
  orders = [],
  customers = [],
  products = [],
  savedCarts = [],
  aiLearningData = [],
  setProducts,
  setCustomers,
  setCurrentPage,
  showToast,
  saveOrder: saveOrderProp,
}) {
  // payment_records / payment_history / customer_returns 는 AIAnalytics 진입 시 lazy load (App state 미보유)
  const [paymentRecords, setPaymentRecords] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [customerReturns, setCustomerReturns] = useState([]);
  const [loadingExtra, setLoadingExtra] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pr, ph, cr] = await Promise.all([
          supabase.getPaymentRecords({ limit: 5000 }),
          supabase.getPaymentHistory({ limit: 5000 }),
          supabase.getCustomerReturns(),
        ]);
        if (cancelled) return;
        setPaymentRecords(pr || []);
        setPaymentHistory(ph || []);
        setCustomerReturns(cr || []);
      } catch (e) {
        console.warn('AI 분석용 추가 데이터 로드 실패:', e);
      } finally {
        if (!cancelled) setLoadingExtra(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const chat = useAIAnalystChat({
    orders, customers, products, savedCarts, aiLearningData,
    paymentRecords, paymentHistory, customerReturns,
  });
  const [executing, setExecuting] = useState(false);

  // 자율 분석 + 자동 인사이트 = OFF (사용자 요청 — 페이지 진입 시 자동 메시지 안 나오게)
  // 사용자가 명시적으로 질문 시작하도록 변경. 빅뱅 인트로만 정상 표시.
  // (이전엔 자동 메시지가 빅뱅과 겹쳐 보여 거슬렸음)

  // 매장 상태 스냅샷 저장 (추천 질문 컨텍스트 추천에 활용 — 미수/재고/품절 임계)
  useEffect(() => {
    if (loadingExtra) return;
    if (!products.length) return;
    writeContextSnapshot({ products, paymentRecords, orders });
  }, [loadingExtra, products.length, paymentRecords.length, orders.length]);

  // TTS (한국어 여성 voice)
  const tts = useTextToSpeech();

  // 효과음 음소거 상태
  const [sfxMuted, setSfxMutedState] = useState(() => isMuted());
  const toggleSfx = () => {
    const next = !sfxMuted;
    setMuted(next);
    setSfxMutedState(next);
    if (!next) unlockAudio();
  };

  // 음성 인식 → 질문 전송 시 음성으로 들어온 거 표시 (자동 TTS 응답용)
  const lastInputWasVoiceRef = useRef(false);

  // 음성 인식 훅
  const voice = useVoiceInput({
    autoSubmit: true,
    onFinal: (text) => {
      lastInputWasVoiceRef.current = true;
      sfxMicOff();
      chat.send(text);
    },
  });

  // 마이크 시작 시 효과음 + JARVIS 응답
  useEffect(() => {
    if (voice.isListening) {
      unlockAudio();
      sfxMicOn();
    }
  }, [voice.isListening]);

  // 새 AI 메시지 도착 → 효과음 + (음성 입력 사용자라면) 자동 TTS
  const prevMsgCountRef = useRef(chat.messages.length);
  useEffect(() => {
    const prev = prevMsgCountRef.current;
    const cur = chat.messages.length;
    if (cur > prev) {
      const last = chat.messages[cur - 1];
      if (last?.role === 'assistant') {
        sfxAnswerComplete();
        // 음성으로 질문했거나 TTS 강제 ON이면 자동 발화
        if (lastInputWasVoiceRef.current || tts.enabled) {
          // 마크다운 문법 제거 (간단 정리)
          const plain = (last.content || '')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/##\s+/g, '')
            .replace(/`/g, '')
            .replace(/[│┌┐└┘├┤┬┴┼─━]/g, ' ')
            .slice(0, 600); // 너무 길면 잘림 방지
          tts.speak(plain);
          lastInputWasVoiceRef.current = false;
        }
      } else if (last?.role === 'error') {
        sfxError();
        lastInputWasVoiceRef.current = false;
      } else if (last?.role === 'system') {
        sfxMessageArrive();
      }
    }
    prevMsgCountRef.current = cur;
  }, [chat.messages, tts]);

  // 쓰기 액션 실행
  const handleExecuteAction = async (pending) => {
    setExecuting(true);
    try {
      if (pending.action === 'addProduct') {
        const created = await supabase.addProduct(pending.params);
        if (created) {
          setProducts?.((prev) => [...prev, created]);
          chat.addSystemMessage(`✅ 제품 "${pending.params.name}" 등록 완료 (id: ${created.id})`);
          showToast?.(`제품 "${pending.params.name}" 추가됨`, 'success');
        } else {
          chat.addSystemMessage(`❌ 제품 "${pending.params.name}" 등록 실패`);
          showToast?.('제품 등록 실패', 'error');
        }
      } else if (pending.action === 'bulkAddProduct') {
        const { products: productRows } = pending.params;
        const results = await Promise.all(
          productRows.map((product) =>
            supabase.addProduct(product)
              .then((created) => ({ ok: Boolean(created), created, product }))
              .catch(() => ({ ok: false, created: null, product }))
          )
        );
        const okList = results.filter((r) => r.ok);
        const failList = results.filter((r) => !r.ok);
        if (okList.length > 0) {
          setProducts?.((prev) => [...prev, ...okList.map((r) => r.created)]);
        }
        const summary = `✅ 제품 ${okList.length}건 등록 완료${failList.length > 0 ? ` (실패 ${failList.length}건)` : ''}`;
        chat.addSystemMessage(summary);
        showToast?.(summary, okList.length > 0 ? 'success' : 'error');
      } else if (pending.action === 'addCustomer') {
        const created = await supabase.addCustomer(pending.params);
        if (created) {
          setCustomers?.((prev) => [...prev, created]);
          chat.addSystemMessage(`✅ 거래처 "${pending.params.name}" 등록 완료 (id: ${created.id})`);
          showToast?.(`거래처 "${pending.params.name}" 추가됨`, 'success');
        } else {
          chat.addSystemMessage(`❌ 거래처 "${pending.params.name}" 등록 실패`);
          showToast?.('거래처 등록 실패', 'error');
        }
      } else if (pending.action === 'bulkAddCustomer') {
        const { customers: customerRows } = pending.params;
        const results = await Promise.all(
          customerRows.map((customer) =>
            supabase.addCustomer(customer)
              .then((created) => ({ ok: Boolean(created), created, customer }))
              .catch(() => ({ ok: false, created: null, customer }))
          )
        );
        const okList = results.filter((r) => r.ok);
        const failList = results.filter((r) => !r.ok);
        if (okList.length > 0) {
          setCustomers?.((prev) => [...prev, ...okList.map((r) => r.created)]);
        }
        const summary = `✅ 거래처 ${okList.length}건 등록 완료${failList.length > 0 ? ` (실패 ${failList.length}건)` : ''}`;
        chat.addSystemMessage(summary);
        showToast?.(summary, okList.length > 0 ? 'success' : 'error');
      } else if (pending.action === 'updateProductStock') {
        const { productId, productName, newStock } = pending.params;
        const updated = await supabase.updateProduct(productId, { stock: newStock });
        if (updated) {
          setProducts?.((prev) => prev.map((p) => p.id === productId ? { ...p, stock: newStock } : p));
          chat.addSystemMessage(`✅ "${productName}" 재고 ${newStock}개로 변경 완료`);
          showToast?.(`재고 변경됨: ${productName} → ${newStock}개`, 'success');
        } else {
          chat.addSystemMessage(`❌ "${productName}" 재고 변경 실패`);
          showToast?.('재고 변경 실패', 'error');
        }
      } else if (pending.action === 'bulkUpdateProductStock') {
        const { updates } = pending.params;
        // Promise.all로 일괄 호출
        const results = await Promise.all(
          updates.map((u) =>
            supabase.updateProduct(u.productId, { stock: u.newStock })
              .then((r) => ({ ok: Boolean(r), update: u }))
              .catch(() => ({ ok: false, update: u }))
          )
        );
        const okList = results.filter((r) => r.ok);
        const failList = results.filter((r) => !r.ok);
        if (okList.length > 0) {
          // setProducts 일괄 반영
          setProducts?.((prev) => {
            const map = new Map(okList.map((r) => [r.update.productId, r.update.newStock]));
            return prev.map((p) => (map.has(p.id) ? { ...p, stock: map.get(p.id) } : p));
          });
          // 🧠 AI 자가 학습 (bulk = 30+ 라인 한번에) — ROI 최고
          // 가드: exact match 스킵
          okList.forEach(({ update: u }) => {
            if (!u?.inputName || !u?.productId) return;
            const matchedProduct = products.find((p) => p.id === u.productId);
            if (!matchedProduct) return;
            if (!shouldLearn(u.inputName, matchedProduct.name)) return; // exact match 스킵
            const original = sanitizeForLearning(u.inputName);
            if (!original) return;
            const normalized = original.toLowerCase().replace(/\s+/g, '').replace(/ㅡ/g, '-');
            supabase.upsertAiLearning(
              original, normalized,
              u.productId, matchedProduct.name,
              u.newStock || 1,
              'bulkUpdateProductStock confirm 학습',
            ).catch((e) => console.warn('AI 학습 저장 실패:', e));
          });
        }
        const summary = `✅ 재고 ${okList.length}건 변경 완료${failList.length > 0 ? ` (실패 ${failList.length}건)` : ''}`;
        chat.addSystemMessage(summary);
        showToast?.(summary, okList.length > 0 ? 'success' : 'error');
      } else if (pending.action === 'saveOrder') {
        if (!saveOrderProp) {
          chat.addSystemMessage(`❌ 주문 저장 함수가 전달되지 않았습니다.`);
        } else {
          const { customerName, customerPhone, customerAddress, priceType, items, total, memo } = pending.params;
          const result = await saveOrderProp({
            customer_name: customerName,
            customer_phone: customerPhone,
            customer_address: customerAddress,
            price_type: priceType,
            items,
            total_amount: total,
            memo,
          });
          if (result) {
            chat.addSystemMessage(`✅ 주문 등록 완료 — "${customerName}" / ${items.length}건 / ${total.toLocaleString('ko-KR')}원${result.merged ? ' (당일 기존 주문에 병합)' : ''}`);
            showToast?.(`주문 저장: ${customerName} ${total.toLocaleString('ko-KR')}원`, 'success');
            // 🧠 AI 자가 학습: 매칭된 제품들을 ai_learning에 자동 저장
            // → 다음 번 같은 입력 시 1단계 학습 매칭으로 즉시 정확
            // 가드: autoMatched + 원문≠매칭명 (별칭/오타만 학습)
            items.forEach((it) => {
              if (!it?.originalInput || !it?.id) return;
              if (!shouldLearn(it.originalInput, it.name)) return; // exact match 스킵
              const original = sanitizeForLearning(it.originalInput);
              if (!original) return;
              const normalized = original.toLowerCase().replace(/\s+/g, '').replace(/ㅡ/g, '-');
              supabase.upsertAiLearning(
                original,
                normalized,
                it.id,
                it.name,
                it.quantity || 1,
                'saveOrder confirm 자동 학습',
              ).catch((e) => console.warn('AI 학습 저장 실패:', e));
            });
          } else {
            chat.addSystemMessage(`❌ 주문 등록 실패`);
            showToast?.('주문 저장 실패', 'error');
          }
        }
      } else if (pending.action === 'updateCustomer') {
        const { customerId, customerName, phone, address } = pending.params;
        const patch = {};
        if (phone !== undefined) patch.phone = phone;
        if (address !== undefined) patch.address = address;
        const updated = await supabase.updateCustomer(customerId, patch);
        if (updated) {
          setCustomers?.((prev) => prev.map((c) => c.id === customerId ? { ...c, ...patch } : c));
          chat.addSystemMessage(`✅ "${customerName}" 정보 변경 완료`);
          showToast?.(`거래처 수정: ${customerName}`, 'success');
        } else {
          chat.addSystemMessage(`❌ "${customerName}" 정보 변경 실패`);
          showToast?.('거래처 수정 실패', 'error');
        }
      } else if (pending.action === 'bulkUpdateCustomer') {
        const { updates } = pending.params;
        const results = await Promise.all(
          updates.map((u) => {
            const patch = {};
            if (u.phone !== undefined) patch.phone = u.phone;
            if (u.address !== undefined) patch.address = u.address;
            return supabase.updateCustomer(u.customerId, patch)
              .then((updated) => ({ ok: Boolean(updated), update: u, patch }))
              .catch(() => ({ ok: false, update: u, patch }));
          })
        );
        const okList = results.filter((r) => r.ok);
        const failList = results.filter((r) => !r.ok);
        if (okList.length > 0) {
          setCustomers?.((prev) => {
            const map = new Map(okList.map((r) => [r.update.customerId, r.patch]));
            return prev.map((c) => (map.has(c.id) ? { ...c, ...map.get(c.id) } : c));
          });
        }
        const summary = `✅ 거래처 ${okList.length}건 정보 변경 완료${failList.length > 0 ? ` (실패 ${failList.length}건)` : ''}`;
        chat.addSystemMessage(summary);
        showToast?.(summary, okList.length > 0 ? 'success' : 'error');
      } else if (pending.action === 'updateProductPrice') {
        const { productId, productName, wholesale, retail } = pending.params;
        const patch = {};
        if (wholesale != null) patch.wholesale = wholesale;
        if (retail != null) patch.retail = retail;
        const updated = await supabase.updateProduct(productId, patch);
        if (updated) {
          setProducts?.((prev) => prev.map((p) => p.id === productId ? { ...p, ...patch } : p));
          const changes = [
            wholesale != null ? `도매 ${wholesale.toLocaleString('ko-KR')}원` : null,
            retail != null ? `소비자 ${retail.toLocaleString('ko-KR')}원` : null,
          ].filter(Boolean).join(' / ');
          chat.addSystemMessage(`✅ "${productName}" 가격 변경 완료 (${changes})`);
          showToast?.(`가격 변경됨: ${productName}`, 'success');
        } else {
          chat.addSystemMessage(`❌ "${productName}" 가격 변경 실패`);
          showToast?.('가격 변경 실패', 'error');
        }
      } else if (pending.action === 'bulkUpdateProductPrice') {
        const { updates } = pending.params;
        const results = await Promise.all(
          updates.map((u) => {
            const patch = {};
            if (u.wholesale != null) patch.wholesale = u.wholesale;
            if (u.retail != null) patch.retail = u.retail;
            return supabase.updateProduct(u.productId, patch)
              .then((updated) => ({ ok: Boolean(updated), update: u, patch }))
              .catch(() => ({ ok: false, update: u, patch }));
          })
        );
        const okList = results.filter((r) => r.ok);
        const failList = results.filter((r) => !r.ok);
        if (okList.length > 0) {
          setProducts?.((prev) => {
            const map = new Map(okList.map((r) => [r.update.productId, r.patch]));
            return prev.map((p) => (map.has(p.id) ? { ...p, ...map.get(p.id) } : p));
          });
        }
        const summary = `✅ 가격 ${okList.length}건 변경 완료${failList.length > 0 ? ` (실패 ${failList.length}건)` : ''}`;
        chat.addSystemMessage(summary);
        showToast?.(summary, okList.length > 0 ? 'success' : 'error');
      }
    } catch (e) {
      chat.addSystemMessage(`❌ 오류: ${e.message || e}`);
      showToast?.(`실행 중 오류: ${e.message || e}`, 'error');
    } finally {
      setExecuting(false);
      chat.resolvePendingAction(pending.id);
    }
  };

  const handleCancelAction = (pending) => {
    const labelMap = {
      addProduct: `제품 "${pending.params.name}" 등록`,
      addCustomer: `거래처 "${pending.params.name}" 등록`,
      bulkAddProduct: `제품 ${pending.params.products?.length || 0}건 일괄 등록`,
      bulkAddCustomer: `거래처 ${pending.params.customers?.length || 0}건 일괄 등록`,
      updateProductStock: `"${pending.params.productName}" 재고 변경`,
      updateProductPrice: `"${pending.params.productName}" 가격 변경`,
      bulkUpdateProductPrice: `가격 ${pending.params.updates?.length || 0}건 일괄 변경`,
      saveOrder: `"${pending.params.customerName}" 주문 등록`,
      updateCustomer: `"${pending.params.customerName}" 정보 수정`,
      bulkUpdateCustomer: `거래처 ${pending.params.updates?.length || 0}건 정보 일괄 변경`,
    };
    chat.addSystemMessage(`↩️ ${labelMap[pending.action] || pending.action} 취소됨`);
    chat.resolvePendingAction(pending.id);
  };
  const [showSettings, setShowSettings] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [provider, setProvider] = useState(() => getProviderPreference());
  const [groqEnabled, setGroqEnabled] = useState(() => hasGroqKey());

  useEffect(() => {
    if (showSettings) setKeyInput(getGroqKey());
  }, [showSettings]);

  // 사용 빈도 적용한 추천 질문 정렬
  const sortedPrompts = useMemo(() => {
    const usage = chat.getUsage();
    return [...DEFAULT_PROMPTS].sort((a, b) => (usage[b.id] || 0) - (usage[a.id] || 0))
      .map((p) => ({ ...p, count: usage[p.id] || 0 }));
  }, [chat.messages]); // 새 메시지마다 재정렬

  const dataReady = orders.length > 0 || customers.length > 0 || products.length > 0;

  const handleSelect = (item) => {
    chat.send(item.label, { promptId: item.id });
  };

  const handleSaveKey = () => {
    const trimmed = (keyInput || '').trim();
    if (trimmed && !trimmed.startsWith('gsk_')) {
      alert('Groq 키는 "gsk_"로 시작합니다. 다시 확인해주세요.');
      return;
    }
    saveGroqKey(trimmed);
    setGroqEnabled(Boolean(trimmed));
    setShowSettings(false);
  };

  const handleProviderChange = (value) => {
    setProvider(value);
    setProviderPreference(value);
  };

  // 전체 AI 데이터 초기화 (대화 + 캐시 + 사용 빈도 + RFM 임계값)
  // Groq 키와 프로바이더 선택은 유지
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const handleResetAll = () => {
    try {
      // 대화 히스토리
      chat.clear();
      // 답변 캐시
      chat.clearCache();
      // 사용 빈도
      localStorage.removeItem('pos_ai_quick_prompts_usage_v1');
      // RFM 임계값
      localStorage.removeItem('pos_ai_rfm_thresholds_v1');
      // 저장된 인사이트 (Phase 5 예약 키)
      localStorage.removeItem('pos_ai_insights_v1');
      showToast?.('AI 데이터를 모두 초기화했습니다', 'success');
    } catch (e) {
      showToast?.(`초기화 실패: ${e.message}`, 'error');
    } finally {
      setShowResetConfirm(false);
      setShowSettings(false);
    }
  };

  // 헤더 우측 액션 버튼 묶음
  const rightActions = (
    <>
      {groqEnabled && (
        <span className="hidden sm:inline px-2 py-1 rounded text-[10px] font-mono font-semibold uppercase tracking-wider" style={{
          background: 'rgba(0, 255, 136, 0.15)',
          color: 'var(--jarvis-success)',
          border: '1px solid rgba(0, 212, 255, 0.22)',
          boxShadow: '0 0 8px rgba(0,255,136,0.18)',
        }} title="Groq 폴백 활성화됨">
          ⚡ GROQ
        </span>
      )}
      <button
        type="button"
        onClick={() => { unlockAudio(); toggleSfx(); }}
        className="p-2 rounded hover:bg-cyan-500/10 transition-colors"
        title={sfxMuted ? '효과음 켜기' : '효과음 끄기'}
        aria-label={sfxMuted ? '효과음 켜기' : '효과음 끄기'}
      >
        {sfxMuted
          ? <VolumeX className="w-4 h-4" style={{ color: 'var(--jarvis-text-muted)' }} />
          : <Volume2 className="w-4 h-4" style={{ color: 'var(--jarvis-cyan)', filter: 'drop-shadow(0 0 4px rgba(0,212,255,0.45))' }} />}
      </button>
      {tts.supported && (
        <button
          type="button"
          onClick={() => tts.setEnabled(!tts.enabled)}
          className="p-2 rounded hover:bg-cyan-500/10 transition-colors"
          title={tts.enabled ? 'AI 답변 자동 음성 ON' : 'AI 답변 자동 음성 OFF (음성 입력 시는 항상 재생)'}
          aria-label="TTS 토글"
          style={{ color: tts.enabled ? 'var(--jarvis-cyan)' : 'var(--jarvis-text-muted)' }}
        >
          {tts.enabled
            ? <AudioLines className="w-4 h-4" style={{ color: 'var(--jarvis-accent)', filter: 'drop-shadow(0 0 4px rgba(0,212,255,0.6))' }} />
            : <MessageSquareOff className="w-4 h-4" style={{ color: 'var(--jarvis-text-muted)' }} />}
        </button>
      )}
      <button
        type="button"
        onClick={() => setShowSettings(true)}
        className="p-2 rounded hover:bg-cyan-500/10 transition-colors"
        aria-label="AI 설정"
        title="AI 설정"
        style={{ color: 'var(--jarvis-text-muted)' }}
      >
        <Settings className="w-4 h-4" />
      </button>
    </>
  );

  return (
    <div
      className="ai-analytics-root flex flex-col h-full overflow-hidden relative"
      style={{ perspective: 'var(--jarvis-perspective)' }}
    >
      <div
        className="ai-analytics-main-enter flex flex-col h-full overflow-hidden"
      >

      {/* 우주 배경 제거 — 사용자 요청: 스페이스 블랙 + 양자 sphere만 */}

      {/* JARVIS 헤더 */}
      <JarvisHeader
        counts={{ orders: orders.length, customers: customers.length, products: products.length }}
        loadingExtra={loadingExtra}
        rightActions={rightActions}
        onBack={() => setCurrentPage?.('dashboard')}
        onSidebarToggle={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
      />

      {/* 설정 모달 */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowSettings(false)}>
          <div className="movis-glass-card max-w-md w-full p-4 sm:p-6 min-w-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2 movis-text-primary min-w-0">
                <Settings className="w-5 h-5" />
                AI 설정
              </h3>
              <button onClick={() => setShowSettings(false)} className="p-2 rounded hover:bg-cyan-500/10 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="닫기">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Groq API 키 */}
            <div className="mb-5">
              <label className="block text-sm font-semibold mb-1.5">⚡ Groq API 키 (폴백용)</label>
              <p className="text-xs text-[var(--jarvis-text-muted)] mb-2 break-keep leading-snug">
                Gemini 한도 초과 시 자동 사용. 무료 발급:{' '}
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-[var(--jarvis-cyan)] underline">
                  console.groq.com/keys
                </a>
              </p>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="gsk_..."
                className="w-full px-3 py-2 rounded-lg border border-cyan-400/20 bg-[#0f1a2d]/70 text-[var(--jarvis-text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-400/25 text-sm font-mono"
                autoComplete="off"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleSaveKey}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-[var(--jarvis-cyan)] text-[#050b18] text-sm font-semibold hover:opacity-90"
                >
                  <Check className="w-4 h-4" />
                  저장
                </button>
                {groqEnabled && (
                  <button
                    onClick={() => { saveGroqKey(''); setKeyInput(''); setGroqEnabled(false); }}
                    className="px-3 py-2 rounded-lg border border-cyan-400/20 text-sm hover:bg-cyan-500/10"
                  >
                    삭제
                  </button>
                )}
              </div>
              {groqEnabled && <p className="text-xs text-emerald-400 mt-1.5">✓ Groq 키 설정됨</p>}
            </div>

            {/* 프로바이더 선택 */}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">AI 프로바이더</label>
              <div className="space-y-1.5">
                {[
                  { v: 'auto', label: '자동 (Gemini → Groq 폴백) — 추천' },
                  { v: 'gemini-only', label: 'Gemini만 사용' },
                  { v: 'groq-only', label: 'Groq만 사용 (키 필요)', disabled: !groqEnabled },
                ].map((opt) => (
                  <label key={opt.v} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm min-w-0 ${
                    provider === opt.v ? 'border-cyan-400/25 bg-cyan-500/10' : 'border-cyan-400/20'
                  } ${opt.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-cyan-500/10'}`}>
                    <input
                      type="radio"
                      name="aiProvider"
                      value={opt.v}
                      checked={provider === opt.v}
                      disabled={opt.disabled}
                      onChange={(e) => handleProviderChange(e.target.value)}
                      className="flex-shrink-0"
                    />
                    <span className="break-words min-w-0">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 데이터 관리 섹션 */}
            <div className="border-t border-cyan-400/20 pt-4 mb-4">
              <label className="block text-sm font-semibold mb-2 flex items-center gap-2 movis-text-primary">
                <Trash2 className="w-4 h-4" />
                데이터 관리
              </label>
              <div className="space-y-2">
                <button
                  onClick={() => { chat.clear(); showToast?.('대화 히스토리 삭제됨', 'success'); setShowSettings(false); }}
                  className="w-full text-left px-3 py-2 rounded-lg border border-cyan-400/20 hover:bg-cyan-500/10 text-sm flex items-center justify-between gap-2"
                >
                  <span>💬 대화 히스토리만 지우기</span>
                  <span className="text-[10px] text-[var(--jarvis-text-muted)]">{chat.messages.length}개</span>
                </button>
                <button
                  onClick={() => { chat.clearCache(); showToast?.('답변 캐시 비움', 'success'); setShowSettings(false); }}
                  className="w-full text-left px-3 py-2 rounded-lg border border-cyan-400/20 hover:bg-cyan-500/10 text-sm"
                >
                  📋 답변 캐시 비우기 (5분 TTL)
                </button>
                <button
                  onClick={() => setShowResetConfirm(true)}
                  className="w-full text-left px-3 py-2 rounded-lg border border-cyan-400/20 bg-red-500/10 text-rose-400 hover:bg-red-500/15 text-sm font-semibold flex items-center gap-2"
                >
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  🗑️ 전체 AI 데이터 초기화
                </button>
              </div>
              <div className="text-[10px] text-[var(--jarvis-text-muted)] mt-2 break-words leading-snug">
                ⚠️ 전체 초기화: 대화 + 캐시 + 사용 빈도 + RFM 임계값 + 인사이트 모두 삭제 (Groq 키와 프로바이더 선택은 유지)
              </div>
            </div>

            <div className="text-[11px] text-[var(--jarvis-text-muted)] border-t border-cyan-400/20 pt-4 break-words leading-snug">
              💡 키는 브라우저 localStorage에만 저장되며 서버로 전송되지 않습니다. 보안을 위해 Groq Console에서 정기 교체를 권장합니다.
            </div>
          </div>
        </div>
      )}

      {/* 전체 초기화 확인 다이얼로그 */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="모든 AI 데이터를 초기화할까요?"
        message={`다음 항목이 모두 삭제됩니다:\n\n• 대화 히스토리 ${chat.messages.length}개\n• 답변 캐시\n• 추천 질문 사용 빈도\n• RFM 임계값 설정\n• 저장된 인사이트\n\n(Groq 키와 프로바이더 선택은 유지됩니다)\n\n되돌릴 수 없습니다.`}
        confirmText="🗑️ 전체 초기화"
        cancelText="취소"
        destructive
        onConfirm={handleResetAll}
        onCancel={() => setShowResetConfirm(false)}
      />

      {/* 데이터 부족 안내 */}
      {!dataReady && (
        <div className="px-4 py-2 text-xs flex-shrink-0 relative z-10" style={{
          background: 'rgba(255, 170, 0, 0.12)',
          color: 'var(--jarvis-warning)',
          borderBottom: '1px solid rgba(0, 212, 255, 0.2)',
        }}>
          ⚠ NEURAL LINK SYNC... 데이터를 불러오는 중입니다.
        </div>
      )}

      {/* 메인 채팅 — z축 0 중경 */}
      <div className="flex-1 min-h-0 relative" style={{ zIndex: 5 }}>
        <ChatPanel
          messages={chat.messages}
          onSend={(text) => { lastInputWasVoiceRef.current = false; chat.send(text); }}
          isLoading={chat.isLoading}
          loadingStep={chat.loadingStep}
          suggestedItems={sortedPrompts}
          onSelectSuggested={(item) => { lastInputWasVoiceRef.current = false; handleSelect(item); }}
          onClear={chat.clear}
          onCancel={chat.cancel}
          disabled={!dataReady}
          voice={voice}
          tts={tts}
        />
      </div>

      {/* 쓰기 액션 Confirm 모달 (큐 처리 — 첫 번째 pending만 표시) */}
      {chat.pendingActions.length > 0 && (() => {
        const pending = chat.pendingActions[0];
        const titleMap = {
          addProduct: { title: '제품 등록 확인', Icon: Package },
          addCustomer: { title: '거래처 등록 확인', Icon: Users },
          bulkAddProduct: { title: '제품 일괄 등록 확인', Icon: Package },
          bulkAddCustomer: { title: '거래처 일괄 등록 확인', Icon: Users },
          updateProductStock: { title: '재고 변경 확인', Icon: Package },
          updateProductPrice: { title: '가격 변경 확인', Icon: DollarSign },
          bulkUpdateProductPrice: { title: '가격 일괄 변경 확인', Icon: DollarSign },
          saveOrder: { title: '주문 등록 확인', Icon: Truck },
          updateCustomer: { title: '거래처 정보 수정 확인', Icon: Users },
          bulkUpdateCustomer: { title: '거래처 정보 일괄 변경 확인', Icon: Users },
          bulkUpdateProductStock: { title: '재고 일괄 변경 확인', Icon: PackageX },
        };
        const meta = titleMap[pending.action] || { title: '작업 확인', Icon: AlertTriangle };
        const Icon = meta.Icon;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="movis-glass-card max-w-md w-full p-4 sm:p-6 min-w-0">
              <div className="flex items-center gap-2 mb-4 movis-text-primary">
                <Icon className="w-5 h-5 text-[var(--jarvis-cyan)]" />
                <h3 className="text-lg font-bold">{meta.title}</h3>
              </div>
              <div className="bg-[#0f1a2d]/70 border border-cyan-400/20 rounded-lg p-3 mb-4 text-sm whitespace-pre-line break-words leading-relaxed">
                {pending.preview}
              </div>
              {pending.warnings.length > 0 && (
                <div className="bg-amber-500/10 border border-cyan-400/20 rounded-lg p-3 mb-4">
                  {pending.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-amber-300 break-words">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[11px] text-[var(--jarvis-text-muted)] mb-4 break-words leading-snug">
                💡 [실행] 누르면 Supabase에 즉시 저장됩니다. 잘못된 경우 관리자 페이지에서 수정/삭제 가능합니다.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleExecuteAction(pending)}
                  disabled={executing}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-[var(--jarvis-cyan)] text-[#050b18] font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {executing ? '실행 중...' : '✅ 실행'}
                </button>
                <button
                  onClick={() => handleCancelAction(pending)}
                  disabled={executing}
                  className="px-4 py-2 rounded-lg border border-cyan-400/20 hover:bg-cyan-500/10 disabled:opacity-50"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      </div>
    </div>
  );
}
