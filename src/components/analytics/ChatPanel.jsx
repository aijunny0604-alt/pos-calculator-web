import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Trash2, Loader2, X, Star, Paperclip } from 'lucide-react';
import MessageBubble from './MessageBubble';
import SuggestedQuestions from './SuggestedQuestions';
import VoiceButton from './VoiceButton';
import JarvisStandby from './JarvisStandby';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getPinnedQueries, togglePin } from './MessageActions';

// 작은 양자 코어 (3중 회전 + 펄스) — 현재 진행 중 단계 표시용
function QuantumCore() {
  return (
    <div className="relative w-4 h-4 flex-shrink-0">
      <svg className="absolute inset-0 animate-jarvis-arc-spin" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="9" fill="none" stroke="rgba(0,212,255,0.6)" strokeWidth="1.4" strokeDasharray="2 3" />
      </svg>
      <svg className="absolute inset-0 animate-jarvis-arc-spin-rev" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="5" fill="none" stroke="rgba(77,255,255,0.75)" strokeWidth="1.2" strokeDasharray="1.5 2.5" />
      </svg>
      <div className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full animate-jarvis-glow-pulse"
        style={{ background: 'radial-gradient(circle, #ffffff 0%, #4dffff 40%, #00d4ff 100%)', boxShadow: '0 0 6px rgba(0,212,255,0.85)' }} />
    </div>
  );
}

