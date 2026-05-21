// JARVIS Arc Reactor 헤더 - 외계 헥사고날 AI 코어
// 다층 헥사곤 회전 + 다이아몬드 + 디지털 카운트

import { useEffect, useState } from 'react';

// 외계 헥사고날 AI 코어 — 6각 + 내부 6각 + 회전 + 펄스 코어
function ArcReactor({ size = 40 }) {
  return (
    <div className="relative flex-shrink-0 group cursor-pointer" style={{ width: size, height: size }}>
      {/* 외곽 atmospheric glow */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none animate-jarvis-glow-pulse"
        style={{
          background: 'radial-gradient(circle, rgba(0,212,255,0.3) 0%, transparent 65%)',
        }}
      />

      {/* 외곽 회전 헥사곤 (점선) */}
      <svg
        className="absolute inset-0 animate-jarvis-arc-spin"
        viewBox="0 0 100 100"
        style={{ filter: 'drop-shadow(0 0 4px rgba(0, 212, 255, 0.7))' }}
      >
        <polygon
          points="50,5 90,28 90,72 50,95 10,72 10,28"
          fill="none"
          stroke="rgba(0,212,255,0.75)"
          strokeWidth="1.5"
          strokeDasharray="3 4"
          strokeLinejoin="round"
        />
        {/* 6 꼭짓점 마커 */}
        {[[50, 5], [90, 28], [90, 72], [50, 95], [10, 72], [10, 28]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2" fill="#4dffff" />
        ))}
      </svg>

      {/* 중간 역회전 양삼각 (외계 심볼) */}
      <svg
        className="absolute inset-0 animate-jarvis-arc-spin-rev"
        viewBox="0 0 100 100"
        style={{ filter: 'drop-shadow(0 0 3px rgba(168, 85, 247, 0.6))' }}
      >
        <polygon
          points="50,20 76,65 24,65"
          fill="none"
          stroke="rgba(168, 85, 247, 0.7)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <polygon
          points="50,80 24,35 76,35"
          fill="none"
          stroke="rgba(77, 255, 255, 0.6)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>

      {/* 안쪽 펄스 코어 */}
      <div
        className="absolute rounded-full"
        style={{
          width: '32%',
          height: '32%',
          top: '34%',
          left: '34%',
          background: 'radial-gradient(circle, #ffffff 0%, #4dffff 40%, #00d4ff 80%, rgba(0,212,255,0.1) 100%)',
          boxShadow: '0 0 8px rgba(0, 212, 255, 0.85), 0 0 18px rgba(0, 212, 255, 0.45), inset 0 0 4px rgba(255, 255, 255, 0.85)',
          animation: 'jarvis-glow-pulse 2.4s ease-in-out infinite',
        }}
      />

      {/* 코어 중심 회전 다이아몬드 */}
      <svg
        className="absolute inset-0 animate-jarvis-arc-spin-slow"
        viewBox="0 0 100 100"
      >
        <polygon
          points="50,40 60,50 50,60 40,50"
          fill="rgba(255, 255, 255, 0.5)"
          stroke="#ffffff"
          strokeWidth="0.6"
        />
      </svg>

      {/* hover 가속 */}
      <style>{`
        .group:hover svg.animate-jarvis-arc-spin { animation-duration: 4s; }
        .group:hover svg.animate-jarvis-arc-spin-rev { animation-duration: 5s; }
        .group:hover svg.animate-jarvis-arc-spin-slow { animation-duration: 8s; }
      `}</style>
    </div>
  );
}

// 디지털 카운트업 (값이 변할 때만 짧게 애니메이션)
function CountDigit({ value, label, color = '#00d4ff' }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const target = Number(value) || 0;
    const duration = 600;
    const start = Date.now();
    const initial = display;
    let raf;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // cubic out
      setDisplay(Math.round(initial + (target - initial) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="flex flex-col items-center min-w-[44px]">
      <span
        className="text-sm sm:text-base font-bold tabular-nums leading-none"
        style={{ color, textShadow: `0 0 6px ${color}, 0 0 12px ${color}66` }}
      >
        {display}
      </span>
      <span className="text-[8px] uppercase tracking-wider mt-0.5" style={{ color: 'var(--jarvis-text-muted)' }}>
        {label}
      </span>
    </div>
  );
}

export default function JarvisHeader({
  counts = {},
  loadingExtra = false,
  rightActions,
  onBack,
  onSidebarToggle,
}) {
  return (
    <div
      className="relative flex items-center justify-between gap-3 px-3 sm:px-5 py-2.5 flex-shrink-0 z-20 movis-glass-panel"
      style={{
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
      }}
    >
      {/* 좌측: nav + arc + title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <button
          type="button"
          className="md:hidden p-2.5 rounded hover:bg-cyan-500/15 flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
          onClick={onSidebarToggle}
          aria-label="사이드바 열기"
          style={{ color: '#4dffff' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <button
          type="button"
          className="hidden md:flex items-center gap-1 px-2 py-1 rounded hover:bg-cyan-500/15 flex-shrink-0 text-xs font-medium"
          onClick={onBack}
          aria-label="대시보드로"
          style={{ color: '#7e9cb8' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          <span>대시보드</span>
        </button>
        <ArcReactor size={36} />
        <div className="flex flex-col min-w-0">
          <span
            className="text-base sm:text-lg font-black tracking-wider truncate"
            style={{
              color: '#e8f4fd',
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '0.08em',
              textShadow: '0 0 10px rgba(0, 212, 255, 0.6), 0 0 24px rgba(0, 212, 255, 0.2)',
            }}
          >
            MOVE INTELLIGENCE
          </span>
          <span className="text-[10px] uppercase tracking-widest truncate" style={{ color: '#7e9cb8' }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle animate-jarvis-glow-pulse" style={{ background: '#00ff88', boxShadow: '0 0 6px #00ff88' }} />
            MOVIS · QUANTUM AI · ONLINE
          </span>
        </div>
      </div>

      {/* 우측: 카운트 + 액션 */}
      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        <div className="hidden md:flex items-center gap-3">
          <CountDigit value={counts.orders ?? 0} label="ORDERS" color="#00d4ff" />
          <span className="text-cyan-700">·</span>
          <CountDigit value={counts.customers ?? 0} label="CLIENTS" color="#4dffff" />
          <span className="text-cyan-700">·</span>
          <CountDigit value={counts.products ?? 0} label="STOCK" color="#a855f7" />
          {loadingExtra ? (
            <span className="text-[10px] text-cyan-600 animate-pulse ml-1">SYNC...</span>
          ) : (
            <span className="text-[10px] text-emerald-400 ml-1" title="결제/입금/반품 +3 로드 완료">+3</span>
          )}
        </div>
        {/* 모바일 컴팩트 */}
        <div className="md:hidden flex items-center gap-1 text-[10px] font-mono">
          <span className="text-cyan-400">{counts.orders}</span>
          <span className="text-cyan-700">·</span>
          <span className="text-cyan-300">{counts.customers}</span>
          <span className="text-cyan-700">·</span>
          <span className="text-purple-400">{counts.products}</span>
        </div>
        {rightActions}
      </div>
    </div>
  );
}
