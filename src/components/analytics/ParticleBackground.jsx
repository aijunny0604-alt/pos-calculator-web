// 부동 입자 배경 (Canvas 기반, 모바일은 입자 수 감소)
// 시안 입자가 무작위 path로 떠다님 + 미세 별/먼지 효과

import { useEffect, useRef } from 'react';

export default function ParticleBackground({ density = 'auto' }) {
  const canvasRef = useRef(null);
  const reducedMotion = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    if (reducedMotion.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId;
    let particles = [];
    const isMobile = window.innerWidth < 768;
    const targetCount = density === 'low' ? 20 : density === 'high' ? 60 : (isMobile ? 25 : 50);

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.scale(dpr, dpr);
    }

    function createParticle() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3 - 0.05, // 위로 살짝 떠오름
        size: Math.random() * 1.8 + 0.4,
        opacity: Math.random() * 0.5 + 0.2,
        // 입자별 색상: 80% cyan, 15% white, 5% purple
        hue: Math.random() < 0.05 ? 280 : Math.random() < 0.15 ? 200 : 190,
        phase: Math.random() * Math.PI * 2,
      };
    }

    function init() {
      resize();
      particles = Array.from({ length: targetCount }, createParticle);
    }

    function draw() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const t = performance.now() * 0.001;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.phase += 0.01;
        // wrap around
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
        // breathing opacity
        const breath = 0.3 + Math.abs(Math.sin(p.phase)) * 0.7;
        const alpha = p.opacity * breath;

        // glow gradient
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
        gradient.addColorStop(0, `hsla(${p.hue}, 100%, 65%, ${alpha})`);
        gradient.addColorStop(0.4, `hsla(${p.hue}, 100%, 55%, ${alpha * 0.3})`);
        gradient.addColorStop(1, `hsla(${p.hue}, 100%, 55%, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
        ctx.fill();

        // core
        ctx.fillStyle = `hsla(${p.hue}, 100%, 80%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(draw);
    }

    init();
    draw();

    const onResize = () => init();
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0, opacity: 0.8 }}
      aria-hidden="true"
    />
  );
}
