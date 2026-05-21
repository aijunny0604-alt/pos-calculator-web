// 자비스 영화 스타일 전체 스탠바이 화면
// JARVIS 타이틀 + 시스템 메트릭 + dot sphere + ARMED 상태

import { useEffect, useState } from 'react';
import { Play, Volume2 } from 'lucide-react';
import JarvisDotSphere from './JarvisDotSphere';

function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

// 외계 헥사곤 데이터 마커 (sphere 주위에 떠있음)
function HexagonMarker({ top, left, translateX = '0', translateY = '0', color, delay = 0 }) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        top, left,
        transform: `translate(${translateX}, ${translateY})`,
        animation: `jarvis-hex-pulse 3s ease-in-out infinite ${delay}s`,
      }}
    >
      <svg width="20" height="22" viewBox="0 0 20 22" style={{ filter: `drop-shadow(0 0 6px ${color}cc)` }}>
        <polygon
          points="10,1 19,6 19,16 10,21 1,16 1,6"
          fill="none"
          stroke={color}
          strokeWidth="1"
          opacity="0.8"
        />
        <polygon
          points="10,5 16,8 16,14 10,17 4,14 4,8"
          fill={`${color}22`}
          stroke={color}
          strokeWidth="0.5"
        />
        <circle cx="10" cy="11" r="1.5" fill={color} />
      </svg>
    </div>
  );
}

export default function JarvisStandby({ voiceListening, ttsEnabled, sfxMuted, isLoading, ttsSpeaking }) {
  // 상태에 따른 sphere 모드
  const sphereMode = isLoading
    ? 'analyzing'
    : voiceListening
      ? 'listening'
      : ttsSpeaking
        ? 'responding'
        : 'standby';
  const statusColor = sphereMode === 'listening' ? '#ffaa00'
                    : sphereMode === 'analyzing' ? '#a855f7'
                    : sphereMode === 'responding' ? '#00ff88'
                    : '#00d4ff';
  // 시스템 메트릭 더미 값 (실시간 변화 — 영화 느낌)
  const [metrics, setMetrics] = useState({
    cpu: 24,
    mem: 1.2,
    net: 'CONNECTED',
    flux: 0.42,
  });
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => {
      // CPU 변동
      setMetrics((m) => ({
        ...m,
        cpu: Math.max(8, Math.min(72, m.cpu + (Math.random() - 0.5) * 4)),
        mem: Math.max(0.6, Math.min(3.2, m.mem + (Math.random() - 0.5) * 0.15)),
        flux: Math.max(0.1, Math.min(0.99, m.flux + (Math.random() - 0.5) * 0.04)),
      }));
      // 경과 시간
      setElapsed((Date.now() - startedAt) / 1000);
    }, 100);
    return () => clearInterval(id);
  }, []);

  // T+00:00.00s 포맷
  const sec = Math.floor(elapsed);
  const ms = Math.floor((elapsed - sec) * 100);
  const timeStr = `T+${pad(sec)}.${pad(ms)}s`;

  const armed = voiceListening || ttsEnabled;

  return (
    <div className="relative w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 select-none min-w-0">
      {/* 상단 시스템 메트릭 (좌측) */}
      <div className="absolute top-0 left-4 sm:left-6 text-[10px] sm:text-[11px] font-mono leading-tight" style={{
        color: 'var(--jarvis-cyan)',
        textShadow: '0 0 6px rgba(0, 212, 255, 0.35)',
      }}>
        <div>SYS::ONLINE</div>
        <div>CPU::{Math.round(metrics.cpu)}%</div>
        <div>MEM::{metrics.mem.toFixed(1)}GB</div>
        <div>NET::{metrics.net}</div>
        <div className="mt-1 opacity-60">FLUX::{metrics.flux.toFixed(2)}</div>
      </div>

      {/* 상단 우측 카운터 */}
      <div className="absolute top-0 right-4 sm:right-6 text-right text-[10px] sm:text-[11px] font-mono" style={{
        color: 'var(--jarvis-accent)',
        textShadow: '0 0 6px rgba(0, 212, 255, 0.3)',
      }}>
        <div className="flex items-center gap-2 justify-end mb-1 opacity-80">
          {!sfxMuted && <Volume2 className="w-3 h-3" />}
          {ttsEnabled && <span>🔊</span>}
          {voiceListening && (
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#ff3860', boxShadow: '0 0 4px rgba(255,56,96,0.65)' }} />
              <span style={{ color: '#ff3860' }}>REC</span>
            </span>
          )}
        </div>
        <div className="tabular-nums">{timeStr}</div>
      </div>

      {/* JARVIS 타이틀 — 상태별 색상 변화 */}
      <div className="text-center mt-4 sm:mt-6 mb-3">
        <h1 className="text-3xl sm:text-5xl font-black tracking-[0.15em] animate-jarvis-rgb-glitch transition-colors duration-500" style={{
          color: statusColor,
          textShadow: `0 0 12px ${statusColor}e6, 0 0 32px ${statusColor}66`,
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          M.O.V.E
        </h1>
        <div className="text-[10px] sm:text-xs font-mono tracking-[0.4em] mt-2 uppercase" style={{
          color: 'var(--jarvis-text-muted)',
        }}>
          PERSONAL · AI · ASSISTANT
        </div>
      </div>

      {/* Dot Sphere — 깔끔한 단일 컨테이너, 모든 박스 효과 제거 */}
      <div className="relative flex items-center justify-center my-6 sm:my-8">
        <div className="relative" style={{ width: 'min(480px, 78vw)', height: 'min(480px, 78vw)' }}>
          <JarvisDotSphere pointCount={520} size={480} mode={sphereMode} />
          {/* 외계 헥사고날 마커 (4방향) — sphere 주위에 떠있는 데이터 노드 */}
          <HexagonMarker top="-2%" left="50%" translateX="-50%" color={statusColor} delay={0} />
          <HexagonMarker top="50%" left="100%" translateX="-50%" translateY="-50%" color={statusColor} delay={0.5} />
          <HexagonMarker top="102%" left="50%" translateX="-50%" translateY="-100%" color={statusColor} delay={1.0} />
          <HexagonMarker top="50%" left="0%" translateX="-50%" translateY="-50%" color={statusColor} delay={1.5} />
        </div>
      </div>

      {/* 하단 ARMED 상태 */}
      <div className="flex items-center justify-center gap-2 mt-4 sm:mt-6 font-mono text-sm sm:text-base min-w-0 px-2 text-center">
        <span className="inline-block w-2.5 h-2.5 rounded-full animate-jarvis-glow-pulse" style={{
          background: armed ? '#00ff88' : 'rgba(127, 163, 200, 0.6)',
          boxShadow: armed
            ? '0 0 10px rgba(0, 255, 136, 0.55), 0 0 18px rgba(0, 255, 136, 0.24)'
            : 'none',
        }} />
        <span style={{
          color: armed ? '#00ff88' : 'var(--jarvis-text-muted)',
          textShadow: armed ? '0 0 6px rgba(0, 255, 136, 0.5)' : 'none',
          fontWeight: 700,
          letterSpacing: '0.15em',
        }}>
          {voiceListening ? 'LISTENING · 음성 인식 중' : armed ? 'ARMED · 음성 입력 대기' : 'STANDBY · 입력 대기'}
        </span>
      </div>
    </div>
  );
}
