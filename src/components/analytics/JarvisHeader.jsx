// JARVIS Arc Reactor 헤더
// 다층 회전 원 + 디지털 카운트 + 글로우

import { useEffect, useState } from 'react';

function ArcReactor({ size = 40 }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {/* 외곽 회전 원 */}
      <svg
        className="absolute inset-0 animate-jarvis-arc-spin"
        viewBox="0 0 100 100"
        style={{ filter: 'drop-shadow(0 0 6px rgba(0, 212, 255, 0.8))' }}
      >
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(0,212,255,0.55)" strokeWidth="1.5" strokeDasharray="4 4" />
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(0,212,255,0.2)" strokeWidth="0.5" />
      </svg>
      {/* 중간 역회전 원 */}
      <svg
        className="absolute inset-0 animate-jarvis-arc-spin-rev"
        viewBox="0 0 100 100"
      >
        <circle cx="50" cy="50" r="34" fill="none" stroke="rgba(77,255,255,0.6)" strokeWidth="1" strokeDasharray="2 6" />
      </svg>
      {/* 코어 */}
      <div
        className="absolute inset-0 m-auto rounded-full animate-jarvis-glow-pulse"
        style={{
          width: '40%',
          height: '40%',
          top: '30%',
          left: '30%',
          background: 'radial-gradient(circle, #4dffff 0%, #00d4ff 50%, rgba(0,212,255,0.2) 100%)',
          boxShadow: '0 0 12px rgba(0, 212, 255, 0.9), inset 0 0 6px rgba(255, 255, 255, 0.7)',
        }}
      />
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
      className="relative flex items-center justify-between px-3 sm:px-5 py-2.5 flex-shrink-0 z-20"
      style={{
        background: 'linear-gradient(180deg, rgba(5, 11, 24, 0.95) 0%, rgba(10, 25, 41, 0.75) 100%)',
        borderBottom: '1px solid rgba(0, 212, 255, 0.25)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.45), inset 0 -1px 0 rgba(0, 212, 255, 0.15)',
      }}
    >
      {/* 좌측: nav + arc + title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          className="md:hidden p-1.5 rounded hover:bg-cyan-500/10 flex-shrink-0 text-cyan-300"
          onClick={onSidebarToggle}
          aria-label="사이드바 열기"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <button
          type="button"
          className="hidden md:flex items-center gap-1 px-2 py-1 rounded hover:bg-cyan-500/10 text-cyan-400/80 hover:text-cyan-300 flex-shrink-0 text-xs"
          onClick={onBack}
          aria-label="대시보드로"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          <span>대시보드</span>
        </button>
        <ArcReactor size={36} />
        <div className="flex flex-col min-w-0">
          <span
            className="text-base sm:text-lg font-black tracking-wider jarvis-text-glow jarvis-text-chromatic"
            style={{ color: '#e8f4fd', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.08em' }}
          >
            MOVE INTELLIGENCE
          </span>
          <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--jarvis-text-muted)' }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle animate-jarvis-glow-pulse" style={{ background: '#00ff88', boxShadow: '0 0 6px #00ff88' }} />
            QUANTUM AI · ONLINE
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
