// 3D 자비스 홀로그램 HUD — 빈 상태 메인 그래픽
// 다층 SVG + 양자 입자 궤도 + 3D 다이아몬드 + HUD 모서리 마커

import { useEffect, useRef } from 'react';

export default function JarvisHologramHUD({ size = 'lg' }) {
  // 반응형 사이즈
  const sizeClass = {
    sm: 'w-44 h-44',
    md: 'w-60 h-60',
    lg: 'w-72 h-72 sm:w-80 sm:h-80 md:w-96 md:h-96',
  }[size] || 'w-72 h-72';

  // 마우스 따라가는 미세 tilt (데스크탑)
  const containerRef = useRef(null);
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const el = containerRef.current;
    if (!el) return;
    const handle = (e) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / rect.width;
      const dy = (e.clientY - cy) / rect.height;
      const rotY = Math.max(-15, Math.min(15, dx * 20));
      const rotX = Math.max(-15, Math.min(15, -dy * 20));
      el.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    };
    const reset = () => { el.style.transform = ''; };
    window.addEventListener('mousemove', handle);
    el.addEventListener('mouseleave', reset);
    return () => {
      window.removeEventListener('mousemove', handle);
      el.removeEventListener('mouseleave', reset);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative ${sizeClass} mb-4 mx-auto transition-transform duration-300 ease-out`}
      style={{ transformStyle: 'preserve-3d' }}
      aria-hidden="true"
    >
      {/* 외곽 HUD 모서리 마커 (4개) */}
      <CornerBrackets />

      {/* 8방향 노치 마커 (회전) */}
      <svg className="absolute inset-0 animate-jarvis-arc-spin" viewBox="0 0 200 200" style={{ filter: 'drop-shadow(0 0 6px rgba(0,212,255,0.5))' }}>
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i * 45) * (Math.PI / 180);
          const x1 = 100 + Math.cos(angle) * 95;
          const y1 = 100 + Math.sin(angle) * 95;
          const x2 = 100 + Math.cos(angle) * 88;
          const y2 = 100 + Math.sin(angle) * 88;
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(0,212,255,0.8)" strokeWidth="2" strokeLinecap="round" />
          );
        })}
      </svg>

      {/* 외곽 점선 원 (정방향) */}
      <svg className="absolute inset-0 animate-jarvis-arc-spin-slow" viewBox="0 0 200 200" style={{ filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.6))' }}>
        <circle cx="100" cy="100" r="92" fill="none" stroke="rgba(0,212,255,0.55)" strokeWidth="1.2" strokeDasharray="6 4" />
        <circle cx="100" cy="100" r="92" fill="none" stroke="rgba(0,212,255,0.15)" strokeWidth="0.5" />
      </svg>

      {/* 중간 원 (역방향) */}
      <svg className="absolute inset-0 animate-jarvis-arc-spin-rev" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="74" fill="none" stroke="rgba(77,255,255,0.5)" strokeWidth="1" strokeDasharray="3 6" />
        {/* 4방향 데이터 라인 (티커) */}
        {[0, 90, 180, 270].map((deg) => (
          <line
            key={deg}
            x1="100" y1="100"
            x2={100 + Math.cos(deg * Math.PI / 180) * 70}
            y2={100 + Math.sin(deg * Math.PI / 180) * 70}
            stroke="rgba(77,255,255,0.25)"
            strokeWidth="0.5"
          />
        ))}
      </svg>

      {/* 양자 입자 궤도 (3개, 각자 다른 속도) */}
      <svg className="absolute inset-0 animate-jarvis-orbit-1" viewBox="0 0 200 200">
        <circle cx="100" cy="20" r="2.5" fill="#00d4ff" style={{ filter: 'drop-shadow(0 0 4px #00d4ff)' }} />
      </svg>
      <svg className="absolute inset-0 animate-jarvis-orbit-2" viewBox="0 0 200 200">
        <circle cx="180" cy="100" r="1.8" fill="#4dffff" style={{ filter: 'drop-shadow(0 0 4px #4dffff)' }} />
      </svg>
      <svg className="absolute inset-0 animate-jarvis-orbit-3" viewBox="0 0 200 200">
        <circle cx="100" cy="180" r="2.2" fill="#a855f7" style={{ filter: 'drop-shadow(0 0 4px #a855f7)' }} />
      </svg>

      {/* 내곽 펄스 원 */}
      <svg className="absolute inset-0" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="55" fill="none" stroke="rgba(0,212,255,0.4)" strokeWidth="1" className="animate-jarvis-radar-pulse" />
      </svg>

      {/* 3D 회전 다이아몬드 */}
      <div className="absolute inset-0 m-auto flex items-center justify-center" style={{ transformStyle: 'preserve-3d' }}>
        <div className="relative w-24 h-24 animate-jarvis-3d-tumble" style={{ transformStyle: 'preserve-3d' }}>
          {/* 4면 다이아몬드 (sf 큐브) */}
          {[
            { rx: 0, ry: 0, opacity: 0.95 },
            { rx: 0, ry: 90, opacity: 0.7 },
            { rx: 90, ry: 0, opacity: 0.55 },
            { rx: 0, ry: 45, opacity: 0.4 },
          ].map((face, i) => (
            <div
              key={i}
              className="absolute inset-0"
              style={{
                transform: `rotateX(${face.rx}deg) rotateY(${face.ry}deg)`,
                opacity: face.opacity,
              }}
            >
              <svg viewBox="0 0 100 100" className="w-full h-full">
                <polygon
                  points="50,5 95,50 50,95 5,50"
                  fill="none"
                  stroke="#00d4ff"
                  strokeWidth="1.5"
                  style={{ filter: 'drop-shadow(0 0 4px #00d4ff)' }}
                />
                <polygon
                  points="50,20 80,50 50,80 20,50"
                  fill="rgba(0, 212, 255, 0.08)"
                  stroke="rgba(77,255,255,0.6)"
                  strokeWidth="0.8"
                />
              </svg>
            </div>
          ))}
        </div>
      </div>

      {/* 코어 (강한 글로우) */}
      <div
        className="absolute inset-0 m-auto rounded-full animate-jarvis-core-pulse"
        style={{
          width: '14%',
          height: '14%',
          top: '43%',
          left: '43%',
          background: 'radial-gradient(circle, #ffffff 0%, #4dffff 35%, #00d4ff 70%, rgba(0,212,255,0) 100%)',
          boxShadow: '0 0 20px #00d4ff, 0 0 40px rgba(0,212,255,0.7), 0 0 80px rgba(0,212,255,0.4), inset 0 0 8px rgba(255,255,255,0.9)',
        }}
      />

      {/* 좌측 데이터 스트림 (수직 텍스트 모티프) */}
      <div className="absolute top-1/2 -translate-y-1/2 -left-2 sm:left-2 hidden md:flex flex-col gap-1 text-[8px] font-mono opacity-60" style={{ color: '#00d4ff' }}>
        <span>SYS·ONLINE</span>
        <span className="opacity-60">▮▮▮▮▮▯</span>
        <span className="opacity-40">CORE 98%</span>
      </div>

      {/* 우측 데이터 */}
      <div className="absolute top-1/2 -translate-y-1/2 -right-2 sm:right-2 hidden md:flex flex-col gap-1 text-[8px] font-mono text-right opacity-60" style={{ color: '#4dffff' }}>
        <span>Q-LINK·OK</span>
        <span className="opacity-60">▮▮▮▮▮▮</span>
        <span className="opacity-40">FLUX 0.42</span>
      </div>

      {/* 하단 HUD 라벨 */}
      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[9px] font-mono tracking-[0.3em] uppercase" style={{
        color: 'rgba(0, 212, 255, 0.7)',
        textShadow: '0 0 4px rgba(0, 212, 255, 0.6)',
      }}>
        ▸ MOVE / INTELLIGENCE ◂
      </div>
    </div>
  );
}

// HUD 모서리 brackets (4개)
function CornerBrackets() {
  const positions = [
    { top: 0, left: 0, rotate: 0 },
    { top: 0, right: 0, rotate: 90 },
    { bottom: 0, right: 0, rotate: 180 },
    { bottom: 0, left: 0, rotate: 270 },
  ];
  return (
    <>
      {positions.map((pos, i) => (
        <svg
          key={i}
          className="absolute w-6 h-6 sm:w-8 sm:h-8"
          style={{ ...pos, transform: `rotate(${pos.rotate}deg)`, filter: 'drop-shadow(0 0 4px rgba(0,212,255,0.6))' }}
          viewBox="0 0 24 24"
        >
          <path
            d="M2 8 L2 2 L8 2"
            fill="none"
            stroke="rgba(0,212,255,0.9)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ))}
    </>
  );
}
