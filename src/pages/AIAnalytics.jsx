import { useMemo, useState, useEffect, useRef } from 'react';
import { Menu, ArrowLeft, Sparkles, Crown, Package, Users, TrendingDown, BarChart3, RefreshCw, Settings, X, Check, AlertTriangle, Trash2, Volume2, VolumeX, DollarSign, Wallet, PackageX, LayoutGrid, Truck, Undo2, Brain, TrendingUp, Clock, AudioLines, MessageSquareOff, MessageSquare } from 'lucide-react';
import ChatPanel from '@/components/analytics/ChatPanel';
import JarvisHeader from '@/components/analytics/JarvisHeader';
import QuantumSpaceField from '@/components/analytics/QuantumSpaceField';
import ApiUsageGauge from '@/components/analytics/ApiUsageGauge';
import OrderConfirmEditable from '@/components/analytics/OrderConfirmEditable';
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
import { uploadCertToLibrary, deleteImages } from '@/lib/imageUpload';

// 추천 질문 14개 (좌7 + 우7 분할)
const DEFAULT_PROMPTS = [
  // 좌측 — 매출/VIP/제품 중심
  { id: 'dailyClose', label: '📅 오늘 마감 정리', icon: BarChart3, side: 'left', query: '오늘 마감 정리해줘' },
  { id: 'summary', label: '이번 달 전체 요약', icon: BarChart3, side: 'left' },
  { id: 'topRevenue', label: '이번 달 매출 TOP 5', icon: Crown, side: 'left' },
  { id: 'vipSegments', label: 'VIP 세그먼트 분석', icon: Users, side: 'left' },
  { id: 'topProducts', label: '인기 제품 TOP 10', icon: Package, side: 'left' },
  { id: 'category', label: '카테고리별 매출 분석', icon: LayoutGrid, side: 'left' },
  { id: 'productTrend', label: '최근 3개월 매출 추이', icon: TrendingUp, side: 'left' },
  { id: 'reactivate', label: '재주문 유도 추천 액션', icon: RefreshCw, side: 'left' },
  // 우측 — 운영/위험/재고 중심
  { id: 'collectMsg', label: '✉️ 미수 안내 문자 작성', icon: MessageSquare, side: 'right', query: '미수 오래된 거래처 한 곳 골라서 정산 안내 문자 초안 만들어줘' },
  { id: 'lowStock', label: '재고 부족한 제품', icon: PackageX, side: 'right' },
  { id: 'restock', label: '재주문 추천 (시급도)', icon: Package, side: 'right' },
  { id: 'overdue', label: '미수 30일 이상 거래처', icon: DollarSign, side: 'right' },
  { id: 'paymentInflow', label: '이번 달 입금 이력', icon: Wallet, side: 'right' },
  { id: 'dormant', label: '휴면 거래처 알려줘', icon: TrendingDown, side: 'right' },
  { id: 'pending', label: '출고 예정 주문', icon: Truck, side: 'right' },
  { id: 'returns', label: '반품률 분석', icon: Undo2, side: 'right' },
  // 라벨≠질문: 클릭하면 query 가 전송됨 → MOVIS가 "리뷰 붙여넣어 주세요" 안내 후 답글 작성
  { id: 'reviewReply', label: '🗣 리뷰 답글 쓰기', icon: MessageSquare, side: 'right',
    query: '네이버 스토어 구매평에 답글을 쓰려고 해. 리뷰를 붙여넣을 테니 정중형/친근형 두 가지 답글을 써줘. 먼저 리뷰를 붙여넣으라고 안내해줘.' },
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
  const [externalOrders, setExternalOrders] = useState([]); // 스마트스토어 주문 (MOVIS 도구용)
  const [externalProducts, setExternalProducts] = useState([]); // 네이버 스토어 상품 카탈로그 (searchNaverCatalog 도구용)
  const [loadingExtra, setLoadingExtra] = useState(true);

  // 컴포넌트 자체 마운트 페이드인 (AppLayout wrapper의 페이드인이 Suspense swap에 의해 무력화되는 문제 fix)
  // PC: chunk가 너무 빨리 로드되어 wrapper 페이드인보다 swap이 빠름 → 페이드인 안 보임
  // iPhone: chunk 로드 느려서 페이드인 시간 동안 swap → 정상 보임
  const [mountFadeIn, setMountFadeIn] = useState(false);
  useEffect(() => {
    // requestAnimationFrame 2번으로 mount → paint → opacity 트랜지션 보장.
    // ⚠️ 안전장치: rAF 체인이 안 끝나면(탭 백그라운드/스로틀) opacity:0 그대로 = 흰 화면 고착.
    //   200ms 폴백 타이머로 무조건 보이게 보장. (id2 를 외부 변수로 잡아 cleanup 누락 버그도 수정)
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setMountFadeIn(true));
    });
    const safety = setTimeout(() => setMountFadeIn(true), 200);
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
      clearTimeout(safety);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pr, ph, cr, eo, ep] = await Promise.all([
          supabase.getPaymentRecords({ limit: 5000 }),
          supabase.getPaymentHistory({ limit: 5000 }),
          supabase.getCustomerReturns(),
          supabase.getExternalOrders({ limit: 200 }),
          supabase.getExternalProducts({ limit: 5000 }),
        ]);
        if (cancelled) return;
        setPaymentRecords(pr || []);
        setPaymentHistory(ph || []);
        setCustomerReturns(cr || []);
        setExternalOrders(eo || []);
        setExternalProducts(ep || []);
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
    paymentRecords, paymentHistory, customerReturns, externalOrders, externalProducts,
    onNavigate: (page) => { try { setCurrentPage?.(page); showToast?.(`${page} 페이지로 이동`, 'success'); } catch { /* noop */ } },
  });
  const [executing, setExecuting] = useState(false);

  // 📄 사업자등록증 인식 결과 → 거래처 등록 + 등록증 보관함 저장 (CertRegisterCard 콜백)
  const handleCertRegister = async ({ mode, customerId, data, dataUrl }) => {
    let createdCustomerId = null; // 롤백용(신규 생성 후 실패 시 삭제)
    let uploadedPath = null;      // 롤백용(업로드 후 실패 시 Storage 정리)
    try {
      // 1) 먼저 이미지 업로드 (가장 실패 가능성 높은 단계를 앞에 → 실패 시 거래처 안 만듦)
      const [head, b64] = String(dataUrl).split(',');
      const mime = (head.match(/data:([^;]+)/) || [, 'image/jpeg'])[1];
      const bin = atob(b64); const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], `${(data.name || 'cert').replace(/[^\w가-힣]/g, '_')}.jpg`, { type: mime });
      const up = await uploadCertToLibrary(file);
      uploadedPath = up.path;

      // 2) 거래처 결정(기존) 또는 생성(신규)
      let cust; let createdNew = false;
      if (mode === 'existing') {
        cust = customers.find((c) => String(c.id) === String(customerId));
        if (!cust) throw new Error('거래처를 찾을 수 없어요');
      } else {
        const memo = [
          data.bizNo && `사업자등록번호: ${data.bizNo}`,
          data.owner && `대표: ${data.owner}`,
          data.bizType && `업태: ${data.bizType}`,
          data.bizItem && `종목: ${data.bizItem}`,
        ].filter(Boolean).join(' / ');
        const created = await supabase.addCustomer({ name: data.name, phone: data.phone || '', address: data.address || '', memo });
        if (!created?.id) throw new Error('거래처 등록 실패');
        cust = created; createdNew = true; createdCustomerId = created.id;
      }

      // 3) 1거래처=1등록증 — 같은 거래처를 가리키던 기존 등록증 행 연결 해제
      await supabase.clearCustomerCertLinks(cust.id);
      // 4) business_certs 행 생성(연결)
      const added = await supabase.addBusinessCert({ name: data.name, storagePath: up.path, url: up.url, customerId: cust.id });
      if (!added.ok) throw new Error(added.error || '보관함 저장 실패');
      // 5) 거래처 상세 링크
      const setRes = await supabase.setCustomerCert(cust.id, up.url, up.path);
      if (!setRes.ok && !setRes.needsMigration) throw new Error(setRes.error || '거래처 링크 실패');

      // 성공 후에야 화면 반영(불완전 상태 노출 방지)
      if (createdNew) setCustomers?.((prev) => (prev.some((c) => c.id === cust.id) ? prev : [...prev, cust]));
      const msg = `✅ ${createdNew ? '신규 거래처 등록 + ' : ''}사업자등록증 저장 완료: ${cust.name}`;
      chat.addSystemMessage(msg);
      showToast?.(msg, 'success');
      return { ok: true, name: cust.name, createdNew };
    } catch (e) {
      // 롤백 — 부분 성공 잔여물 정리
      if (createdCustomerId) { try { await supabase.deleteCustomer(createdCustomerId); } catch { /* noop */ } }
      if (uploadedPath) { try { await deleteImages([uploadedPath]); } catch { /* noop */ } }
      const m = e?.message || '등록 실패';
      showToast?.(m, 'error');
      return { ok: false, error: m };
    }
  };

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
        // 🔇 자동 TTS 제거 (2026-07-20, 사장님 요청 — 음성이 어색): MOVIS가 답변을 스스로 읽지 않음.
        //    특정 답변을 듣고 싶으면 말풍선의 🔊 스피커 버튼을 눌러 수동 재생(MessageBubble tts.speak).
        lastInputWasVoiceRef.current = false;
      } else if (last?.role === 'error') {
        sfxError();
        lastInputWasVoiceRef.current = false;
      } else if (last?.role === 'system') {
        sfxMessageArrive();
      }
    }
    prevMsgCountRef.current = cur;
    // 자동 TTS 제거 후 이 effect는 tts를 쓰지 않음 — deps에 남기면 매 렌더 재실행됨
  }, [chat.messages]);

  // 쓰기 액션 실행
  const handleExecuteAction = async (pending) => {
    setExecuting(true);
    try {
      if (pending.action === 'addProduct') {
        const payload = { ...pending.params };
        const created = await supabase.addProduct(payload);
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
          // 추가 가드: 0원 단가 항목 차단 (Codex 위험 분석) — surcharge 라인은 제외
          const zeroItems = (items || []).filter((it) => !it.isSurcharge && Number(it.price || 0) <= 0);
          if (zeroItems.length > 0) {
            chat.addSystemMessage(`❌ 단가 0원 항목이 있어 저장 차단됨: ${zeroItems.map((i) => i.name).join(', ')}`);
            showToast?.('단가 0원 항목 차단', 'error');
            chat.resolvePendingAction(pending.id);
            setExecuting(false);
            return;
          }
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
        const { customerId, customerName, phone, address, name: newName, is_blacklist } = pending.params;
        const patch = {};
        if (phone !== undefined) patch.phone = phone;
        if (address !== undefined) patch.address = address;
        if (newName !== undefined) patch.name = newName;
        if (is_blacklist !== undefined) patch.is_blacklist = is_blacklist;
        const updated = await supabase.updateCustomer(customerId, patch);
        if (updated) {
          // 상호 변경 시 과거 주문/저장카트/반품 이력도 새 상호로 자동 이전 (안 하면 이력 끊김)
          let movedNote = '';
          if (newName !== undefined && newName !== customerName && supabase.renameCustomerCascade) {
            const moved = await supabase.renameCustomerCascade(customerName, newName);
            const parts = [moved.orders > 0 ? `주문 ${moved.orders}건` : null, moved.carts > 0 ? `카트 ${moved.carts}건` : null, moved.returns > 0 ? `반품 ${moved.returns}건` : null].filter(Boolean);
            if (parts.length > 0) movedNote = ` (${parts.join('/')} 이력 이전)`;
          }
          setCustomers?.((prev) => prev.map((c) => c.id === customerId ? { ...c, ...patch } : c));
          chat.addSystemMessage(`✅ "${customerName}" 정보 변경 완료${movedNote}`);
          showToast?.(`거래처 수정: ${customerName}${movedNote}`, 'success');
        } else {
          chat.addSystemMessage(`❌ "${customerName}" 정보 변경 실패`);
          showToast?.('거래처 수정 실패', 'error');
        }
      } else if (pending.action === 'bulkUpdateCustomer') {
        const { updates } = pending.params;
        const results = await Promise.all(
          updates.map(async (u) => {
            const patch = {};
            if (u.phone !== undefined) patch.phone = u.phone;
            if (u.address !== undefined) patch.address = u.address;
            if (u.newName !== undefined) patch.name = u.newName;
            if (u.isBlacklist !== undefined) patch.is_blacklist = u.isBlacklist;
            try {
              const updated = await supabase.updateCustomer(u.customerId, patch);
              // 상호 변경 시 과거 주문/카트/반품 이력도 새 상호로 이전
              if (updated && u.newName !== undefined && u.newName !== u.customerName && supabase.renameCustomerCascade) {
                await supabase.renameCustomerCascade(u.customerName, u.newName);
              }
              return { ok: Boolean(updated), update: u, patch };
            } catch {
              return { ok: false, update: u, patch };
            }
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
        const blackCount = okList.filter((r) => r.patch.is_blacklist === true).length;
        const renameCount = okList.filter((r) => r.patch.name !== undefined).length;
        const extra = [blackCount > 0 ? `블랙 ${blackCount}` : null, renameCount > 0 ? `상호 ${renameCount}` : null].filter(Boolean).join('·');
        const summary = `✅ 거래처 ${okList.length}건 변경 완료${extra ? ` (${extra})` : ''}${failList.length > 0 ? ` · 실패 ${failList.length}건` : ''}`;
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
      } else if (pending.action === 'updateProductName') {
        const { productId, oldName, name } = pending.params;
        const updated = await supabase.updateProduct(productId, { name });
        if (updated) {
          setProducts?.((prev) => prev.map((p) => p.id === productId ? { ...p, name } : p));
          chat.addSystemMessage(`✅ 제품명 변경: "${oldName}" → "${name}"`);
          showToast?.('제품명 변경됨', 'success');
        } else {
          chat.addSystemMessage(`❌ "${oldName}" 제품명 변경 실패`);
          showToast?.('제품명 변경 실패', 'error');
        }
      } else if (pending.action === 'updateOrderMemo') {
        const { orderId, customerName, memo } = pending.params;
        const updated = await supabase.updateOrder(orderId, { memo });
        if (updated) {
          chat.addSystemMessage(`✅ 주문 ${orderId} (${customerName}) 메모 저장 완료`);
          showToast?.('주문 메모 저장됨', 'success');
        } else {
          chat.addSystemMessage(`❌ 주문 ${orderId} 메모 저장 실패`);
          showToast?.('메모 저장 실패', 'error');
        }
      } else if (pending.action === 'markOrderPaid') {
        const { orderId, customerName, method, amount } = pending.params;
        const order = orders.find((o) => String(o.orderNumber || o.id) === String(orderId)) || null;
        const res = await supabase.syncOrderPaidRecord(orderId, method, order, customers);
        if (res?.success !== false) {
          const label = { card: '카드', cash: '현금', transfer: '계좌이체', other: '기타' }[method] || method;
          chat.addSystemMessage(`✅ "${customerName}" 주문(${orderId}) 완불 처리 완료 — ${Number(amount || 0).toLocaleString('ko-KR')}원 (${label})`);
          showToast?.('완불 처리됨', 'success');
        } else {
          const reason = res?.reason === 'no_customer' ? '거래처 매핑 실패 (완불 기록 안 됨)' : '완불 처리 실패';
          chat.addSystemMessage(`❌ ${reason}`);
          showToast?.(reason, 'error');
        }
      } else if (pending.action === 'createReturn') {
        const { customerName, itemName, quantity, row } = pending.params;
        const saved = await supabase.addCustomerReturn(row);
        if (saved) {
          chat.addSystemMessage(`✅ "${customerName}" ${itemName} ${quantity}개 반품 처리 완료 (주문 ${row.order_number})`);
          showToast?.('반품 처리됨', 'success');
        } else {
          chat.addSystemMessage(`❌ ${itemName} 반품 처리 실패`);
          showToast?.('반품 처리 실패', 'error');
        }
      } else if (pending.action === 'bulkUpdateProductName') {
        const { updates } = pending.params;
        const results = await Promise.all(
          updates.map((u) => supabase.updateProduct(u.productId, { name: u.name })
            .then((r) => ({ ok: Boolean(r), u }))
            .catch(() => ({ ok: false, u })))
        );
        const okList = results.filter((r) => r.ok);
        const failCount = results.length - okList.length;
        if (okList.length > 0) {
          setProducts?.((prev) => {
            const map = new Map(okList.map((r) => [r.u.productId, r.u.name]));
            return prev.map((p) => (map.has(p.id) ? { ...p, name: map.get(p.id) } : p));
          });
        }
        const summary = `✅ 제품명 ${okList.length}건 변경 완료${failCount > 0 ? ` (실패 ${failCount}건)` : ''}`;
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
      updateProductName: `"${pending.params.oldName}" 제품명 변경`,
      bulkUpdateProductName: `제품명 ${pending.params.updates?.length || 0}건 일괄 변경`,
      updateOrderMemo: `주문 ${pending.params.orderId} 메모`,
      saveOrder: `"${pending.params.customerName}" 주문 등록`,
      updateCustomer: `"${pending.params.customerName}" 정보 수정`,
      bulkUpdateCustomer: `거래처 ${pending.params.updates?.length || 0}건 정보 일괄 변경`,
    };
    const extra = chat.pendingActions.length > 1 ? ` 외 ${chat.pendingActions.length - 1}건` : '';
    chat.addSystemMessage(`↩️ ${labelMap[pending.action] || pending.action}${extra} 취소됨`);
    // 잘못 인식돼 여러 건이 큐에 쌓였어도 한 번에 닫는다 (1개씩 제거 시 다음 모달이 떠서 "안 닫힘" 현상 방지)
    chat.clearPendingActions();
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
    // query 가 있으면 실제 전송문은 query, 없으면 label (리뷰 답글처럼 라벨≠질문인 경우)
    chat.send(item.query || item.label, { promptId: item.id });
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
      <ApiUsageGauge />
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
      style={{
        perspective: 'var(--jarvis-perspective)',
        opacity: mountFadeIn ? 1 : 0,
        transition: 'opacity 1100ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div
        className="flex flex-col h-full overflow-hidden"
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
          <div className="movis-glass-card max-w-md w-full p-4 sm:p-6 min-w-0 modal-card-safe" onClick={(e) => e.stopPropagation()}>
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
          loadingSteps={chat.loadingSteps}
          suggestedItems={sortedPrompts}
          onSelectSuggested={(item) => { lastInputWasVoiceRef.current = false; handleSelect(item); }}
          onClear={chat.clear}
          onCancel={chat.cancel}
          onSendImage={(file) => { lastInputWasVoiceRef.current = false; chat.sendImage(file); }}
          onCertRegister={handleCertRegister}
          customers={customers}
          disabled={!dataReady}
          voice={voice}
          tts={tts}
        />
      </div>

      {/* 쓰기 액션 Confirm 모달 — saveOrder는 편집 가능 모달 분기, 나머지는 기존 */}
      {chat.pendingActions.length > 0 && chat.pendingActions[0].action === 'saveOrder' && (
        <OrderConfirmEditable
          pending={chat.pendingActions[0]}
          executing={executing}
          customers={customers}
          products={products}
          onConfirm={handleExecuteAction}
          onCancel={handleCancelAction}
        />
      )}
      {chat.pendingActions.length > 0 && chat.pendingActions[0].action !== 'saveOrder' && (() => {
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
          revertProductPrice: { title: '가격 원복 확인', Icon: DollarSign },
          bulkUpdateProductName: { title: '제품명 일괄 변경 확인', Icon: Package },
          markOrderPaid: { title: '완불(입금) 처리 확인', Icon: Wallet },
          createReturn: { title: '반품 처리 확인', Icon: Undo2 },
        };
        const meta = titleMap[pending.action] || { title: '작업 확인', Icon: AlertTriangle };
        const Icon = meta.Icon;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => { if (!executing) handleCancelAction(pending); }}>
            <div className="movis-glass-card max-w-lg sm:max-w-xl w-full p-5 sm:p-7 min-w-0 modal-card-safe" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-5 movis-text-primary">
                <Icon className="w-6 h-6 sm:w-7 sm:h-7 text-[var(--jarvis-cyan)] flex-shrink-0" />
                <h3 className="text-xl sm:text-2xl font-bold flex-1 min-w-0">{meta.title}</h3>
                {chat.pendingActions.length > 1 && (
                  <span className="flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(0,212,255,0.15)', color: 'var(--jarvis-cyan)', border: '1px solid rgba(0,212,255,0.3)' }}>
                    확인 대기 {chat.pendingActions.length}건 · 1번째
                  </span>
                )}
              </div>
              <div className="bg-[#0f1a2d]/70 border border-cyan-400/20 rounded-xl p-4 sm:p-5 mb-5 text-base sm:text-lg whitespace-pre-line break-words leading-relaxed">
                {pending.preview}
              </div>
              {pending.warnings.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-400/25 rounded-xl p-4 mb-5">
                  {pending.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-amber-300 break-words leading-relaxed">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-xs sm:text-sm text-[var(--jarvis-text-muted)] mb-5 break-words leading-snug">
                💡 [실행] 누르면 Supabase에 즉시 저장됩니다. 잘못된 경우 관리자 페이지에서 수정/삭제 가능합니다.
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleExecuteAction(pending)}
                  disabled={executing}
                  className="flex-1 flex items-center justify-center gap-2 py-3 sm:py-3.5 rounded-xl bg-[var(--jarvis-cyan)] text-[#050b18] font-bold text-base sm:text-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <Check className="w-5 h-5" />
                  {executing ? '실행 중...' : '✅ 실행'}
                </button>
                {chat.pendingActions.length > 1 && (
                  <button
                    onClick={() => chat.resolvePendingAction(pending.id)}
                    disabled={executing}
                    className="px-4 py-3 sm:py-3.5 rounded-xl border border-cyan-400/25 text-sm sm:text-base font-medium hover:bg-cyan-500/10 active:scale-[0.98] transition-all disabled:opacity-50 whitespace-nowrap"
                    title="이 건만 건너뛰고 다음 건으로"
                  >
                    건너뛰기
                  </button>
                )}
                <button
                  onClick={() => handleCancelAction(pending)}
                  disabled={executing}
                  className="px-5 py-3 sm:py-3.5 rounded-xl border border-cyan-400/25 text-base sm:text-lg font-medium hover:bg-cyan-500/10 active:scale-[0.98] transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  {chat.pendingActions.length > 1 ? '전체 취소' : '취소'}
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
