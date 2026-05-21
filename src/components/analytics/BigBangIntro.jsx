// 우주 빅뱅 진입 애니메이션 — 영화 인트로급 고급 시퀀스
// Phase 1 (0~0.4s):   특이점 단일 빛점 + accretion ring (시간이 시작됨)
// Phase 2 (0.4~1.0s): 빅뱅 폭발 (입자 + 충격파 + chromatic shockwave)
// Phase 3 (1.0~1.8s): nebula 형성 (입자 모임 + 빛 회복)
// Phase 4 (1.8~2.6s): M.O.V.E 로고 형성 (글리치 + scan + 발광)
// Phase 5 (2.6~3.2s): 페이드 아웃 → onComplete

import { useEffect, useRef } from 'react';

const TOTAL_DURATION = 3.2;

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
    const N = isMobile ? 400 : 800;

    // 폭발 입자 — Phase 2 시작부터 활성
    const particles = Array.from({ length: N }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 22; // 다양한 거리
      const hue = (() => {
        const r = Math.random();
        if (r < 0.08) return [236, 72, 153];
        if (r < 0.22) return [168, 85, 247];
        if (r < 0.40) return [255, 255, 255];
        if (r < 0.70) return [77, 255, 255];
        return [0, 212, 255];
      })();
      return {
        // 시작 위치는 중심, 시작 시간은 Phase 2 진입 후
        startX: 0, startY: 0,
        angle, speed,
        size: 0.5 + Math.random() * 2.8,
        hue,
        phase: Math.random() * Math.PI * 2,
      };
    });

    // 부동 후방 입자 (Phase 3 nebula)
    const dust = Array.from({ length: isMobile ? 100 : 200 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      size: 0.3 + Math.random() * 0.8,
      alpha: Math.random() * 0.5 + 0.2,
      phase: Math.random() * Math.PI * 2,
    }));

    const startedAt = performance.now();
    let rafId;

    function draw() {
      const elapsed = (performance.now() - startedAt) / 1000;
      const cx = W / 2, cy = H / 2;

      // 배경 (cinematic deep black + 시간대별 색조 변화)
      // Phase 별 배경
      let bgColor = 'rgba(2, 4, 12, 0.32)';
      if (elapsed > 1.0 && elapsed < 1.8) bgColor = 'rgba(5, 10, 24, 0.22)'; // nebula
      else if (elapsed > 1.8) bgColor = 'rgba(2, 6, 16, 0.18)';
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, W, H);

      // ============ Phase 1: 특이점 (0~0.4s) ============
      if (elapsed < 0.4) {
        const k = elapsed / 0.4;
        // 작은 빛점 → 점진 확장
        const r = k * Math.min(W, H) * 0.04;
        // 코어
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 8);
        coreGrad.addColorStop(0, `rgba(255, 255, 255, ${0.5 + k * 0.5})`);
        coreGrad.addColorStop(0.2, `rgba(220, 245, 255, ${0.3 + k * 0.4})`);
        coreGrad.addColorStop(0.5, `rgba(77, 255, 255, ${0.2 + k * 0.3})`);
        coreGrad.addColorStop(1, 'rgba(0, 212, 255, 0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 8, 0, Math.PI * 2);
        ctx.fill();
        // 회전 accretion ring (가속)
        const ringAngle = elapsed * 12;
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2 + ringAngle;
          const rx = cx + Math.cos(a) * r * 4;
          const ry = cy + Math.sin(a) * r * 4 * 0.4; // 타원
          ctx.fillStyle = `rgba(77, 255, 255, ${0.6 * k})`;
          ctx.beginPath();
          ctx.arc(rx, ry, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ============ Phase 2: 폭발 (0.4~1.4s) ============
      if (elapsed >= 0.4) {
        const explosionT = (elapsed - 0.4);
        // 충격파 3중 (chromatic)
        const shockwaves = [
          { offset: 0, hue: [255, 255, 255], width: 4 },
          { offset: 0.08, hue: [77, 255, 255], width: 2.5 },
          { offset: 0.16, hue: [168, 85, 247], width: 1.5 },
        ];
        for (const sw of shockwaves) {
          const t0 = Math.max(0, explosionT - sw.offset);
          if (t0 < 1.2) {
            const radius = t0 * Math.min(W, H) * 0.7;
            const alpha = Math.max(0, 1 - t0 / 1.2) * 0.7;
            ctx.strokeStyle = `rgba(${sw.hue[0]}, ${sw.hue[1]}, ${sw.hue[2]}, ${alpha})`;
            ctx.lineWidth = sw.width * (1 - t0 / 1.4);
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        // 입자 폭발
        const dampStart = 0.7;
        for (const p of particles) {
          const t1 = Math.max(0, explosionT);
          if (t1 <= 0) continue;
          // damping (시간 따라 속도 감소)
          const decel = t1 < dampStart ? 1 : Math.pow(0.93, (t1 - dampStart) * 60);
          const dist = p.speed * t1 * 60 * (1 - Math.pow(1 - Math.min(1, t1 / dampStart), 2)) * 0.3;
          const x = cx + Math.cos(p.angle) * dist * (0.5 + decel * 0.5);
          const y = cy + Math.sin(p.angle) * dist * (0.5 + decel * 0.5);
          // alpha
          const fadeIn = Math.min(1, t1 / 0.1);
          const fadeOut = explosionT > 1.0 ? Math.max(0, 1 - (explosionT - 1.0) / 0.8) : 1;
          const alpha = fadeIn * fadeOut * (0.6 + Math.sin(t1 * 8 + p.phase) * 0.4);
          const sz = p.size * (0.6 + decel * 0.4);
          // glow
          if (p.size > 1.5) {
            const grad = ctx.createRadialGradient(x, y, 0, x, y, sz * 5);
            grad.addColorStop(0, `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${alpha * 0.7})`);
            grad.addColorStop(1, `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, 0)`);
            ctx.fillStyle = grad;
            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath();
            ctx.arc(x, y, sz * 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          }
          ctx.fillStyle = `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, sz, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ============ Phase 3: Nebula (1.0~1.8s) ============
      if (elapsed >= 1.0 && elapsed < 2.0) {
        const nebulaT = (elapsed - 1.0) / 0.8;
        const fade = Math.sin(nebulaT * Math.PI); // 0→1→0
        const nebulaAlpha = fade * 0.4;
        // 거대 nebula (cyan + purple)
        ctx.globalCompositeOperation = 'lighter';
        const neb1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.4);
        neb1.addColorStop(0, `rgba(0, 212, 255, ${nebulaAlpha * 0.5})`);
        neb1.addColorStop(0.5, `rgba(0, 212, 255, ${nebulaAlpha * 0.15})`);
        neb1.addColorStop(1, 'rgba(0, 212, 255, 0)');
        ctx.fillStyle = neb1;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(W, H) * 0.4, 0, Math.PI * 2);
        ctx.fill();
        const neb2 = ctx.createRadialGradient(cx + 60, cy - 40, 0, cx + 60, cy - 40, Math.min(W, H) * 0.3);
        neb2.addColorStop(0, `rgba(168, 85, 247, ${nebulaAlpha * 0.4})`);
        neb2.addColorStop(1, 'rgba(168, 85, 247, 0)');
        ctx.fillStyle = neb2;
        ctx.beginPath();
        ctx.arc(cx + 60, cy - 40, Math.min(W, H) * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }

      // ============ 후방 dust (Phase 2+ 부터 등장) ============
      if (elapsed > 0.6) {
        const dustAlpha = Math.min(1, (elapsed - 0.6) / 0.4) * (elapsed > 2.6 ? Math.max(0, 1 - (elapsed - 2.6) / 0.6) : 1);
        for (const d of dust) {
          d.phase += 0.02;
          const twinkle = 0.5 + Math.sin(d.phase) * 0.5;
          ctx.fillStyle = `rgba(180, 220, 255, ${d.alpha * twinkle * dustAlpha})`;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ============ Phase 4: M.O.V.E 로고 (1.6~2.8s) ============
      if (elapsed >= 1.6) {
        const logoT = Math.min(1, (elapsed - 1.6) / 0.6);
        const globalAlpha = elapsed > 2.6 ? Math.max(0, 1 - (elapsed - 2.6) / 0.6) : 1;
        const sFactor = isMobile ? 0.55 : 1;
        ctx.save();
        ctx.font = `bold ${Math.round(72 * sFactor)}px JetBrains Mono, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // RGB chromatic glitch (logoT < 0.4)
        if (logoT < 0.4) {
          const shift = (1 - logoT / 0.4) * 6;
          ctx.fillStyle = `rgba(236, 72, 153, ${logoT * 0.7 * globalAlpha})`;
          ctx.fillText('M.O.V.E', cx - shift, cy - 10);
          ctx.fillStyle = `rgba(0, 212, 255, ${logoT * 0.7 * globalAlpha})`;
          ctx.fillText('M.O.V.E', cx + shift, cy - 10);
        }
        // 주 텍스트 (밝게)
        ctx.shadowColor = '#00d4ff';
        ctx.shadowBlur = 32;
        ctx.fillStyle = `rgba(232, 244, 253, ${logoT * globalAlpha})`;
        ctx.fillText('M.O.V.E', cx, cy - 10);
        ctx.shadowBlur = 0;
        // 보조 텍스트
        if (logoT > 0.3) {
          const subT = (logoT - 0.3) / 0.7;
          ctx.font = `${Math.round(14 * sFactor)}px JetBrains Mono, monospace`;
          ctx.fillStyle = `rgba(127, 163, 200, ${subT * globalAlpha * 0.9})`;
          ctx.fillText('MOVIS · QUANTUM AI · INITIALIZING', cx, cy + 36 * sFactor);
          // 진행 바
          if (subT > 0.3) {
            const barT = (subT - 0.3) / 0.7;
            const barW = 180 * sFactor;
            const barX = cx - barW / 2;
            const barY = cy + 60 * sFactor;
            ctx.strokeStyle = `rgba(0, 212, 255, ${0.4 * globalAlpha})`;
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barW, 4);
            ctx.fillStyle = `rgba(77, 255, 255, ${0.9 * globalAlpha})`;
            ctx.fillRect(barX, barY, barW * barT, 4);
          }
        }
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
