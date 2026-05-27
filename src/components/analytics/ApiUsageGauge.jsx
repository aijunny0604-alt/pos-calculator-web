// MOVIS API 사용량 실시간 게이지 위젯
// Gemini + Groq 듀얼 추적, 1초 단위 갱신, JARVIS 테마

import { useEffect, useState, useMemo, useRef } from 'react';
import { Activity, ChevronDown, ChevronUp, Zap, Brain, Flame, Cpu } from 'lucide-react';
import { getUsageStats } from '@/lib/apiUsageTracker';

const REFRESH_INTERVAL_MS = 1000;

// 사용률 → 색상
const pickColor = (pct) => {
  if (pct >= 90) return { fg: '#ff4d6d', glow: 'rgba(255,77,109,0.55)', label: 'CRITICAL' };
  if (pct >= 70) return { fg: '#ffaa00', glow: 'rgba(255,170,0,0.45)', label: 'WARN' };
  if (pct >= 40) return { fg: '#4dffff', glow: 'rgba(77,255,255,0.4)', label: 'NORMAL' };
  return { fg: '#00ff88', glow: 'rgba(0,255,136,0.4)', label: 'IDLE' };
};

function GaugeBar({ pct, fg, glow, height = 6 }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="relative w-full rounded-full overflow-hidden"
      style={{
        height,
        background: 'rgba(0, 212, 255, 0.08)',
        border: '1px solid rgba(0, 212, 255, 0.12)',
      }}
    >
      <div
        className="absolute inset-y-0 left-0 transition-all duration-500 ease-out"
        style={{
          width: `${clamped}%`,
          background: `linear-gradient(90deg, ${fg}AA, ${fg})`,
          boxShadow: `0 0 8px ${glow}, inset 0 0 4px rgba(255,255,255,0.2)`,
        }}
      />
      {/* 스캔라인 */}
      <div
        className="absolute inset-y-0 left-0 w-px"
        style={{
          left: `${clamped}%`,
          background: fg,
          boxShadow: `0 0 6px ${glow}`,
          opacity: 0.8,
        }}
      />
    </div>
  );
}

