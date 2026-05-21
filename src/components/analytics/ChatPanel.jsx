import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Trash2, Loader2, X } from 'lucide-react';
import MessageBubble from './MessageBubble';
import SuggestedQuestions from './SuggestedQuestions';
import VoiceButton from './VoiceButton';
import JarvisStandby from './JarvisStandby';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

const MAX_INPUT = 1000;

export default function ChatPanel({
  messages = [],
  onSend,
  isLoading,
  loadingStep,
  suggestedItems = [],
  onSelectSuggested,
  onClear,
  onCancel,
  disabled,
  voice, // useVoiceInput 훅 결과 { isListening, interim, supported, permissionDenied, start, stop, error }
  tts,   // useTextToSpeech 훅 결과 { speak, cancel, supported, isSpeaking, ... }
}) {
  const [text, setText] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  // 음성 인식 interim → textarea 실시간 반영
  useEffect(() => {
    if (voice?.isListening && voice?.interim) {
      setText(voice.interim);
    }
  }, [voice?.interim, voice?.isListening]);

  // 새 메시지 추가 시 자동 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
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
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-4 py-3 relative z-10"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {!hasMessages ? (
          <div className="min-h-full flex flex-col items-center justify-start text-center py-6 relative">
            {/* 자비스 영화 스타일 스탠바이 화면 — 상태 반응형 */}
            <JarvisStandby
              voiceListening={voice?.isListening}
              isLoading={isLoading}
              ttsEnabled={false}
              ttsSpeaking={false}
              sfxMuted={false}
            />

            {/* 추천 질문 */}
            <div className="w-full max-w-3xl px-4 mt-4 min-w-0">
              <SuggestedQuestions items={suggestedItems} onSelect={handleSelect} />
              {voice?.supported && (
                <p className="text-[11px] mt-4 font-mono tracking-wider" style={{ color: 'var(--jarvis-text-muted)' }}>
                  🎤 음성 입력: <span style={{ color: 'var(--jarvis-cyan)' }}>Spacebar 길게</span> 누르거나 아래 마이크 버튼 클릭
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} tts={tts} />
            ))}
            {isLoading && (
              <div className="flex justify-start my-2 animate-jarvis-card-emerge">
                <div className="movis-glass-card rounded-2xl px-4 py-2 flex items-center gap-3 max-w-[92%] sm:max-w-[78%] min-w-0" style={{
                  boxShadow: '0 8px 24px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.05)',
                  border: '1px solid rgba(0, 212, 255, 0.22)',
                }}>
                  {/* 회전 데이터 입자 */}
                  <div className="relative w-5 h-5 flex-shrink-0">
                    <svg className="absolute inset-0 animate-jarvis-arc-spin" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(0,212,255,0.8)" strokeWidth="2" strokeDasharray="4 4" />
                    </svg>
                    <svg className="absolute inset-0 animate-jarvis-arc-spin-rev" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="6" fill="none" stroke="rgba(77,255,255,0.7)" strokeWidth="1.5" strokeDasharray="2 3" />
                    </svg>
                    <div className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full animate-jarvis-glow-pulse" style={{
                      background: '#4dffff',
                      boxShadow: '0 0 6px rgba(0,212,255,0.65)',
                    }} />
                  </div>
                  <span className="text-sm break-words font-mono font-medium min-w-0" style={{ color: 'var(--jarvis-cyan)' }}>
                    {loadingStep || '⚡ 분석 중...'}
                  </span>
                  {/* 진동 막대 */}
                  <span className="inline-flex items-center gap-0.5 ml-1">
                    <span className="w-0.5 h-2 rounded-full animate-bounce" style={{ background: '#00d4ff', animationDelay: '0ms' }} />
                    <span className="w-0.5 h-3 rounded-full animate-bounce" style={{ background: '#4dffff', animationDelay: '120ms' }} />
                    <span className="w-0.5 h-2 rounded-full animate-bounce" style={{ background: '#00d4ff', animationDelay: '240ms' }} />
                  </span>
                  {onCancel && (
                    <button
                      type="button"
                      onClick={onCancel}
                      className="ml-1 p-0.5 rounded hover:bg-cyan-500/20 flex-shrink-0 transition-colors"
                      aria-label="취소"
                      style={{ color: 'var(--jarvis-text-muted)' }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

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
        <div className="flex items-end gap-2">
          {voice && (
            <VoiceButton
              isListening={voice.isListening}
              supported={voice.supported}
              permissionDenied={voice.permissionDenied}
              interim={voice.interim}
              onStart={voice.start}
              onStop={voice.stop}
              size="md"
            />
          )}
          <div className="flex-1 min-w-0 relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_INPUT))}
              onKeyDown={handleKeyDown}
              placeholder={disabled ? '데이터 로딩 중...' : voice?.supported ? '질문 입력 또는 🎤 음성 (Spacebar 길게)' : '질문을 입력하세요 (Enter=전송)'}
              disabled={disabled}
              rows={1}
              className="w-full resize-none px-3 py-2.5 pr-14 rounded-xl text-sm break-keep leading-snug min-h-[44px] max-h-32 transition-all focus:outline-none"
              style={{
                overflow: 'auto',
                background: voice?.isListening ? 'rgba(0, 212, 255, 0.08)' : 'rgba(15, 26, 45, 0.65)',
                color: 'var(--jarvis-text-primary)',
                border: voice?.isListening ? '1px solid rgba(0, 212, 255, 0.25)' : '1px solid rgba(0, 212, 255, 0.22)',
                boxShadow: voice?.isListening ? '0 0 14px rgba(0,212,255,0.22), inset 0 0 10px rgba(0,212,255,0.06)' : 'inset 0 0 8px rgba(0,212,255,0.04)',
              }}
            />
            <span className="absolute bottom-1.5 right-2 text-[10px] text-[var(--muted-foreground)] pointer-events-none tabular-nums">
              {text.length}/{MAX_INPUT}
            </span>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || isLoading || disabled}
            aria-label="전송"
            className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
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
