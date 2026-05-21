import { useState } from 'react';
import { Sparkles, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { formatTime } from '@/lib/utils';

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

export default function MessageBubble({ message }) {
  const [showTools, setShowTools] = useState(false);
  if (!message) return null;
  const { role, content, ts, toolCalls, cached } = message;

  // system 메시지 — 가운데 작은 회색
  if (role === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-[var(--muted-foreground)] px-3 py-1 rounded-full bg-[var(--accent)]">
          {content}
        </span>
      </div>
    );
  }

  const isUser = role === 'user';
  const isError = role === 'error';

  const bubbleClass = isUser
    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
    : isError
      ? 'bg-red-50 text-red-700 border border-red-200'
      : 'bg-[var(--accent)] text-[var(--foreground)]';

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} my-2`}>
      <div className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 ${bubbleClass} min-w-0 group relative`}
           title={ts ? formatTime(ts) : ''}>
        {/* 헤더 (assistant/error 만) */}
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold opacity-80">
            {isError ? <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />}
            <span>{isError ? '오류' : 'AI 어시스턴트'}</span>
            {cached && (
              <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white/70 text-[var(--muted-foreground)] border border-[var(--border)]"
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
            <MarkdownLite content={content} />
          )}
        </div>

        {/* 도구 호출 이력 (assistant only, 1건 이상) */}
        {!isUser && !isError && Array.isArray(toolCalls) && toolCalls.length > 0 && (
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
