// 자비스 영화 스타일 전체 스탠바이 화면
// JARVIS 타이틀 + 시스템 메트릭 + dot sphere + ARMED 상태

import { useEffect, useState } from 'react';
import { Play, Volume2 } from 'lucide-react';
import JarvisDotSphere from './JarvisDotSphere';

function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

export default function JarvisStandby({ voiceListening, ttsEnabled, sfxMuted }) {
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
    <div className="relative w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 select-none">
      {/* 상단 시스템 메트릭 (좌측) */}
      <div className="absolute top-0 left-4 sm:left-6 text-[10px] sm:text-[11px] font-mono leading-tight" style={{
        color: 'rgba(0, 212, 255, 0.85)',
        textShadow: '0 0 6px rgba(0, 212, 255, 0.5)',
      }}>
        <div>SYS::ONLINE</div>
        <div>CPU::{Math.round(metrics.cpu)}%</div>
        <div>MEM::{metrics.mem.toFixed(1)}GB</div>
        <div>NET::{metrics.net}</div>
        <div className="mt-1 opacity-60">FLUX::{metrics.flux.toFixed(2)}</div>
      </div>

      {/* 상단 우측 카운터 */}
      <div className="absolute top-0 right-4 sm:right-6 text-right text-[10px] sm:text-[11px] font-mono" style={{
        color: 'rgba(77, 255, 255, 0.7)',
        textShadow: '0 0 6px rgba(0, 212, 255, 0.4)',
      }}>
        <div className="flex items-center gap-2 justify-end mb-1 opacity-80">
          {!sfxMuted && <Volume2 className="w-3 h-3" />}
          {ttsEnabled && <span>🔊</span>}
          {voiceListening && (
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#ff3860', boxShadow: '0 0 4px #ff3860' }} />
              <span style={{ color: '#ff3860' }}>REC</span>
            </span>
          )}
        </div>
        <div className="tabular-nums">{timeStr}</div>
      </div>

      {/* JARVIS 타이틀 */}
      <div className="text-center mt-4 sm:mt-6 mb-3">
        <h1 className="text-3xl sm:text-5xl font-black tracking-[0.15em] animate-jarvis-rgb-glitch" style={{
          color: '#00d4ff',
          textShadow: '0 0 12px rgba(0, 212, 255, 0.9), 0 0 32px rgba(0, 212, 255, 0.4)',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          M.O.V.E
        </h1>
        <div className="text-[10px] sm:text-xs font-mono tracking-[0.4em] mt-1.5 uppercase" style={{
          color: 'rgba(232, 244, 253, 0.7)',
        }}>
          PERSONAL · AI · ASSISTANT
        </div>
      </div>

      {/* Dot Sphere */}
      <div className="relative flex items-center justify-center my-6 sm:my-8">
        <div className="relative" style={{ width: 'min(480px, 78vw)', height: 'min(480px, 78vw)' }}>
          <JarvisDotSphere pointCount={520} size={480} />
          {/* 외곽 미세 글로우 ring */}
          <div className="absolute inset-0 rounded-full pointer-events-none" style={{
            boxShadow: 'inset 0 0 80px rgba(0, 212, 255, 0.08), 0 0 80px rgba(0, 212, 255, 0.15)',
          }} />
        </div>
      </div>

      {/* 하단 ARMED 상태 */}
      <div className="flex items-center justify-center gap-2 mt-4 sm:mt-6 font-mono text-sm sm:text-base">
        <span className="inline-block w-2.5 h-2.5 rounded-full animate-jarvis-glow-pulse" style={{
          background: armed ? '#00ff88' : 'rgba(127, 163, 200, 0.6)',
          boxShadow: armed
            ? '0 0 12px #00ff88, 0 0 24px rgba(0, 255, 136, 0.6)'
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