// MOVIS 추론 과정 — Claude/GPT식 단계 누적 트레이스. 진행=양자코어+펄스, 완료=✓ 흐림.
function ThinkingChip({ step, steps = [], onCancel }) {
  const list = steps.length > 0 ? steps : [{ id: 'fallback', label: step || '분석 중', status: 'active' }];
  return (
    <div className="flex justify-start my-2 animate-jarvis-card-emerge">
      <div
        className="movis-glass-card rounded-2xl px-3 py-2.5 max-w-full min-w-0 relative w-full sm:w-auto sm:min-w-[260px]"
        style={{
          boxShadow: '0 4px 14px rgba(0,0,0,0.32), 0 0 14px rgba(0,212,255,0.10)',
          border: '1px solid rgba(0, 212, 255, 0.26)',
          background: 'rgba(8,16,30,0.74)',
        }}
      >
        {/* 헤더: 추론중 + 취소 */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[11px] font-bold tracking-wider uppercase font-mono inline-flex items-center gap-1.5"
            style={{ color: 'var(--jarvis-cyan)', textShadow: '0 0 4px rgba(0,212,255,0.35)' }}>
            <Sparkles className="w-3 h-3" /> MOVIS 추론 중
          </span>
          {onCancel && (
            <button type="button" onClick={onCancel}
              className="p-0.5 rounded-full hover:bg-cyan-500/20 flex-shrink-0 transition-colors"
              aria-label="취소" style={{ color: 'var(--jarvis-text-muted)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {/* 단계 트레이스 */}
        <div className="flex flex-col gap-1">
          {list.map((s) => {
            const done = s.status === 'done';
            return (
              <div key={s.id} className="flex items-center gap-2 animate-jarvis-card-emerge">
                {done ? (
                  <span className="w-4 h-4 flex-shrink-0 inline-flex items-center justify-center rounded-full"
                    style={{ background: 'rgba(34,197,94,0.18)', color: '#22c55e' }}>
                    <svg viewBox="0 0 12 12" className="w-2.5 h-2.5"><path d="M2 6l2.5 2.5L10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                ) : (
                  <QuantumCore />
                )}
                <span className={`text-xs sm:text-sm font-mono truncate ${done ? '' : 'font-medium'}`}
                  style={{
                    color: done ? 'var(--jarvis-text-muted)' : 'var(--jarvis-cyan)',
                    textShadow: done ? 'none' : '0 0 4px rgba(0,212,255,0.35)',
                    maxWidth: 'min(62vw, 360px)',
                    opacity: done ? 0.6 : 1,
                  }}
                  title={s.label}>
                  {s.label}
                </span>
                {!done && (
                  <span className="inline-flex items-end gap-0.5 flex-shrink-0 ml-0.5">
                    <span className="w-0.5 h-2 rounded-full animate-bounce" style={{ background: '#00d4ff', animationDelay: '0ms', animationDuration: '0.9s' }} />
                    <span className="w-0.5 h-3 rounded-full animate-bounce" style={{ background: '#4dffff', animationDelay: '120ms', animationDuration: '0.9s' }} />
                    <span className="w-0.5 h-2 rounded-full animate-bounce" style={{ background: '#a855f7', animationDelay: '240ms', animationDuration: '0.9s' }} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// 좌/우 사이드 추천 질문 칩 (가로 배치)
function SideChip({ item, onSelect, align = 'left' }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      className={`group flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm transition-all break-keep leading-snug min-w-0 movis-glass-card ${align === 'right' ? 'flex-row-reverse text-right' : 'text-left'}`}
      style={{ borderRadius: 12 }}
    >
      {Icon && (
        <Icon
          className="w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-110"
          style={{ color: 'var(--jarvis-cyan)' }}
        />
      )}
      <span className="flex-1 min-w-0" style={{ color: 'var(--jarvis-text-primary)' }}>{item.label}</span>
      {item.count > 0 && (
        <span className="text-[10px] flex-shrink-0 font-mono" style={{ color: 'var(--jarvis-accent)' }}>
          ×{item.count}
        </span>
      )}
    </button>
  );
}

const MAX_INPUT = 1000;

export default function ChatPanel({
  messages = [],
  onSend,
  isLoading,
  loadingStep,
  loadingSteps = [],
  suggestedItems = [],
  onSelectSuggested,
  onClear,
  onCancel,
  onSendImage,   // (file) => void — 사업자등록증 이미지 첨부 → vision 인식
  onCertRegister, // ({mode,customerId,data,dataUrl}) => Promise<{ok,name}>
  customers = [],
  disabled,
  voice, // useVoiceInput 훅 결과 { isListening, interim, supported, permissionDenied, start, stop, error }
  tts,   // useTextToSpeech 훅 결과 { speak, cancel, supported, isSpeaking, ... }
}) {
  const [text, setText] = useState('');
  const imageInputRef = useRef(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [pinnedQueries, setPinnedQueries] = useState([]);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  // 즐겨찾기 동기화 (localStorage 갱신 감지)
  useEffect(() => {
    setPinnedQueries(getPinnedQueries());
    const onStorage = () => setPinnedQueries(getPinnedQueries());
    window.addEventListener('storage', onStorage);
    // 메시지 변경 시 (즐겨찾기 토글 후) 재로드
    return () => window.removeEventListener('storage', onStorage);
  }, [messages.length]);

  // 음성 인식 interim → textarea 실시간 반영
  useEffect(() => {
    if (voice?.isListening && voice?.interim) {
      setText(voice.interim);
    }
  }, [voice?.interim, voice?.isListening]);

  // 새 메시지 추가 시 자동 스크롤
  // 🚨 scrollIntoView 금지 (2026-07-21): 스크롤 가능한 '조상 전부'를 함께 스크롤해서
  //    모바일에서 MOVIS 진입만 해도 페이지 전체가 위로 딸려 올라간다(화면이 계속 튐).
  //    + deps의 loadingStep이 생각중 애니메이션마다 바뀌어 반복 실행되던 것도 원인.
  //    → 채팅 컨테이너만 직접 스크롤하고, 빈 대화/사용자가 위 기록 읽는 중엔 건드리지 않는다.
  const stickToBottomRef = useRef(true);
  const handleChatScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // 하단 80px 이내면 "따라가기" 유지, 위로 올려 읽는 중이면 해제
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || messages.length === 0) return;   // 진입 직후 빈 대화면 스크롤 안 함
    if (!stickToBottomRef.current) return;      // 위 기록 읽는 중이면 끌어내리지 않음
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isLoading, loadingStep]);

  const submit = () => {
    const value = text.trim();
    if (!value || isLoading || disabled) return;
    onSend?.(value);
    setText('');
    // 모바일에서 키보드 유지하려면 focus 유지
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const handleSelect = (item) => {
    if (disabled || isLoading) return;
    if (onSelectSuggested) {
      onSelectSuggested(item);
    } else {
      onSend?.(item.label, { promptId: item.id });
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3 px-3 sm:px-4 py-2 flex-shrink-0 movis-glass-panel" style={{
        background: 'rgba(8, 16, 30, 0.5)',
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
        borderBottom: '1px solid rgba(0, 212, 255, 0.18)',
        backdropFilter: 'blur(10px)',
      }}>
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--jarvis-accent)', filter: 'drop-shadow(0 0 4px rgba(0,212,255,0.45))' }} />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-widest truncate" style={{ color: 'var(--jarvis-text-muted)' }}>NEURAL CHANNEL</span>
        </div>
        {hasMessages && onClear && (
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-2 text-xs text-[var(--jarvis-text-muted)] hover:text-[var(--jarvis-text-primary)] hover:bg-red-500/15 border border-cyan-400/20 hover:border-cyan-400/25 px-3 py-2 rounded-lg transition-colors flex-shrink-0 font-semibold"
            aria-label="대화 지우기"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>대화 지우기</span>
          </button>
        )}
      </div>

      {/* 메시지 영역 */}
      <div
        ref={scrollRef}
        onScroll={handleChatScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-4 py-3 relative z-10"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {!hasMessages ? (
          <div className="min-h-full flex flex-col items-center justify-start py-6 relative">
            {/* 데스크탑: 좌 7질문 | sphere | 우 7질문 (3컬럼) / 모바일: sphere 위 + 통합 칩 아래 */}
            <div className="w-full max-w-[1600px] grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 lg:gap-6 items-center px-4">
              {/* 좌측 추천 질문 (데스크탑만) */}
              <div className="hidden lg:flex flex-col gap-2 justify-center max-w-xs ml-auto min-w-0">
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1 text-right" style={{ color: 'var(--jarvis-text-muted)' }}>
                  ◂ ANALYTICS QUERIES
                </div>
                {suggestedItems.filter((p) => p.side === 'left' || !p.side).slice(0, 7).map((item) => (
                  <SideChip key={item.id} item={item} onSelect={handleSelect} align="right" />
                ))}
              </div>

              {/* 중앙: 자비스 스탠바이 */}
              <div className="flex flex-col items-center text-center min-w-0">
                <JarvisStandby
                  voiceListening={voice?.isListening}
                  isLoading={isLoading}
                  ttsEnabled={false}
                  ttsSpeaking={false}
                  sfxMuted={false}
                />
              </div>

              {/* 우측 추천 질문 (데스크탑만) */}
              <div className="hidden lg:flex flex-col gap-2 justify-center max-w-xs mr-auto min-w-0">
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1 text-left" style={{ color: 'var(--jarvis-text-muted)' }}>
                  OPERATIONS QUERIES ▸
                </div>
                {suggestedItems.filter((p) => p.side === 'right').slice(0, 8).map((item) => (
                  <SideChip key={item.id} item={item} onSelect={handleSelect} align="left" />
                ))}
              </div>
            </div>

            {/* 모바일/태블릿: 통합 칩 그리드 */}
            <div className="w-full max-w-3xl px-4 mt-6 lg:hidden min-w-0">
              <SuggestedQuestions items={suggestedItems} onSelect={handleSelect} />
            </div>

            {/* 음성 안내 */}
            {voice?.supported && (
              <p className="text-[11px] mt-6 font-mono tracking-wider text-center px-4" style={{ color: 'var(--jarvis-text-muted)' }}>
                🎤 음성 입력: <span style={{ color: 'var(--jarvis-cyan)' }}>Spacebar 길게</span> 누르거나 아래 마이크 버튼 클릭
              </p>
            )}
          </div>
        ) : (
          <>
            {messages.map((m, idx) => {
              // assistant 메시지인 경우 직전 user 메시지를 userQuery로 전달 (즐겨찾기 핀 용)
              const prevUser = m.role === 'assistant'
                ? [...messages.slice(0, idx)].reverse().find((x) => x.role === 'user')?.content
                : null;
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  tts={tts}
                  customers={customers}
                  onCertRegister={onCertRegister}
                  onFollowUpClick={(q) => {
                    // 사용 빈도 기록 (다음번 추천 정렬에 활용)
                    try {
                      const key = 'pos_ai_quick_prompts_usage_v1';
                      const usage = JSON.parse(localStorage.getItem(key) || '{}');
                      usage[q] = (usage[q] || 0) + 1;
                      localStorage.setItem(key, JSON.stringify(usage));
                    } catch {}
                    onSend?.(q);
                  }}
                  userQuery={prevUser}
                />
              );
            })}
            {isLoading && <ThinkingChip step={loadingStep} steps={loadingSteps} onCancel={onCancel} />}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* 즐겨찾기 핀 (입력창 위) */}
      {pinnedQueries.length > 0 && (
        <div className="flex-shrink-0 px-2 sm:px-3 py-1.5 relative z-10 flex items-center gap-1.5 overflow-x-auto" style={{
          background: 'rgba(8, 16, 30, 0.45)',
          borderTop: '1px solid rgba(0, 212, 255, 0.12)',
        }}>
          <Star className="w-3 h-3 flex-shrink-0" style={{ color: '#fbbf24', fill: '#fbbf24' }} />
          <span className="text-[10px] font-mono uppercase tracking-widest flex-shrink-0" style={{ color: 'var(--jarvis-text-muted)' }}>핀</span>
          {pinnedQueries.slice(0, 8).map((q, i) => (
            <button
              key={i}
              type="button"
              onClick={() => !isLoading && !disabled && onSend?.(q)}
              onContextMenu={(e) => {
                e.preventDefault();
                togglePin(q);
                setPinnedQueries(getPinnedQueries());
              }}
              className="text-[11px] px-2 py-1 rounded-md transition-all flex-shrink-0 hover:scale-[1.02] truncate max-w-[180px]"
              title={`${q}\n(우클릭: 핀 해제)`}
              disabled={isLoading || disabled}
              style={{
                background: 'rgba(251,191,36,0.08)',
                color: 'var(--jarvis-text-primary)',
                border: '1px solid rgba(251,191,36,0.25)',
              }}
            >
              {q.length > 22 ? q.slice(0, 20) + '...' : q}
            </button>
          ))}
        </div>
      )}

      {/* 입력 영역 (sticky bottom) */}
      <div className="p-2 sm:p-3 flex-shrink-0 relative z-10" style={{
        background: 'rgba(8, 16, 30, 0.65)',
        borderTop: '1px solid rgba(0, 212, 255, 0.2)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.32), 0 -1px 0 rgba(0, 212, 255, 0.12)',
      }}>
        {voice?.isListening && (
          <div className="mb-2 flex items-center gap-2 text-xs text-cyan-600 px-2 animate-pulse min-w-0">
            <span className="inline-flex items-center gap-0.5">
              <span className="w-1 h-3 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-4 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '120ms' }} />
              <span className="w-1 h-5 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '240ms' }} />
              <span className="w-1 h-4 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '360ms' }} />
              <span className="w-1 h-3 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '480ms' }} />
            </span>
            <span className="break-keep font-medium">듣고 있어요... (다시 클릭하거나 1.5초 침묵 시 종료)</span>
          </div>
        )}
        {voice?.error && (
          <div className="mb-2 text-xs text-[var(--destructive)] px-2 break-keep">{voice.error}</div>
        )}
        <div className="flex items-stretch gap-2">
          {/* 📎 사업자등록증 이미지 첨부 → vision 자동 인식 */}
          {onSendImage && (
            <div className="flex-shrink-0 flex items-center">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={disabled || isLoading}
                title="사진 올리기 — 사업자등록증·주문서 자동 인식"
                aria-label="이미지 첨부"
                className="w-11 h-11 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 active:scale-95"
                style={{ background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.28)', color: 'var(--jarvis-cyan)' }}
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (imageInputRef.current) imageInputRef.current.value = '';
                  if (file) onSendImage(file);
                }}
              />
            </div>
          )}
          {voice && (
            <div className="flex-shrink-0 flex items-center">
              <VoiceButton
                isListening={voice.isListening}
                supported={voice.supported}
                permissionDenied={voice.permissionDenied}
                interim={voice.interim}
                onStart={voice.start}
                onStop={voice.stop}
                size="md"
              />
            </div>
          )}
          <div className="flex-1 min-w-0 relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_INPUT))}
              onKeyDown={handleKeyDown}
              placeholder={disabled ? '데이터 로딩 중...' : voice?.supported ? '질문 입력 또는 🎤 음성 (Spacebar 길게)\n여러 줄 입력 가능 (Shift+Enter=줄바꿈, Enter=전송)' : '질문을 입력하세요 (Enter=전송, Shift+Enter=줄바꿈)'}
              disabled={disabled}
              rows={2}
              className="w-full resize-none px-3 py-3 pr-14 rounded-xl text-sm sm:text-[15px] break-keep leading-relaxed min-h-[60px] sm:min-h-[72px] max-h-48 sm:max-h-64 transition-all focus:outline-none"
              style={{
                overflow: 'auto',
                background: voice?.isListening ? 'rgba(0, 212, 255, 0.08)' : 'rgba(15, 26, 45, 0.65)',
                color: 'var(--jarvis-text-primary)',
                border: voice?.isListening ? '1px solid rgba(0, 212, 255, 0.25)' : '1px solid rgba(0, 212, 255, 0.22)',
                boxShadow: voice?.isListening ? '0 0 14px rgba(0,212,255,0.22), inset 0 0 10px rgba(0,212,255,0.06)' : 'inset 0 0 8px rgba(0,212,255,0.04)',
              }}
            />
            <span className="absolute bottom-2 right-2 text-[10px] text-[var(--muted-foreground)] pointer-events-none tabular-nums bg-[rgba(8,16,30,0.75)] px-1.5 py-0.5 rounded">
              {text.length}/{MAX_INPUT}
            </span>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || isLoading || disabled}
            aria-label="전송"
            className="flex-shrink-0 w-11 h-11 sm:w-12 sm:h-[72px] rounded-xl flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: !text.trim() || isLoading || disabled
                ? 'rgba(0, 212, 255, 0.2)'
                : 'linear-gradient(135deg, #00d4ff, #4dffff)',
              color: '#050b18',
              boxShadow: !text.trim() || isLoading || disabled ? 'none' : '0 0 12px rgba(0,212,255,0.35), 0 6px 14px rgba(0,0,0,0.36)',
            }}
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* 대화 지우기 확인 다이얼로그 */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        title="대화 내용을 모두 지울까요?"
        message={`현재 메시지 ${messages.length}개가 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.\n\n(캐시/사용 빈도/RFM 임계값은 유지됩니다 — 전체 초기화는 ⚙️ 설정에서)`}
        confirmText="🗑 지우기"
        cancelText="취소"
        destructive
        onConfirm={() => { setShowClearConfirm(false); onClear?.(); }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
