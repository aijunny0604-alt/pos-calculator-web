import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Trash2, Loader2, X } from 'lucide-react';
import MessageBubble from './MessageBubble';
import SuggestedQuestions from './SuggestedQuestions';
import VoiceButton from './VoiceButton';
import JarvisStandby from './JarvisStandby';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

// MOVIS "생각중" 칩 — 양자 코어 + 데이터 스트림 + 멀티라인 도구명
function ThinkingChip({ step, onCancel }) {
  return (
    <div className="flex justify-start my-2 animate-jarvis-card-emerge">
      <div
        className="movis-glass-card rounded-2xl px-4 py-3 flex items-start gap-3 max-w-[95%] sm:max-w-[85%] min-w-0 relative overflow-hidden"
        style={{
          boxShadow: '0 8px 28px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 24px rgba(0,212,255,0.10)',
          border: '1px solid rgba(0, 212, 255, 0.28)',
          background: 'linear-gradient(135deg, rgba(8,16,30,0.72) 0%, rgba(15,26,45,0.78) 100%)',
        }}
      >
        {/* 좌측 스캔라인 (위 → 아래 흐르는 데이터 빛) */}
        <span
          className="absolute left-0 top-0 bottom-0 w-[2px] pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, #4dffff 50%, transparent 100%)',
            animation: 'jarvis-data-stream 1.6s ease-in-out infinite',
          }}
        />

        {/* 양자 코어 (3중 회전 + 펄스) */}
        <div className="relative w-9 h-9 flex-shrink-0 mt-0.5">
          {/* 외곽 ring */}
          <svg className="absolute inset-0 animate-jarvis-arc-spin" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(0,212,255,0.55)" strokeWidth="1.5" strokeDasharray="3 5" />
          </svg>
          {/* 중간 ring (역회전) */}
          <svg className="absolute inset-0 animate-jarvis-arc-spin-rev" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="11" fill="none" stroke="rgba(77,255,255,0.7)" strokeWidth="1.5" strokeDasharray="2 4" />
          </svg>
          {/* 내부 ring */}
          <svg className="absolute inset-0 animate-jarvis-arc-spin" style={{ animationDuration: '3s' }} viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="6" fill="none" stroke="rgba(168,85,247,0.55)" strokeWidth="1" strokeDasharray="1 2" />
          </svg>
          {/* 펄스 코어 */}
          <div
            className="absolute inset-0 m-auto w-2.5 h-2.5 rounded-full animate-jarvis-glow-pulse"
            style={{
              background: 'radial-gradient(circle, #ffffff 0%, #4dffff 40%, #00d4ff 100%)',
              boxShadow: '0 0 10px rgba(0,212,255,0.85), 0 0 18px rgba(77,255,255,0.5)',
            }}
          />
          {/* 위성 입자 4개 (회전 궤도) */}
          <div className="absolute inset-0 animate-jarvis-arc-spin" style={{ animationDuration: '2.4s' }}>
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ background: '#4dffff', boxShadow: '0 0 4px rgba(77,255,255,0.9)' }} />
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ background: '#a855f7', boxShadow: '0 0 4px rgba(168,85,247,0.8)' }} />
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full" style={{ background: '#00d4ff', boxShadow: '0 0 4px rgba(0,212,255,0.9)' }} />
            <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full" style={{ background: '#ffffff', boxShadow: '0 0 4px rgba(255,255,255,0.7)' }} />
          </div>
        </div>

        {/* 텍스트 영역 (줄바꿈 허용 + truncate 제거) */}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5 py-0.5">
          {/* 상단 라벨 */}
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--jarvis-text-muted)' }}>
            <span className="inline-block w-1 h-1 rounded-full animate-pulse" style={{ background: '#00ff88', boxShadow: '0 0 4px #00ff88' }} />
            <span>MOVIS · NEURAL PROCESSING</span>
          </div>
          {/* 실제 진행 단계 (멀티라인 + word-break) */}
          <div
            className="text-sm font-medium leading-snug"
            style={{
              color: 'var(--jarvis-cyan)',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              textShadow: '0 0 6px rgba(0,212,255,0.35)',
            }}
          >
            {step || '⚡ 분석 중...'}
          </div>
          {/* 진동 막대 (5개로 확장) */}
          <span className="inline-flex items-end gap-0.5 mt-0.5">
            <span className="w-0.5 h-2 rounded-full animate-bounce" style={{ background: '#00d4ff', animationDelay: '0ms', animationDuration: '0.9s' }} />
            <span className="w-0.5 h-3 rounded-full animate-bounce" style={{ background: '#4dffff', animationDelay: '120ms', animationDuration: '0.9s' }} />
            <span className="w-0.5 h-4 rounded-full animate-bounce" style={{ background: '#a855f7', animationDelay: '240ms', animationDuration: '0.9s' }} />
            <span className="w-0.5 h-3 rounded-full animate-bounce" style={{ background: '#4dffff', animationDelay: '360ms', animationDuration: '0.9s' }} />
            <span className="w-0.5 h-2 rounded-full animate-bounce" style={{ background: '#00d4ff', animationDelay: '480ms', animationDuration: '0.9s' }} />
          </span>
        </div>

        {/* 취소 버튼 */}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="ml-1 p-1.5 rounded-lg hover:bg-cyan-500/20 flex-shrink-0 transition-colors mt-0.5"
            aria-label="취소"
            style={{ color: 'var(--jarvis-text-muted)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
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
                {suggestedItems.filter((p) => p.side === 'right').slice(0, 7).map((item) => (
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
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} tts={tts} />
            ))}
            {isLoading && <ThinkingChip step={loadingStep} onCancel={onCancel} />}
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
