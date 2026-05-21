import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Trash2, Loader2, X } from 'lucide-react';
import MessageBubble from './MessageBubble';
import SuggestedQuestions from './SuggestedQuestions';
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
}) {
  const [text, setText] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

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
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-[var(--border)] flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-5 h-5 text-[var(--primary)] flex-shrink-0" />
          <span className="font-semibold text-sm break-keep">분석 어시스턴트</span>
        </div>
        {hasMessages && onClear && (
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-white hover:bg-[var(--destructive)] border border-[var(--border)] hover:border-[var(--destructive)] px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
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
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-4 py-3"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {!hasMessages ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-8">
            <div className="w-16 h-16 rounded-full bg-[var(--accent)] flex items-center justify-center mb-3">
              <Sparkles className="w-8 h-8 text-[var(--primary)]" />
            </div>
            <h3 className="text-base font-bold mb-1">무엇이 궁금하세요?</h3>
            <p className="text-xs text-[var(--muted-foreground)] mb-6 max-w-xs break-keep leading-snug">
              자연어로 거래처/제품/매출/VIP 분석을 물어보세요.
              <br />예: "이번 달 매출 1위 누구야?"
            </p>
            <div className="w-full max-w-2xl">
              <SuggestedQuestions items={suggestedItems} onSelect={handleSelect} />
            </div>
          </div>
        ) : (
          <>
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {isLoading && (
              <div className="flex justify-start my-2">
                <div className="bg-[var(--accent)] rounded-2xl px-4 py-2.5 flex items-center gap-2 max-w-[88%] sm:max-w-[78%]">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)] flex-shrink-0" />
                  <span className="text-sm text-[var(--muted-foreground)] break-keep">
                    {loadingStep || '🤖 AI가 응답 중...'}
                  </span>
                  {onCancel && (
                    <button
                      type="button"
                      onClick={onCancel}
                      className="ml-1 p-0.5 rounded hover:bg-black/10 flex-shrink-0"
                      aria-label="취소"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
            {/* 메시지 있을 때도 하단에 작은 추천 질문 */}
            {!isLoading && suggestedItems.length > 0 && (
              <div className="mt-4">
                <SuggestedQuestions items={suggestedItems.slice(0, 6)} onSelect={handleSelect} title="💡 다른 질문" />
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* 입력 영역 (sticky bottom) */}
      <div className="border-t border-[var(--border)] p-2 sm:p-3 flex-shrink-0 bg-white">
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0 relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_INPUT))}
              onKeyDown={handleKeyDown}
              placeholder={disabled ? '데이터 로딩 중...' : '질문을 입력하세요 (Enter=전송, Shift+Enter=줄바꿈)'}
              disabled={disabled}
              rows={1}
              className="w-full resize-none px-3 py-2.5 pr-14 rounded-xl border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm break-keep leading-snug min-h-[44px] max-h-32"
              style={{ overflow: 'auto' }}
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
            className="flex-shrink-0 w-11 h-11 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
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
