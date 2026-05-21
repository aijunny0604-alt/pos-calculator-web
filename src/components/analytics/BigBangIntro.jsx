// 양자 빅뱅 진입 애니메이션 — 단순 3-Phase (1.8초)
// Phase 1 (0~0.4s):  특이점 + 빅뱅 폭발 (입자 사방 + 충격파)
// Phase 2 (0.4~1.2s): 입자가 sphere로 응축 + M.O.V.E 로고
// Phase 3 (1.2~1.8s): 페이드 아웃

import { useEffect, useRef } from 'react';

const TOTAL_DURATION = 1.8;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

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
    const golden = Math.PI * (3 - Math.sqrt(5));
    const particles = Array.from({ length: N }, (_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 18;
      // sphere 응축 목표 좌표 (Fibonacci)
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = golden * i;
      return {
        angle, speed,
        size: 0.6 + Math.random() * 2.2,
        hue: (() => {
          const rr = Math.random();
          if (rr < 0.1) return [168, 85, 247];   // purple
          if (rr < 0.25) return [255, 255, 255]; // white
          if (rr < 0.55) return [77, 255, 255];  // soft cyan
          return [0, 212, 255];                  // cyan
        })(),
        // sphere 좌표
        sx: Math.cos(theta) * r,
        sy: y,
        sz: Math.sin(theta) * r,
        phase: Math.random() * Math.PI * 2,
      };
    });

    const startedAt = performance.now();
    let rafId;

    function draw() {
      const elapsed = (performance.now() - startedAt) / 1000;
      const cx = W / 2, cy = H / 2;

      // 배경 motion trail
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(0, 0, W, H);

      // ============ Phase 1: 빅뱅 폭발 (0~0.4s) ============
      if (elapsed < 0.4) {
        const t = elapsed / 0.4;
        // 중심 코어
        const coreSize = (1 - t * 0.5) * Math.min(W, H) * 0.06 + t * 30;
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize * 4);
        coreGrad.addColorStop(0, `rgba(255, 255, 255, ${0.8 - t * 0.3})`);
        coreGrad.addColorStop(0.3, `rgba(77, 255, 255, ${0.5 - t * 0.3})`);
        coreGrad.addColorStop(1, 'rgba(0, 212, 255, 0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, coreSize * 4, 0, Math.PI * 2);
        ctx.fill();
        // 충격파 (1개만 — 단순)
        const shockR = t * Math.min(W, H) * 0.5;
        ctx.strokeStyle = `rgba(77, 255, 255, ${(1 - t) * 0.8})`;
        ctx.lineWidth = 3 * (1 - t);
        ctx.beginPath();
        ctx.arc(cx, cy, shockR, 0, Math.PI * 2);
        ctx.stroke();
        // 입자 폭발
        for (const p of particles) {
          const dist = p.speed * t * 70 * easeOutCubic(t);
          const x = cx + Math.cos(p.angle) * dist;
          const y = cy + Math.sin(p.angle) * dist;
          const alpha = 0.6 + Math.sin(t * 6 + p.phase) * 0.4;
          ctx.fillStyle = `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ============ Phase 2: sphere 응축 + 로고 (0.4~1.2s) ============
      else if (elapsed < 1.2) {
        const t = (elapsed - 0.4) / 0.8;
        const eased = easeOutCubic(t);
        const sphereRadius = Math.min(W, H) * 0.16;
        // 입자 응축 (현재 폭발 위치 → sphere)
        for (const p of particles) {
          // 폭발 종료 위치 (Phase 1 끝 기준)
          const explodedDist = p.speed * 0.4 * 70 * easeOutCubic(1);
          const startX = cx + Math.cos(p.angle) * explodedDist;
          const startY = cy + Math.sin(p.angle) * explodedDist;
          // sphere 회전 (Phase 2 동안 천천히)
          const rotY = elapsed * 0.8;
          const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
          const tx = p.sx * cosY - p.sz * sinY;
          const targetX = cx + tx * sphereRadius;
          const targetY = cy + p.sy * sphereRadius;
          const x = startX + (targetX - startX) * eased;
          const y = startY + (targetY - startY) * eased;
          const alpha = 0.7 + Math.sin(elapsed * 4 + p.phase) * 0.3;
          // 글로우 (큰 입자만)
          if (p.size > 1.4 && eased > 0.5) {
            const grad = ctx.createRadialGradient(x, y, 0, x, y, p.size * 4);
            grad.addColorStop(0, `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${alpha * 0.5})`);
            grad.addColorStop(1, `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, 0)`);
            ctx.fillStyle = grad;
            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath();
            ctx.arc(x, y, p.size * 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          }
          ctx.fillStyle = `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        // M.O.V.E 로고 (Phase 2 중반부터)
        if (t > 0.4) {
          const logoT = (t - 0.4) / 0.6;
          const sFactor = isMobile ? 0.55 : 1;
          ctx.save();
          ctx.font = `bold ${Math.round(64 * sFactor)}px JetBrains Mono, monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = '#00d4ff';
          ctx.shadowBlur = 24;
          ctx.fillStyle = `rgba(232, 244, 253, ${logoT})`;
          ctx.fillText('M.O.V.E', cx, cy - sphereRadius - 50 * sFactor);
          ctx.shadowBlur = 0;
          ctx.font = `${Math.round(11 * sFactor)}px JetBrains Mono, monospace`;
          ctx.fillStyle = `rgba(0, 255, 136, ${logoT * 0.85})`;
          ctx.fillText('● MOVIS QUANTUM AI ONLINE', cx, cy + sphereRadius + 40 * sFactor);
          ctx.restore();
        }
      }

      // ============ Phase 3: 페이드 아웃 (1.2~1.8s) ============
      else {
        const t = (elapsed - 1.2) / 0.6;
        const globalAlpha = 1 - t;
        const sphereRadius = Math.min(W, H) * 0.16;
        const rotY = elapsed * 0.8;
        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        for (const p of particles) {
          const tx = p.sx * cosY - p.sz * sinY;
          const x = cx + tx * sphereRadius;
          const y = cy + p.sy * sphereRadius;
          ctx.fillStyle = `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${0.7 * globalAlpha})`;
          ctx.beginPath();
          ctx.arc(x, y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        // 로고도 페이드
        const sFactor = isMobile ? 0.55 : 1;
        ctx.save();
        ctx.font = `bold ${Math.round(64 * sFactor)}px JetBrains Mono, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#00d4ff';
        ctx.shadowBlur = 20;
        ctx.fillStyle = `rgba(232, 244, 253, ${globalAlpha})`;
        ctx.fillText('M.O.V.E', cx, cy - sphereRadius - 50 * sFactor);
        ctx.shadowBlur = 0;
        ctx.font = `${Math.round(11 * sFactor)}px JetBrains Mono, monospace`;
        ctx.fillStyle = `rgba(0, 255, 136, ${globalAlpha * 0.85})`;
        ctx.fillText('● MOVIS QUANTUM AI ONLINE', cx, cy + sphereRadius + 40 * sFactor);
        ctx.restore();
      }

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
