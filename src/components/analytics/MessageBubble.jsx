import { useState, useRef } from 'react';
import MessageActions from './MessageActions';
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

export default function MessageBubble({ message, enableTypewriter = true, tts, onFollowUpClick, userQuery }) {
  const [showTools, setShowTools] = useState(false);
  const bubbleRef = useRef(null);
  if (!message) return null;
  const { role, content, ts, toolCalls, cached, followUps, fallback } = message;

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
      <div className="flex justify-center my-2 px-2">
        <span className="text-[11px] font-medium px-3 py-2 rounded-full min-w-0 break-words" style={{
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

  // 다크 SF 글래스 스타일
  const bubbleStyle = isUser
    ? {
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.22), rgba(77, 255, 255, 0.12))',
        color: 'var(--jarvis-text-primary)',
        border: '1px solid rgba(0, 212, 255, 0.25)',
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255,255,255,0.08)',
      }
    : isError
      ? {
          background: 'linear-gradient(135deg, rgba(255, 56, 96, 0.16), rgba(255, 56, 96, 0.06))',
          color: '#ffb4c0',
          border: '1px solid rgba(0, 212, 255, 0.22)',
          boxShadow: '0 6px 18px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255,56,96,0.08)',
        }
      : {
          background: 'rgba(15, 26, 45, 0.7)',
          color: 'var(--jarvis-text-primary)',
          border: '1px solid rgba(0, 212, 255, 0.18)',
          backdropFilter: 'blur(14px) saturate(140%)',
          WebkitBackdropFilter: 'blur(14px) saturate(140%)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255,255,255,0.04)',
        };
  const bubbleClass = '';

  // 차트 있는 assistant는 더 넓게, 일반 텍스트는 가독성 위해 lg에서 픽셀 제한
  // (한 줄이 너무 길면 시선 이동이 커져 읽기 어려움)
  const maxWidthClass = hasCharts
    ? 'max-w-full sm:max-w-[92%]'
    : 'max-w-[90%] sm:max-w-[78%] lg:max-w-[640px]';

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} my-2 animate-jarvis-card-emerge`}>
      <div
        ref={bubbleRef}
        className={`${maxWidthClass} rounded-2xl px-3 sm:px-4 py-2 min-w-0 group relative`}
        title={ts ? formatTime(ts) : ''}
        style={bubbleStyle}
      >
        {/* 헤더 (assistant/error 만) */}
        {!isUser && (
          <div className="flex items-center gap-2 mb-2 text-[11px] font-semibold opacity-80 min-w-0">
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
              <span className="text-[10px] font-semibold px-2 py-1 rounded-full flex-shrink-0" style={{
                background: 'rgba(0,212,255,0.1)',
                color: 'var(--jarvis-cyan)',
                border: '1px solid rgba(0,212,255,0.22)',
              }}
                    title="5분 이내 동일 질문 캐시">
                📋 캐시
              </span>
            )}
            {/* 메시지 액션 (즐겨찾기/복사/이미지/엑셀) — assistant 메시지만 */}
            {isAssistant && (
              <MessageActions message={message} userQuery={userQuery} bubbleRef={bubbleRef} />
            )}
          </div>
        )}

        {/* 본문 */}
        <div className={`text-sm min-w-0 ${isUser ? 'break-words leading-snug' : 'break-words'}`}>
          {isUser ? (
            <span className="whitespace-pre-wrap">{content}</span>
          ) : (
            <>
              <MarkdownLite content={displayedContent} />
              {shouldType && !done && (
                <span className="inline-block w-2 h-4 ml-1 align-text-bottom animate-jarvis-cursor" style={{ background: 'var(--jarvis-cyan)', boxShadow: '0 0 4px rgba(0,212,255,0.65)' }} />
              )}
            </>
          )}
        </div>

        {/* 차트 자동 렌더링 */}
        {hasCharts && <ResultRenderer toolCalls={toolCalls} />}

        {/* 추천 후속 질문 칩 (assistant only) — 카테고리별 아이콘/색상 */}
        {isAssistant && Array.isArray(followUps) && followUps.length > 0 && onFollowUpClick && (
          <div className="mt-3 pt-2 border-t border-cyan-400/20">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: 'var(--jarvis-text-muted)' }}>
              💡 다음 질문 추천 ({followUps.length}개)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {followUps.map((item, i) => {
                // 문자열 또는 객체 호환
                const q = typeof item === 'string' ? item : item.text;
                const cat = typeof item === 'object' ? (item.category || 'analysis') : 'analysis';
                // 카테고리별 스타일
                const CAT_STYLES = {
                  action:   { icon: '⚡', bg: 'rgba(0, 255, 136, 0.08)', color: '#00ff88', border: '1px solid rgba(0, 255, 136, 0.30)' },
                  analysis: { icon: '🔍', bg: 'rgba(0, 212, 255, 0.08)', color: 'var(--jarvis-cyan)', border: '1px solid rgba(0, 212, 255, 0.22)' },
                  compare:  { icon: '📊', bg: 'rgba(168, 85, 247, 0.08)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.28)' },
                  sim:      { icon: '🔮', bg: 'rgba(251, 191, 36, 0.08)', color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.28)' },
                };
                const s = CAT_STYLES[cat] || CAT_STYLES.analysis;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onFollowUpClick(q)}
                    className="text-[11px] px-2.5 py-1.5 rounded-lg transition-all hover:scale-[1.03] hover:brightness-125 break-keep flex items-center gap-1"
                    style={{ background: s.bg, color: s.color, border: s.border }}
                  >
                    <span aria-hidden="true">{s.icon}</span>
                    <span>{q}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 폴백 마커 (자동 검색 결과 표시) */}
        {fallback && (
          <div className="mt-2 text-[10px] font-mono italic" style={{ color: 'var(--jarvis-text-muted)' }}>
            ⚡ 자동 검색 모드 (AI 도구 호출 실패 → 코드 직접 검색)
          </div>
        )}

        {/* 도구 호출 이력 (assistant only, 1건 이상) */}
        {hasCharts && (
          <div className="mt-2 pt-2 border-t border-cyan-400/20">
            <button
              type="button"
              onClick={() => setShowTools((v) => !v)}
              className="flex items-center gap-2 text-[11px] font-medium text-[var(--jarvis-text-muted)] hover:text-[var(--jarvis-text-primary)]"
              aria-expanded={showTools}
            >
              {showTools ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              <span>🔍 사용 도구 {toolCalls.length}개</span>
            </button>
            {showTools && (
              <ul className="mt-2 space-y-1 text-[11px] text-[var(--jarvis-text-muted)]">
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
