// 대시보드 스마트 알림 피드 — 이상 징후 자동 탐지 결과 표시
import { useState, useEffect, useRef } from 'react';
import { RefreshCw, ChevronDown, ChevronUp, Sparkles, ArrowRight, Volume2, VolumeX } from 'lucide-react';
import { speak, stopSpeaking } from '@/lib/tts';

const LEVEL_STYLE = {
  critical: {
    badge: '긴급',
    bg: 'color-mix(in srgb, var(--destructive) 8%, var(--card))',
    border: 'color-mix(in srgb, var(--destructive) 25%, var(--border))',
    badgeBg: 'var(--destructive)',
    badgeColor: 'white',
    glow: '0 0 12px color-mix(in srgb, var(--destructive) 20%, transparent)',
  },
  warning: {
    badge: '주의',
    bg: 'color-mix(in srgb, var(--warning) 6%, var(--card))',
    border: 'color-mix(in srgb, var(--warning) 20%, var(--border))',
    badgeBg: 'var(--warning)',
    badgeColor: 'white',
    glow: 'none',
  },
  info: {
    badge: '정보',
    bg: 'var(--card)',
    border: 'var(--border)',
    badgeBg: 'color-mix(in srgb, var(--primary) 15%, transparent)',
    badgeColor: 'var(--primary)',
    glow: 'none',
  },
};

export default function SmartAlertFeed({ alerts = [], loading, meta, onRefresh, setCurrentPage }) {
  const [expanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const spokenRef = useRef(false);

  // TTS: 알림 로드 완료 시 자동 브리핑 (토글 ON일 때만)
  useEffect(() => {
    if (!ttsEnabled || !alerts || alerts.length === 0 || spokenRef.current) return;
    spokenRef.current = true;
    const critical = alerts.filter(a => a.level === 'critical');
    const warning = alerts.filter(a => a.level === 'warning');
    let msg = `MOVIS 분석 결과, `;
    if (critical.length > 0) msg += `긴급 알림 ${critical.length}건, `;
    if (warning.length > 0) msg += `주의 알림 ${warning.length}건이 있습니다. `;
    if (critical.length > 0) msg += critical[0].title + '. ';
    else if (warning.length > 0) msg += warning[0].title + '. ';
    speak(msg);
  }, [alerts, ttsEnabled]);

  if (loading) {
    return (
      <div
        className="rounded-xl border p-4 flex items-center gap-3"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      >
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
        <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>MOVIS AI가 매장 상태를 분석 중...</span>
      </div>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <div
        className="rounded-xl border p-4 flex items-center justify-between"
        style={{ background: 'color-mix(in srgb, var(--success) 5%, var(--card))', borderColor: 'color-mix(in srgb, var(--success) 20%, var(--border))' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">✅</span>
          <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>이상 징후 없음 — 매장 상태 정상</span>
        </div>
        <button
          onClick={onRefresh}
          className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
          title="새로고침"
        >
          <RefreshCw className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
        </button>
      </div>
    );
  }

  const criticalCount = alerts.filter(a => a.level === 'critical').length;
  const displayAlerts = showAll ? alerts : alerts.slice(0, 4);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: 'var(--card)', borderColor: criticalCount > 0 ? 'color-mix(in srgb, var(--destructive) 30%, var(--border))' : 'var(--border)' }}
    >
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded(!expanded); }}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--accent)] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>
            MOVIS 자율 분석
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
            style={{
              background: criticalCount > 0 ? 'var(--destructive)' : 'var(--warning)',
              color: 'white',
            }}
          >
            {alerts.length}건
          </span>
          {criticalCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-pulse"
              style={{ background: 'var(--destructive)', color: 'white' }}>
              긴급 {criticalCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {meta?.lastUpdated && (
            <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
              {new Date(meta.lastUpdated).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const next = !ttsEnabled;
              setTtsEnabled(next);
              if (!next) stopSpeaking();
              else if (alerts.length > 0) { spokenRef.current = false; }
            }}
            className="p-1 rounded hover:bg-black/10 transition-colors"
            title={ttsEnabled ? '음성 끄기' : '음성 브리핑'}
          >
            {ttsEnabled
              ? <Volume2 className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
              : <VolumeX className="w-3.5 h-3.5" style={{ color: 'var(--muted-foreground)' }} />
            }
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRefresh?.(); }}
            className="p-1 rounded hover:bg-black/10 transition-colors"
            title="새로고침"
          >
            <RefreshCw className="w-3.5 h-3.5" style={{ color: 'var(--muted-foreground)' }} />
          </button>
          {expanded ? (
            <ChevronUp className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
          )}
        </div>
      </div>

      {/* Alert Items */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {displayAlerts.map((alert, i) => {
            const style = LEVEL_STYLE[alert.level] || LEVEL_STYLE.info;
            return (
              <div
                key={i}
                className="rounded-lg border p-3 transition-all hover:shadow-sm"
                style={{
                  background: style.bg,
                  borderColor: style.border,
                  boxShadow: style.glow,
                }}
              >
                <div className="flex items-start gap-2">
                  <span className="text-base flex-shrink-0 mt-0.5">{alert.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>
                        {alert.title}
                      </span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                        style={{ background: style.badgeBg, color: style.badgeColor }}
                      >
                        {style.badge}
                      </span>
                    </div>
                    <p className="text-xs mt-1 break-words leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                      {alert.detail}
                    </p>
                    {alert.suggestion && (
                      <p className="text-xs mt-1.5 flex items-start gap-1" style={{ color: 'var(--primary)' }}>
                        <span className="flex-shrink-0">💡</span>
                        <span>{alert.suggestion}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* 더보기 / AI 분석 바로가기 */}
          <div className="flex items-center justify-between pt-1">
            {alerts.length > 4 && (
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-xs font-medium hover:underline"
                style={{ color: 'var(--primary)' }}
              >
                {showAll ? '접기' : `+${alerts.length - 4}건 더보기`}
              </button>
            )}
            <button
              onClick={() => setCurrentPage?.('ai-analytics')}
              className="text-xs font-medium flex items-center gap-1 hover:underline ml-auto"
              style={{ color: 'var(--primary)' }}
            >
              AI에게 자세히 물어보기 <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
