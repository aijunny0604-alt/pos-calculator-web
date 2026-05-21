import { useMemo, useState, useEffect, useRef } from 'react';
import { Menu, ArrowLeft, Sparkles, Crown, Package, Users, TrendingDown, BarChart3, RefreshCw, Settings, X, Check, AlertTriangle, Trash2, Volume2, VolumeX } from 'lucide-react';
import ChatPanel from '@/components/analytics/ChatPanel';
import JarvisHeader from '@/components/analytics/JarvisHeader';
import QuantumSpaceField from '@/components/analytics/QuantumSpaceField';
import BigBangIntro from '@/components/analytics/BigBangIntro';
import useAIAnalystChat from '@/hooks/useAIAnalystChat';
import useVoiceInput from '@/hooks/useVoiceInput';
import useTextToSpeech from '@/hooks/useTextToSpeech';
import { hasGroqKey, saveGroqKey, getGroqKey, getProviderPreference, setProviderPreference } from '@/lib/aiAnalyst';
import { sfxMicOn, sfxMicOff, sfxMessageArrive, sfxAnswerComplete, sfxError, isMuted, setMuted, unlockAudio } from '@/lib/jarvisSound';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { supabase } from '@/lib/supabase';

// 기본 추천 질문 (MVP 5개 + 옵션 추가 가능)
const DEFAULT_PROMPTS = [
  { id: 'topRevenue', label: '이번 달 매출 TOP 5', icon: Crown },
  { id: 'vipSegments', label: 'VIP 세그먼트 분석', icon: Users },
  { id: 'topProducts', label: '인기 제품 TOP 10', icon: Package },
  { id: 'reactivate', label: '재주문 유도 추천 액션', icon: RefreshCw },
  { id: 'dormant', label: '휴면 거래처 알려줘', icon: TrendingDown },
  { id: 'summary', label: '이번 달 전체 요약', icon: BarChart3 },
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
}) {
  // payment_records / payment_history / customer_returns 는 AIAnalytics 진입 시 lazy load (App state 미보유)
  const [paymentRecords, setPaymentRecords] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [customerReturns, setCustomerReturns] = useState([]);
  const [loadingExtra, setLoadingExtra] = useState(true);

  // 빅뱅 진입 애니메이션 — 페이지 진입할 때마다 재생 (다른 페이지 갔다 오면 다시 보임)
  const [introDone, setIntroDone] = useState(false);
  const handleIntroDone = () => setIntroDone(true);

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
    chat.addSystemMessage(`↩️ "${pending.params.name}" ${pending.action === 'addProduct' ? '제품' : '거래처'} 등록 취소됨`);
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
        <span className="hidden sm:inline px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider" style={{
          background: 'rgba(0, 255, 136, 0.15)',
          color: 'var(--jarvis-success)',
          border: '1px solid rgba(0, 255, 136, 0.4)',
          boxShadow: '0 0 8px rgba(0,255,136,0.3)',
        }} title="Groq 폴백 활성화됨">
          ⚡ GROQ
        </span>
      )}
      <button
        type="button"
        onClick={() => { unlockAudio(); toggleSfx(); }}
        className="p-1.5 rounded hover:bg-cyan-500/10 transition-colors"
        title={sfxMuted ? '효과음 켜기' : '효과음 끄기'}
        aria-label={sfxMuted ? '효과음 켜기' : '효과음 끄기'}
      >
        {sfxMuted
          ? <VolumeX className="w-4 h-4" style={{ color: 'var(--jarvis-text-muted)' }} />
          : <Volume2 className="w-4 h-4" style={{ color: 'var(--jarvis-cyan)', filter: 'drop-shadow(0 0 4px rgba(0,212,255,0.6))' }} />}
      </button>
      {tts.supported && (
        <button
          type="button"
          onClick={() => tts.setEnabled(!tts.enabled)}
          className="p-1.5 rounded hover:bg-cyan-500/10 transition-colors"
          title={tts.enabled ? 'AI 답변 자동 음성 ON' : 'AI 답변 자동 음성 OFF (음성 입력 시는 항상 재생)'}
          aria-label="TTS 토글"
          style={{ color: tts.enabled ? 'var(--jarvis-cyan)' : 'var(--jarvis-text-muted)' }}
        >
          <span className="text-xs font-bold">{tts.enabled ? '🔊' : '🔇'}</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => setShowSettings(true)}
        className="p-1.5 rounded hover:bg-cyan-500/10 transition-colors"
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
      className="flex flex-col h-full overflow-hidden relative bg-white"
      style={{ perspective: 'var(--jarvis-perspective)' }}
    >
      {/* 빅뱅 진입 애니메이션 (매 진입 시 재생) */}
      {!introDone && <BigBangIntro onComplete={handleIntroDone} />}

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowSettings(false)}>
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Settings className="w-5 h-5" />
                AI 설정
              </h3>
              <button onClick={() => setShowSettings(false)} className="p-1 rounded hover:bg-[var(--accent)]" aria-label="닫기">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Groq API 키 */}
            <div className="mb-5">
              <label className="block text-sm font-semibold mb-1.5">⚡ Groq API 키 (폴백용)</label>
              <p className="text-xs text-[var(--muted-foreground)] mb-2 break-keep leading-snug">
                Gemini 한도 초과 시 자동 사용. 무료 발급:{' '}
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] underline">
                  console.groq.com/keys
                </a>
              </p>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="gsk_..."
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm font-mono"
                autoComplete="off"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleSaveKey}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-semibold hover:opacity-90"
                >
                  <Check className="w-4 h-4" />
                  저장
                </button>
                {groqEnabled && (
                  <button
                    onClick={() => { saveGroqKey(''); setKeyInput(''); setGroqEnabled(false); }}
                    className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--accent)]"
                  >
                    삭제
                  </button>
                )}
              </div>
              {groqEnabled && <p className="text-xs text-[var(--success)] mt-1.5">✓ Groq 키 설정됨</p>}
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
                  <label key={opt.v} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${
                    provider === opt.v ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--border)]'
                  } ${opt.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--accent)]'}`}>
                    <input
                      type="radio"
                      name="aiProvider"
                      value={opt.v}
                      checked={provider === opt.v}
                      disabled={opt.disabled}
                      onChange={(e) => handleProviderChange(e.target.value)}
                      className="flex-shrink-0"
                    />
                    <span className="break-keep">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 데이터 관리 섹션 */}
            <div className="border-t border-[var(--border)] pt-3 mb-3">
              <label className="block text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" />
                데이터 관리
              </label>
              <div className="space-y-1.5">
                <button
                  onClick={() => { chat.clear(); showToast?.('대화 히스토리 삭제됨', 'success'); setShowSettings(false); }}
                  className="w-full text-left px-3 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--accent)] text-sm flex items-center justify-between"
                >
                  <span>💬 대화 히스토리만 지우기</span>
                  <span className="text-[10px] text-[var(--muted-foreground)]">{chat.messages.length}개</span>
                </button>
                <button
                  onClick={() => { chat.clearCache(); showToast?.('답변 캐시 비움', 'success'); setShowSettings(false); }}
                  className="w-full text-left px-3 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--accent)] text-sm"
                >
                  📋 답변 캐시 비우기 (5분 TTL)
                </button>
                <button
                  onClick={() => setShowResetConfirm(true)}
                  className="w-full text-left px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-[var(--destructive)] hover:bg-red-100 text-sm font-semibold flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  🗑️ 전체 AI 데이터 초기화
                </button>
              </div>
              <div className="text-[10px] text-[var(--muted-foreground)] mt-1.5 break-keep leading-snug">
                ⚠️ 전체 초기화: 대화 + 캐시 + 사용 빈도 + RFM 임계값 + 인사이트 모두 삭제 (Groq 키와 프로바이더 선택은 유지)
              </div>
            </div>

            <div className="text-[11px] text-[var(--muted-foreground)] border-t border-[var(--border)] pt-3 break-keep leading-snug">
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
          borderBottom: '1px solid rgba(255, 170, 0, 0.3)',
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
        const isProduct = pending.action === 'addProduct';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                {isProduct ? <Package className="w-5 h-5 text-[var(--primary)]" /> : <Users className="w-5 h-5 text-[var(--primary)]" />}
                <h3 className="text-lg font-bold">{isProduct ? '제품 등록 확인' : '거래처 등록 확인'}</h3>
              </div>
              <div className="bg-[var(--accent)] rounded-lg p-3 mb-3 text-sm whitespace-pre-line break-keep leading-relaxed">
                {pending.preview}
              </div>
              {pending.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3">
                  {pending.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-amber-800 break-keep">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[11px] text-[var(--muted-foreground)] mb-4 break-keep leading-snug">
                💡 [실행] 누르면 Supabase에 즉시 저장됩니다. 잘못된 경우 관리자 페이지에서 수정/삭제 가능합니다.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleExecuteAction(pending)}
                  disabled={executing}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {executing ? '실행 중...' : '✅ 실행'}
                </button>
                <button
                  onClick={() => handleCancelAction(pending)}
                  disabled={executing}
                  className="px-4 py-2.5 rounded-lg border border-[var(--border)] hover:bg-[var(--accent)] disabled:opacity-50"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
