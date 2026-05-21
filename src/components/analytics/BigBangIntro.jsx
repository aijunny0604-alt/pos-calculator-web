// 양자 입자 가속기 가동 시퀀스 — MOVIS Quantum System Boot
// Phase 1 (0~0.6s): 양자 진공 fluctuation (노이즈 입자 + 가로 scan line)
// Phase 2 (0.6~1.4s): 양자 격자 정렬 (입자들이 grid snap + calibration bar)
// Phase 3 (1.4~2.2s): 얽힘 + 결맞음 (입자 쌍 동시 펄스 + 파동 함수 + 회로 라인)
// Phase 4 (2.2~3.0s): 응축 → 가속 (입자가 중심으로 모임 + chromatic flash)
// Phase 5 (3.0~3.6s): MOVIS 로고 + 페이드 아웃

import { useEffect, useRef } from 'react';

const TOTAL_DURATION = 3.6;

// 양자 입자 클래스 (확률적 점멸 + 얽힘)
function createParticle(W, H) {
  return {
    // 초기 무작위 위치 (양자 진공)
    x0: Math.random() * W,
    y0: Math.random() * H,
    // 격자 snap 목표 (Phase 2)
    gridX: 0, gridY: 0,
    // 응축 시 목표 (Phase 4 — sphere 위치)
    finalAngle: Math.random() * Math.PI * 2,
    finalRadius: 0,
    size: 0.4 + Math.random() * 1.4,
    hue: (() => {
      const r = Math.random();
      if (r < 0.08) return [236, 72, 153];   // magenta
      if (r < 0.22) return [168, 85, 247];   // purple
      if (r < 0.40) return [255, 255, 255];  // white
      if (r < 0.70) return [77, 255, 255];   // soft cyan
      return [0, 212, 255];                  // cyan
    })(),
    phase: Math.random() * Math.PI * 2,
    flickerThreshold: 0.7 + Math.random() * 0.25,
    // 얽힘 파트너 (Phase 3에서 같이 펄스)
    partnerIdx: -1,
  };
}

