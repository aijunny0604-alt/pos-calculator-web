// 우주 빅뱅 진입 애니메이션 — Canvas 폭발 효과
// 1) 0~0.2s: 화면 중앙 흰 점 + 빠른 확장
// 2) 0.2~0.8s: 입자 사방 폭발 + 충격파 ripple
// 3) 0.8~1.6s: 입자 속도 감소 + JARVIS 로고 형성
// 4) 1.6~2.2s: 페이드 아웃 → onComplete

import { useEffect, useRef } from 'react';

export default function BigBangIntro({ onComplete }) {
  const canvasRef = useRef(null);
  const completedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 항상 재생 (사용자가 데모/퍼포먼스 효과로 요청)
    // reduced motion이어도 단순 빅뱅 시연은 진행 (1.5초 짧게)

    let W = canvas.clientWidth;
    let H = canvas.clientHeight;
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    // 폭발 입자 생성 (500개)
    const N = window.innerWidth < 640 ? 300 : 600;
    const particles = Array.from({ length: N }, () => {
      const angle = Math.random() * Math.PI * 2;
      // 속도 다양화 (다양한 거리로 퍼짐)
      const speed = 4 + Math.random() * 16;
      const hue = (() => {
        const r = Math.random();
        if (r < 0.1) return [236, 72, 153];      // magenta
        if (r < 0.25) return [168, 85, 247];     // purple
        if (r < 0.45) return [255, 255, 255];    // white
        if (r < 0.7) return [77, 255, 255];      // soft cyan
        return [0, 212, 255];                    // cyan
      })();
      return {
        x: W / 2, y: H / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 0.5 + Math.random() * 2.5,
        hue,
        alpha: 1,
        decay: 0.005 + Math.random() * 0.012,
      };
    });

    // 충격파 ripple
    const ripples = [];
    let lastRipple = 0;

    const startedAt = performance.now();
    let rafId;

    function frame() {
      const t = (performance.now() - startedAt) / 1000;
      // 단계별 처리
      const elapsed = t;

      // motion trail
      ctx.fillStyle = 'rgba(2, 6, 16, 0.18)';
      ctx.fillRect(0, 0, W, H);

      const cx = W / 2, cy = H / 2;

      // 1) 초기 0~0.15초 — 중심 흰 점 폭발
      if (elapsed < 0.15) {
        const k = elapsed / 0.15;
        const r = k * Math.min(W, H) * 0.15;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 4);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
        grad.addColorStop(0.5, 'rgba(77, 255, 255, 0.5)');
        grad.addColorStop(1, 'rgba(0, 212, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2) 충격파 ripple (0.1초 간격으로 3번)
      if (elapsed > 0.05 && elapsed < 0.5 && elapsed - lastRipple > 0.13) {
        lastRipple = elapsed;
        ripples.push({ x: cx, y: cy, age: 0, hue: ripples.length === 0 ? [255, 255, 255] : [77, 255, 255] });
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.age += 1;
        const radius = r.age * 14;
        const alpha = Math.max(0, 1 - r.age / 60);
        if (alpha <= 0) { ripples.splice(i, 1); continue; }
        ctx.strokeStyle = `rgba(${r.hue[0]}, ${r.hue[1]}, ${r.hue[2]}, ${alpha * 0.7})`;
        ctx.lineWidth = 2 + (1 - alpha) * 3;
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';

      // 3) 입자 (속도가 시간에 따라 감소)
      const damp = elapsed < 0.6 ? 1 : Math.max(0.92, 1 - (elapsed - 0.6) * 0.25);
      const globalAlpha = elapsed > 1.4 ? Math.max(0, 1 - (elapsed - 1.4) / 0.8) : 1;
      for (const p of particles) {
        p.vx *= damp;
        p.vy *= damp;
        p.x += p.vx;
        p.y += p.vy;
        p.alpha = Math.max(0, p.alpha - p.decay * 0.5) * globalAlpha;
        if (p.alpha <= 0) continue;
        const sz = p.size * (0.5 + p.alpha * 0.7);
        // 글로우 (큰 입자만)
        if (p.size > 1.2) {
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz * 5);
          grad.addColorStop(0, `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${p.alpha * 0.6})`);
          grad.addColorStop(1, `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, 0)`);
          ctx.fillStyle = grad;
          ctx.globalCompositeOperation = 'lighter';
          ctx.beginPath();
          ctx.arc(p.x, p.y, sz * 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
        // 코어
        ctx.fillStyle = `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4) 0.6~1.6초 — JARVIS 로고 형성 (텍스트 페이드 인)
      if (elapsed > 0.7) {
        const textAlpha = Math.min(1, (elapsed - 0.7) / 0.4) * Math.min(1, globalAlpha * 1.5);
        ctx.save();
        ctx.font = 'bold 64px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // glow
        ctx.shadowColor = '#00d4ff';
        ctx.shadowBlur = 24;
        ctx.fillStyle = `rgba(0, 212, 255, ${textAlpha})`;
        const sFactor = window.innerWidth < 640 ? 0.55 : 1;
        ctx.font = `bold ${Math.round(64 * sFactor)}px JetBrains Mono, monospace`;
        ctx.fillText('M.O.V.E', cx, cy - 10);
        ctx.shadowBlur = 0;
        ctx.font = `${Math.round(12 * sFactor)}px JetBrains Mono, monospace`;
        ctx.fillStyle = `rgba(232, 244, 253, ${textAlpha * 0.8})`;
        ctx.fillText('INITIALIZING · QUANTUM SYSTEM', cx, cy + 28 * sFactor);
        ctx.restore();
      }

      // 종료 조건
      if (elapsed > 2.2) {
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
        return;
      }
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    const onResize = () => resize();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none" style={{
      background: 'radial-gradient(ellipse at center, #0a1929 0%, #050b18 50%, #020610 100%)',
    }}>
      <canvas ref={canvasRef} className="w-full h-full" aria-hidden="true" />
    </div>
  );
}
