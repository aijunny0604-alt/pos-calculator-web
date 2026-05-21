import { useState } from 'react';
import { Sparkles, AlertCircle, ChevronDown, ChevronUp, Volume2, Square } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import useTypewriter from '@/hooks/useTypewriter';
import ResultRenderer from './ResultRenderer';

// 간단 마크다운 → HTML 파서 (의존성 없이 최소 처리)
function renderInline(text) {
  if (!text) return '';
  // **bold** 처리
  return text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function MarkdownLite({ content }) {
  if (!content) return null;
  const lines = content.split(/\r?\n/);
  const blocks = [];
  let listBuffer = [];
  let key = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={`ul_${key++}`} className="list-disc pl-5 my-1 space-y-0.5">
        {listBuffer.map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
        ))}
      </ul>
    );
    listBuffer = [];
  };

  for (const raw of lines) {
    const line = raw;
    if (/^\s*[-*]\s+/.test(line)) {
      listBuffer.push(line.replace(/^\s*[-*]\s+/, ''));
      continue;
    }
    flushList();
    const trimmed = line.trim();
    if (!trimmed) {
      blocks.push(<div key={`sp_${key++}`} className="h-2" />);
      continue;
    }
    if (/^##\s+/.test(trimmed)) {
      blocks.push(
        <h3 key={`h_${key++}`} className="text-sm font-bold mt-2 mb-1"
            dangerouslySetInnerHTML={{ __html: renderInline(trimmed.replace(/^##\s+/, '')) }} />
      );
      continue;
    }
    if (/^#\s+/.test(trimmed)) {
      blocks.push(
        <h3 key={`h_${key++}`} className="text-base font-bold mt-2 mb-1"
            dangerouslySetInnerHTML={{ __html: renderInline(trimmed.replace(/^#\s+/, '')) }} />
      );
      continue;
    }
    blocks.push(
      <p key={`p_${key++}`} className="my-0.5"
         dangerouslySetInnerHTML={{ __html: renderInline(trimmed) }} />
    );
  }
  flushList();
  return <div className="leading-relaxed break-keep">{blocks}</div>;
}

export default function MessageBubble({ message, enableTypewriter = true, tts }) {
  const [showTools, setShowTools] = useState(false);
  if (!message) return null;
  const { role, content, ts, toolCalls, cached } = message;

  // assistant 메시지에만 타이프라이터 효과 (캐시된 답변은 즉시)
  const isAssistant = role === 'assistant';
  const shouldType = isAssistant && enableTypewriter && !cached;
  const { displayed, done } = useTypewriter(content, {
    speed: 18,
    enabled: shouldType,
  });
  const displayedContent = shouldType ? displayed : content;

  // system 메시지 — 가운데 작은 회색
  if (role === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[11px] px-3 py-1 rounded-full" style={{
          color: 'var(--jarvis-text-muted)',
          background: 'rgba(0, 212, 255, 0.08)',
          border: '1px solid rgba(0, 212, 255, 0.2)',
        }}>
          {content}
        </span>
      </div>
    );
  }

  const isUser = role === 'user';
  const isError = role === 'error';
  const hasCharts = !isUser && !isError && Array.isArray(toolCalls) && toolCalls.length > 0;

  // JARVIS 글래스 스타일
  const bubbleStyle = isUser
    ? {
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.25), rgba(0, 212, 255, 0.12))',
        color: '#e8f4fd',
        border: '1px solid rgba(0, 212, 255, 0.5)',
        boxShadow: '0 4px 24px rgba(0, 212, 255, 0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
      }
    : isError
      ? {
          background: 'linear-gradient(135deg, rgba(255, 56, 96, 0.2), rgba(255, 56, 96, 0.08))',
          color: '#ffb4c0',
          border: '1px solid rgba(255, 56, 96, 0.5)',
          boxShadow: '0 4px 24px rgba(255, 56, 96, 0.15)',
        }
      : {
          background: 'var(--jarvis-bg-card)',
          color: 'var(--jarvis-text)',
          border: '1px solid var(--jarvis-border)',
          backdropFilter: 'blur(12px) saturate(150%)',
          WebkitBackdropFilter: 'blur(12px) saturate(150%)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45), inset 0 0 30px rgba(0, 212, 255, 0.04), inset 0 1px 0 rgba(255,255,255,0.06)',
        };
  const bubbleClass = '';

  // 차트 있는 assistant는 더 넓게 (그래야 표/차트 보기 좋음)
  const maxWidthClass = hasCharts
    ? 'max-w-full sm:max-w-[92%]'
    : 'max-w-[88%] sm:max-w-[78%]';

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} my-2 animate-jarvis-card-emerge`}>
      <div
        className={`${maxWidthClass} rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 min-w-0 group relative`}
        title={ts ? formatTime(ts) : ''}
        style={bubbleStyle}
      >
        {/* 헤더 (assistant/error 만) */}
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold opacity-80">
            {isError ? <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />}
            <span>{isError ? '오류' : 'MOVIS'}</span>
            {/* TTS 재생 버튼 (assistant 메시지만) */}
            {isAssistant && tts?.supported && (
              <button
                type="button"
                onClick={() => tts.isSpeaking ? tts.cancel() : tts.speak(content)}
                className="ml-1 p-1 rounded hover:bg-cyan-500/20 transition-colors flex-shrink-0"
                title={tts.isSpeaking ? '발화 중지' : '음성으로 듣기 (MOVIS)'}
                aria-label="음성 재생"
              >
                {tts.isSpeaking
                  ? <Square className="w-3.5 h-3.5" style={{ color: 'var(--jarvis-cyan)', fill: 'var(--jarvis-cyan)' }} />
                  : <Volume2 className="w-3.5 h-3.5" style={{ color: 'var(--jarvis-cyan)' }} />}
              </button>
            )}
            {cached && (
              <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{
                background: 'rgba(0,212,255,0.1)',
                color: 'var(--jarvis-cyan)',
                border: '1px solid rgba(0,212,255,0.3)',
              }}
                    title="5분 이내 동일 질문 캐시">
                📋 캐시
              </span>
            )}
          </div>
        )}

        {/* 본문 */}
        <div className={`text-sm ${isUser ? 'break-keep leading-snug' : ''}`}>
          {isUser ? (
            <span className="whitespace-pre-wrap">{content}</span>
          ) : (
            <>
              <MarkdownLite content={displayedContent} />
              {shouldType && !done && (
                <span className="inline-block w-2 h-4 ml-0.5 align-text-bottom animate-jarvis-cursor" style={{ background: '#00d4ff', boxShadow: '0 0 4px #00d4ff' }} />
              )}
            </>
          )}
        </div>

        {/* 차트 자동 렌더링 */}
        {hasCharts && <ResultRenderer toolCalls={toolCalls} />}

        {/* 도구 호출 이력 (assistant only, 1건 이상) */}
        {hasCharts && (
          <div className="mt-2 pt-2 border-t border-black/5">
            <button
              type="button"
              onClick={() => setShowTools((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              aria-expanded={showTools}
            >
              {showTools ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              <span>🔍 사용 도구 {toolCalls.length}개</span>
            </button>
            {showTools && (
              <ul className="mt-1 space-y-0.5 text-[11px] text-[var(--muted-foreground)]">
                {toolCalls.map((tc, i) => (
                  <li key={i} className="break-keep">
                    <code className="font-mono">{tc.name}</code>
                    {tc.args && Object.keys(tc.args).length > 0 && (
                      <span className="opacity-70"> ({Object.entries(tc.args).map(([k, v]) => `${k}=${v}`).join(', ')})</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 시간 (hover 시) */}
        {ts && (
          <div className="absolute -bottom-4 left-2 text-[10px] text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity">
            {formatTime(ts)}
          </div>
        )}
      </div>
    </div>
  );
}
