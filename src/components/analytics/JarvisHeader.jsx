// JARVIS Arc Reactor 헤더
// 다층 회전 원 + 디지털 카운트 + 글로우

import { useEffect, useState } from 'react';

function ArcReactor({ size = 40 }) {
  return (
    <div className="relative flex-shrink-0 group cursor-pointer" style={{ width: size, height: size }}>
      {/* 외곽 펄스 halo */}
      <div
        className="absolute inset-0 rounded-full animate-jarvis-glow-pulse pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(0,212,255,0.25) 0%, transparent 70%)',
        }}
      />

      {/* 외곽 회전 원 (큰 점선) */}
      <svg
        className="absolute inset-0 animate-jarvis-arc-spin"
        viewBox="0 0 100 100"
        style={{ filter: 'drop-shadow(0 0 4px rgba(0, 212, 255, 0.7))' }}
      >
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(0,212,255,0.6)" strokeWidth="1.2" strokeDasharray="4 5" />
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(0,212,255,0.15)" strokeWidth="0.3" />
      </svg>

      {/* 8방향 노치 마커 (느린 정방향) */}
      <svg
        className="absolute inset-0 animate-jarvis-arc-spin-slow"
        viewBox="0 0 100 100"
        style={{ filter: 'drop-shadow(0 0 3px rgba(77, 255, 255, 0.7))' }}
      >
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i * 45) * (Math.PI / 180);
          const x1 = 50 + Math.cos(angle) * 48;
          const y1 = 50 + Math.sin(angle) * 48;
          const x2 = 50 + Math.cos(angle) * 42;
          const y2 = 50 + Math.sin(angle) * 42;
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(77,255,255,0.9)" strokeWidth="1.5" strokeLinecap="round" />
          );
        })}
      </svg>

      {/* 중간 역회전 점선 원 */}
      <svg
        className="absolute inset-0 animate-jarvis-arc-spin-rev"
        viewBox="0 0 100 100"
      >
        <circle cx="50" cy="50" r="34" fill="none" stroke="rgba(77,255,255,0.7)" strokeWidth="0.8" strokeDasharray="2 7" />
      </svg>

      {/* 안쪽 작은 회전 원 (반대 방향 빠르게) */}
      <svg
        className="absolute inset-0 animate-jarvis-orbit-1"
        viewBox="0 0 100 100"
      >
        <circle cx="50" cy="20" r="1.8" fill="#4dffff" style={{ filter: 'drop-shadow(0 0 3px #4dffff)' }} />
      </svg>
      <svg
        className="absolute inset-0 animate-jarvis-orbit-2"
        viewBox="0 0 100 100"
      >
        <circle cx="80" cy="50" r="1.5" fill="#a855f7" style={{ filter: 'drop-shadow(0 0 3px #a855f7)' }} />
      </svg>
      <svg
        className="absolute inset-0 animate-jarvis-orbit-3"
        viewBox="0 0 100 100"
      >
        <circle cx="50" cy="80" r="1.5" fill="#00d4ff" style={{ filter: 'drop-shadow(0 0 3px #00d4ff)' }} />
      </svg>

      {/* 코어 */}
      <div
        className="absolute inset-0 m-auto rounded-full animate-jarvis-glow-pulse"
        style={{
          width: '38%',
          height: '38%',
          top: '31%',
          left: '31%',
          background: 'radial-gradient(circle, #ffffff 0%, #4dffff 30%, #00d4ff 70%, rgba(0,212,255,0.2) 100%)',
          boxShadow: '0 0 10px rgba(0, 212, 255, 0.95), 0 0 20px rgba(0, 212, 255, 0.5), inset 0 0 6px rgba(255, 255, 255, 0.8)',
        }}
      />

      {/* hover 시 가속 회전 (transition으로 자연스럽게) */}
      <style>{`
        .group:hover svg.animate-jarvis-arc-spin { animation-duration: 3s; }
        .group:hover svg.animate-jarvis-arc-spin-rev { animation-duration: 4s; }
        .group:hover svg.animate-jarvis-arc-spin-slow { animation-duration: 6s; }
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