function GaugeRow({ icon: Icon, label, value, sub, pct, accent }) {
  const color = pickColor(pct);
  const fg = accent || color.fg;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-mono">
        <span className="flex items-center gap-1.5" style={{ color: 'var(--jarvis-text-muted, #7e9cb8)' }}>
          <Icon className="w-3 h-3" style={{ color: fg }} />
          {label}
        </span>
        <span className="font-semibold" style={{ color: fg, textShadow: `0 0 6px ${color.glow}` }}>
          {value}
        </span>
      </div>
      <GaugeBar pct={pct} fg={fg} glow={color.glow} />
      {sub && (
        <div className="text-[9px] font-mono opacity-60 leading-tight" style={{ color: 'var(--jarvis-text-muted, #7e9cb8)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function ApiUsageGauge({ defaultExpanded = false, compact = false }) {
  const [stats, setStats] = useState(() => getUsageStats());
  const [expanded, setExpanded] = useState(defaultExpanded);
  const wrapRef = useRef(null);

  // 1초마다 통계 갱신
  useEffect(() => {
    const id = setInterval(() => {
      setStats(getUsageStats());
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // 펼침 상태에서 바깥 클릭 시 닫기
  useEffect(() => {
    if (!expanded) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setExpanded(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  const ctxColor = useMemo(() => pickColor(stats.context.pct), [stats.context.pct]);
  const burnColor = useMemo(() => {
    // burn rate 시각화 — $0.5/h부터 노랑, $2/h부터 빨강
    const burnPct = Math.min(100, (stats.burnRatePerHour / 2) * 100);
    return pickColor(burnPct);
  }, [stats.burnRatePerHour]);

  return (
    <div className="relative inline-flex" ref={wrapRef}>
      {/* 항상 표시되는 칩 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg font-mono text-[10px] sm:text-[11px] transition-all hover:scale-[1.02]"
        style={{
          background: 'rgba(15, 26, 45, 0.7)',
          border: `1px solid ${stats.fallbackActive ? 'rgba(255,170,0,0.4)' : 'rgba(0, 212, 255, 0.25)'}`,
          color: 'var(--jarvis-text-primary, #e8f4fd)',
          boxShadow: stats.fallbackActive
            ? '0 0 12px rgba(255,170,0,0.25), inset 0 0 8px rgba(255,170,0,0.08)'
            : '0 0 10px rgba(0,212,255,0.15), inset 0 0 6px rgba(0,212,255,0.05)',
        }}
        aria-label={expanded ? 'API 사용량 게이지 접기' : 'API 사용량 게이지 펼치기'}
        aria-expanded={expanded}
        title="API 사용량 게이지"
      >
        <Activity className="w-3.5 h-3.5" style={{
          color: stats.fallbackActive ? '#ffaa00' : '#4dffff',
          filter: `drop-shadow(0 0 4px ${stats.fallbackActive ? 'rgba(255,170,0,0.6)' : 'rgba(77,255,255,0.6)'})`,
        }} />
        <span className="hidden sm:inline" style={{ color: ctxColor.fg, textShadow: `0 0 4px ${ctxColor.glow}` }}>
          CTX {stats.context.pct.toFixed(0)}%
        </span>
        <span className="opacity-50 hidden sm:inline">│</span>
        <span style={{ color: '#00ff88', textShadow: '0 0 4px rgba(0,255,136,0.4)' }}>
          ${stats.totalCost.toFixed(2)}
        </span>
        <span className="opacity-50 hidden sm:inline">│</span>
        <span className="hidden sm:inline" style={{ color: burnColor.fg, textShadow: `0 0 4px ${burnColor.glow}` }}>
          {stats.burnRatePerHour > 0 ? `${stats.burnRatePerHour.toFixed(2)}/h` : 'IDLE'}
        </span>
        {stats.fallbackActive && (
          <span className="ml-1 px-1 rounded text-[9px] font-bold" style={{
            background: 'rgba(255,170,0,0.2)',
            color: '#ffaa00',
            border: '1px solid rgba(255,170,0,0.3)',
          }}>
            ⚡GROQ
          </span>
        )}
        {expanded
          ? <ChevronUp className="w-3 h-3 opacity-70" />
          : <ChevronDown className="w-3 h-3 opacity-50 group-hover:opacity-100" />}
      </button>

      {/* 펼침: 칩 아래 absolute 팝오버 */}
      {expanded && (
        <PopoverCard
          stats={stats}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}

function PopoverCard({ stats, onClose }) {
  // 모바일(sm 미만)은 fixed 전폭 + 12px gap, 데스크탑은 chip 우측 정렬 absolute 340px
  return (
    <div
      className="fixed left-3 right-3 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[340px] z-[60] font-mono"
      role="dialog"
      aria-label="API 사용량 상세"
    >
      <div
        className="movis-glass-card p-3 sm:p-4"
        style={{
          background: 'rgba(10, 25, 41, 0.92)',
          borderColor: 'rgba(0, 212, 255, 0.3)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 24px rgba(0, 212, 255, 0.18)',
        }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-3 pb-2" style={{
          borderBottom: '1px solid rgba(0, 212, 255, 0.18)',
        }}>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4" style={{
              color: '#4dffff',
              filter: 'drop-shadow(0 0 6px rgba(77,255,255,0.6))',
            }} />
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{
              color: '#e8f4fd',
              textShadow: '0 0 8px rgba(0, 212, 255, 0.45)',
            }}>
              M.O.V.I.S · NEURAL LINK
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-cyan-500/10"
            aria-label="API 사용량 게이지 접기"
          >
            <ChevronUp className="w-3.5 h-3.5" style={{ color: '#7e9cb8' }} />
          </button>
        </div>

        {/* 게이지 4종 */}
        <div className="space-y-3">
          <GaugeRow
            icon={Brain}
            label="CONTEXT"
            value={`${stats.context.pct.toFixed(1)}%`}
            sub={`${formatTokens(stats.context.tokens)} / ${formatTokens(stats.context.window)} · ${stats.context.model}`}
            pct={stats.context.pct}
          />
          <GaugeRow
            icon={Cpu}
            label="GEMINI · RPD"
            value={`${stats.gemini.calls} / ${stats.gemini.rpdLimit}`}
            sub={`${formatTokens(stats.gemini.tokens.total)} tok · $${stats.gemini.cost.toFixed(4)} · ${stats.gemini.rpm}/${stats.gemini.rpmLimit} RPM`}
            pct={stats.gemini.usagePct}
          />
          <GaugeRow
            icon={Zap}
            label="GROQ · RPD"
            value={`${stats.groq.calls} / ${stats.groq.rpdLimit}`}
            sub={`${formatTokens(stats.groq.tokens.total)} tok · $${stats.groq.cost.toFixed(4)} · ${stats.groq.rpm}/${stats.groq.rpmLimit} RPM`}
            pct={stats.groq.usagePct}
            accent={stats.fallbackActive ? '#ffaa00' : undefined}
          />
          <GaugeRow
            icon={Flame}
            label="BURN RATE (5min)"
            value={`$${stats.burnRatePerHour.toFixed(3)}/h`}
            sub={`Today $${stats.totalCost.toFixed(4)} · ${stats.totalCalls} calls`}
            pct={Math.min(100, (stats.burnRatePerHour / 2) * 100)}
          />
        </div>

        {/* 폴백 표시 */}
        {stats.fallbackActive && (
          <div className="mt-3 px-2 py-1.5 rounded text-[10px] font-mono flex items-center gap-1.5" style={{
            background: 'rgba(255,170,0,0.12)',
            border: '1px solid rgba(255,170,0,0.3)',
            color: '#ffaa00',
          }}>
            <Zap className="w-3 h-3" style={{ filter: 'drop-shadow(0 0 4px rgba(255,170,0,0.6))' }} />
            GROQ FALLBACK ACTIVE — Gemini 한도 도달 시 자동 전환됨
          </div>
        )}

        {/* 푸터 */}
        <div className="mt-2 text-[9px] font-mono opacity-50 text-center" style={{ color: '#7e9cb8' }}>
          {stats.lastCallAt > 0
            ? `last call ${formatRelativeTime(stats.lastCallAt)}`
            : '● standby'}
        </div>
      </div>
    </div>
  );
}

function formatTokens(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 1000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}