// easing
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export default function BigBangIntro({ onComplete }) {
  const canvasRef = useRef(null);
  const completedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = canvas.clientWidth;
    let H = canvas.clientHeight;
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    const isMobile = window.innerWidth < 640;
    const N = isMobile ? 240 : 480;

    // 입자 생성
    const particles = Array.from({ length: N }, () => createParticle(W, H));

    // 격자 좌표 계산 (12 × 9 grid 정도)
    const cols = isMobile ? 10 : 16;
    const rows = isMobile ? 8 : 11;
    const gridSpaceX = W / (cols + 1);
    const gridSpaceY = H / (rows + 1);
    particles.forEach((p, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols) % rows;
      p.gridX = gridSpaceX * (col + 1);
      p.gridY = gridSpaceY * (row + 1);
    });

    // 얽힘 파트너 (랜덤 페어)
    const shuffled = [...Array(particles.length).keys()].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length - 1; i += 2) {
      particles[shuffled[i]].partnerIdx = shuffled[i + 1];
      particles[shuffled[i + 1]].partnerIdx = shuffled[i];
    }

    // 최종 sphere 응축 좌표 (Fibonacci sphere 투영)
    const golden = Math.PI * (3 - Math.sqrt(5));
    particles.forEach((p, i) => {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = golden * i;
      p.sphereX = Math.cos(theta) * r;
      p.sphereY = y;
      p.sphereZ = Math.sin(theta) * r;
    });

    const startedAt = performance.now();
    let rafId;

    function draw() {
      const elapsed = (performance.now() - startedAt) / 1000;
      const cx = W / 2, cy = H / 2;

      // 배경 fade (motion trail)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.fillRect(0, 0, W, H);

      // ============ Phase 1: 양자 진공 (0~0.6s) ============
      if (elapsed < 0.6) {
        const k = elapsed / 0.6;
        // 노이즈 입자 (전역 jitter)
        for (const p of particles) {
          const jx = Math.sin(elapsed * 8 + p.phase * 3) * 12;
          const jy = Math.cos(elapsed * 7 + p.phase * 2) * 12;
          const x = p.x0 + jx;
          const y = p.y0 + jy;
          const flicker = Math.sin(elapsed * 12 + p.phase) > p.flickerThreshold - 0.3 ? 1 : 0.3;
          const alpha = 0.4 * k * flicker;
          ctx.fillStyle = `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, p.size * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
        // 가로 scan line (양자 측정)
        const scanY = (k * 1.2) * H;
        const scanGrad = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
        scanGrad.addColorStop(0, 'rgba(77, 255, 255, 0)');
        scanGrad.addColorStop(0.5, 'rgba(77, 255, 255, 0.6)');
        scanGrad.addColorStop(1, 'rgba(77, 255, 255, 0)');
        ctx.fillStyle = scanGrad;
        ctx.fillRect(0, scanY - 30, W, 60);
        // 텍스트
        drawSystemText(ctx, cx, cy - 60, 'INITIALIZING QUANTUM SYSTEM', k * 0.9, isMobile);
        drawDiagnostic(ctx, cx, cy - 30, 'VACUUM FLUCTUATIONS: NOMINAL', k, isMobile, 'center');
        drawDiagnostic(ctx, cx, cy - 12, `PARTICLES DETECTED: ${Math.floor(k * N)}/${N}`, k, isMobile, 'center');
      }

      // ============ Phase 2: 양자 격자 정렬 (0.6~1.4s) ============
      else if (elapsed < 1.4) {
        const t = (elapsed - 0.6) / 0.8;
        const eased = easeInOutCubic(t);
        // 격자 라인 (점진)
        ctx.strokeStyle = `rgba(0, 212, 255, ${0.15 * t})`;
        ctx.lineWidth = 0.5;
        for (let c = 1; c <= cols; c++) {
          ctx.beginPath();
          ctx.moveTo(gridSpaceX * c, 0);
          ctx.lineTo(gridSpaceX * c, H);
          ctx.stroke();
        }
        for (let r = 1; r <= rows; r++) {
          ctx.beginPath();
          ctx.moveTo(0, gridSpaceY * r);
          ctx.lineTo(W, gridSpaceY * r);
          ctx.stroke();
        }
        // 입자: 무작위 → 격자 snap
        for (const p of particles) {
          const x = p.x0 + (p.gridX - p.x0) * eased;
          const y = p.y0 + (p.gridY - p.y0) * eased;
          const flicker = Math.sin(elapsed * 10 + p.phase) > p.flickerThreshold - 0.2 ? 1 : 0.5;
          const alpha = (0.4 + t * 0.4) * flicker;
          // 격자 snap 도착 시 sparkle
          if (t > 0.9) {
            const grad = ctx.createRadialGradient(x, y, 0, x, y, p.size * 5);
            grad.addColorStop(0, `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${alpha * 0.6})`);
            grad.addColorStop(1, `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, 0)`);
            ctx.fillStyle = grad;
            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath();
            ctx.arc(x, y, p.size * 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          }
          ctx.fillStyle = `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        drawSystemText(ctx, cx, cy - 60, 'ALIGNING QUANTUM FIELD', 1, isMobile);
        drawDiagnostic(ctx, cx, cy - 30, 'QUANTUM FIELD: STABILIZING', 1, isMobile, 'center');
        drawDiagnostic(ctx, cx, cy - 12, `LATTICE SYNC: ${Math.floor(t * 100)}%`, 1, isMobile, 'center');
        // 중앙 calibration bar
        drawCalibrationBar(ctx, cx - 90, cy + 10, 180, t, '#00d4ff', isMobile);
      }

      // ============ Phase 3: 얽힘 + 결맞음 (1.4~2.2s) ============
      else if (elapsed < 2.2) {
        const t = (elapsed - 1.4) / 0.8;
        const coherenceAlpha = Math.sin(t * Math.PI); // 0→1→0
        // 격자 fade out
        if (t < 0.5) {
          ctx.strokeStyle = `rgba(0, 212, 255, ${0.15 * (1 - t * 2)})`;
          ctx.lineWidth = 0.5;
          for (let c = 1; c <= cols; c++) {
            ctx.beginPath();
            ctx.moveTo(gridSpaceX * c, 0);
            ctx.lineTo(gridSpaceX * c, H);
            ctx.stroke();
          }
          for (let r = 1; r <= rows; r++) {
            ctx.beginPath();
            ctx.moveTo(0, gridSpaceY * r);
            ctx.lineTo(W, gridSpaceY * r);
            ctx.stroke();
          }
        }
        // 입자: 격자 위에서 wave 진동 (양자 결맞음)
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          const waveX = Math.sin(elapsed * 4 + p.gridY * 0.02) * 18 * coherenceAlpha;
          const waveY = Math.cos(elapsed * 4 + p.gridX * 0.02) * 18 * coherenceAlpha;
          const x = p.gridX + waveX;
          const y = p.gridY + waveY;
          // 얽힘 파트너와 동기 펄스
          const partner = p.partnerIdx >= 0 ? particles[p.partnerIdx] : null;
          const entAlpha = partner ? 0.6 + Math.sin(elapsed * 3 + p.partnerIdx * 0.5) * 0.4 : 0.8;
          const alpha = 0.8 * entAlpha;
          // 얽힘 라인 (i < partner.idx 로 한 번만 그림)
          if (partner && i < p.partnerIdx) {
            const px = partner.gridX + Math.sin(elapsed * 4 + partner.gridY * 0.02) * 18 * coherenceAlpha;
            const py = partner.gridY + Math.cos(elapsed * 4 + partner.gridX * 0.02) * 18 * coherenceAlpha;
            const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
            if (dist < 250) {
              ctx.strokeStyle = `rgba(168, 85, 247, ${(1 - dist / 250) * 0.3 * coherenceAlpha})`;
              ctx.lineWidth = 0.5;
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(px, py);
              ctx.stroke();
            }
          }
          // 입자 글로우
          if (p.size > 1) {
            const grad = ctx.createRadialGradient(x, y, 0, x, y, p.size * 5);
            grad.addColorStop(0, `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${alpha * 0.5})`);
            grad.addColorStop(1, `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, 0)`);
            ctx.fillStyle = grad;
            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath();
            ctx.arc(x, y, p.size * 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          }
          ctx.fillStyle = `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, p.size, 0, Math.PI * 2);
          ctx.fill();
          // 진동 위치 저장 (Phase 4용)
          p.lastX = x;
          p.lastY = y;
        }
        drawSystemText(ctx, cx, cy - 60, 'ENTANGLING PARTICLES', 1, isMobile);
        drawDiagnostic(ctx, cx, cy - 30, 'COHERENCE: STABLE', 1, isMobile, 'center');
        drawDiagnostic(ctx, cx, cy - 12, `ENTANGLEMENT PAIRS: ${Math.floor(N / 2)}`, 1, isMobile, 'center');
        drawCalibrationBar(ctx, cx - 90, cy + 10, 180, 1, '#00ff88', isMobile);
        // wave function visualization (중앙 아래)
        ctx.strokeStyle = `rgba(0, 212, 255, ${0.5 * coherenceAlpha})`;
        ctx.lineWidth = 1;
        const waveW = isMobile ? 160 : 200;
        const waveStart = cx - waveW / 2;
        ctx.beginPath();
        for (let x = waveStart; x < waveStart + waveW; x += 2) {
          const wx = x - waveStart;
          const y = cy + 40 + Math.sin(wx * 0.08 + elapsed * 5) * 10 + Math.sin(wx * 0.3) * 4;
          if (x === waveStart) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        drawDiagnostic(ctx, cx, cy + 60, 'ψ(x,t) WAVE FUNCTION', 1, isMobile, 'center');
      }

      // ============ Phase 4: 응축 → 가속 (2.2~3.0s) ============
      else if (elapsed < 3.0) {
        const t = (elapsed - 2.2) / 0.8;
        const eased = easeOutCubic(t);
        const sphereRadius = Math.min(W, H) * 0.18;
        // 입자: 격자 위치 → sphere 위치로 응축
        for (const p of particles) {
          const startX = p.lastX ?? p.gridX;
          const startY = p.lastY ?? p.gridY;
          const targetX = cx + p.sphereX * sphereRadius;
          const targetY = cy + p.sphereY * sphereRadius;
          const x = startX + (targetX - startX) * eased;
          const y = startY + (targetY - startY) * eased;
          const alpha = 0.6 + t * 0.4;
          const sz = p.size * (1 + t * 0.5);
          // 강한 글로우 (응축)
          if (t > 0.3) {
            const grad = ctx.createRadialGradient(x, y, 0, x, y, sz * 6);
            grad.addColorStop(0, `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${alpha * 0.7 * (t - 0.3) / 0.7})`);
            grad.addColorStop(1, `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, 0)`);
            ctx.fillStyle = grad;
            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath();
            ctx.arc(x, y, sz * 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          }
          ctx.fillStyle = `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, sz, 0, Math.PI * 2);
          ctx.fill();
        }
        // 응축 완료 시 chromatic flash
        if (t > 0.85) {
          const flashT = (t - 0.85) / 0.15;
          const flashAlpha = Math.sin(flashT * Math.PI) * 0.5;
          ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha * 0.3})`;
          ctx.fillRect(0, 0, W, H);
          // chromatic ring
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 3; i++) {
            const hueRing = [[255, 255, 255], [77, 255, 255], [168, 85, 247]][i];
            ctx.strokeStyle = `rgba(${hueRing[0]}, ${hueRing[1]}, ${hueRing[2]}, ${flashAlpha * 0.8})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, sphereRadius + i * 8 + flashT * 60, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        drawSystemText(ctx, cx, cy - 60, 'QUANTUM CORE ACCELERATING', 1, isMobile);
        drawDiagnostic(ctx, cx, cy - 30, `ENERGY: ${Math.floor(t * 100)}%`, 1, isMobile, 'center');
        drawDiagnostic(ctx, cx, cy - 12, 'CORE TEMP: 2.7K', 1, isMobile, 'center');
        drawCalibrationBar(ctx, cx - 90, cy + 10, 180, 1, '#ffaa00', isMobile);
      }

      // ============ Phase 5: MOVIS 로고 + 페이드 (3.0~3.6s) ============
      else {
        const t = (elapsed - 3.0) / 0.6;
        const globalAlpha = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
        const sphereRadius = Math.min(W, H) * 0.18;
        // 입자는 sphere 위치 유지 + 천천히 회전
        const rotation = elapsed * 0.3;
        const cosR = Math.cos(rotation), sinR = Math.sin(rotation);
        for (const p of particles) {
          const sx = p.sphereX * cosR - p.sphereZ * sinR;
          const sz = p.sphereX * sinR + p.sphereZ * cosR;
          const x = cx + sx * sphereRadius;
          const y = cy + p.sphereY * sphereRadius;
          const depth = (sz + 1) / 2;
          const alpha = (0.4 + depth * 0.6) * globalAlpha;
          ctx.fillStyle = `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, p.size * (0.5 + depth * 0.7), 0, Math.PI * 2);
          ctx.fill();
        }
        // 로고
        const sFactor = isMobile ? 0.55 : 1;
        ctx.save();
        ctx.font = `bold ${Math.round(72 * sFactor)}px JetBrains Mono, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // RGB chromatic (초기 진입)
        if (t < 0.3) {
          const shift = (1 - t / 0.3) * 5;
          ctx.fillStyle = `rgba(236, 72, 153, ${(t / 0.3) * 0.6 * globalAlpha})`;
          ctx.fillText('M.O.V.E', cx - shift, cy - 80);
          ctx.fillStyle = `rgba(0, 212, 255, ${(t / 0.3) * 0.6 * globalAlpha})`;
          ctx.fillText('M.O.V.E', cx + shift, cy - 80);
        }
        ctx.shadowColor = '#00d4ff';
        ctx.shadowBlur = 28;
        ctx.fillStyle = `rgba(232, 244, 253, ${Math.min(1, t * 2) * globalAlpha})`;
        ctx.fillText('M.O.V.E', cx, cy - 80);
        ctx.shadowBlur = 0;
        ctx.font = `${Math.round(12 * sFactor)}px JetBrains Mono, monospace`;
        ctx.fillStyle = `rgba(0, 255, 136, ${globalAlpha * 0.9})`;
        ctx.fillText('● SYSTEM ONLINE', cx, cy + sphereRadius + 50 * sFactor);
        ctx.restore();
      }

      // 종료
      if (elapsed > TOTAL_DURATION) {
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
        return;
      }
      rafId = requestAnimationFrame(draw);
    }
    rafId = requestAnimationFrame(draw);

    const onResize = () => resize();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none" style={{
      background: '#000000',
    }}>
      <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
    </div>
  );
}

// 헬퍼: 시스템 텍스트 (페이드)
function drawSystemText(ctx, x, y, text, alpha, isMobile) {
  ctx.save();
  const size = isMobile ? 14 : 18;
  ctx.font = `bold ${size}px JetBrains Mono, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#00d4ff';
  ctx.shadowBlur = 12;
  ctx.fillStyle = `rgba(0, 212, 255, ${alpha})`;
  ctx.fillText(`▸ ${text}`, x, y);
  ctx.restore();
}

// 헬퍼: 진단 텍스트 (좌상단)
function drawDiagnostic(ctx, x, y, text, alpha, isMobile, align = 'left') {
  ctx.save();
  ctx.font = `${isMobile ? 9 : 10}px JetBrains Mono, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = `rgba(127, 163, 200, ${alpha * 0.9})`;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// 헬퍼: calibration bar
function drawCalibrationBar(ctx, x, y, width, fillRatio, color, isMobile) {
  ctx.save();
  const height = 4;
  ctx.strokeStyle = 'rgba(127, 163, 200, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * fillRatio, height);
  // 글로우
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * fillRatio, height);
  ctx.restore();
}
