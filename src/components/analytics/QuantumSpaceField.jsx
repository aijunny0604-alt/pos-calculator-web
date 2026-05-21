// 양자 우주 공간 — Canvas 다층 레이어
// 1. 별 필드 (정적, 300개)
// 2. 성운 가스 (5개 거대 radial gradient, 천천히 이동)
// 3. 양자 입자 흐름 (1200개, Perlin-like noise 벡터 필드 따라 이동)
// 4. 양자 효과: 점멸, 얽힘 trail, 가끔 quantum burst
// 5. CG 룩: motion trail, lens flare, vignette

import { useEffect, useRef } from 'react';

// Pseudo-Perlin noise (가벼운 sin/cos 기반)
function fakeNoise(x, y, t) {
  return (
    Math.sin(x * 0.7 + t * 0.13) * Math.cos(y * 0.5 + t * 0.11) +
    Math.sin(x * 1.3 - t * 0.07) * 0.5 +
    Math.cos(y * 0.9 + t * 0.19) * 0.5
  ) * 0.5;
}

function fakeNoise2(x, y, t) {
  return (
    Math.cos(x * 0.5 + t * 0.09) * Math.sin(y * 0.8 - t * 0.13) +
    Math.cos(x * 1.1 + t * 0.17) * 0.4
  ) * 0.5;
}

export default function QuantumSpaceField({ density = 'high' }) {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: -9999, y: -9999, inside: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const isMobile = window.innerWidth < 640;
    // 점 개수
    const STAR_COUNT = isMobile ? 150 : 300;
    const PARTICLE_COUNT = isMobile ? 600 : (density === 'low' ? 800 : 1200);
    const NEBULA_COUNT = isMobile ? 3 : 5;
    const FLARE_COUNT = isMobile ? 4 : 8;

    let W = canvas.clientWidth;
    let H = canvas.clientHeight;

    // 별 필드 (정적)
    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      size: Math.random() * 0.9 + 0.15,
      baseAlpha: Math.random() * 0.5 + 0.2,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.5 + Math.random() * 1.5,
      hue: Math.random() < 0.08 ? 'purple' : Math.random() < 0.15 ? 'white' : 'cyan',
    }));

    // 성운 가스 (큰 부드러운 blob)
    const nebulae = Array.from({ length: NEBULA_COUNT }, (_, i) => ({
      x: Math.random() * W,
      y: Math.random() * H,
      radius: 150 + Math.random() * 250,
      hue: i === 0 ? [168, 85, 247] : i === 1 ? [0, 212, 255] : i === 2 ? [77, 255, 255] : [236, 72, 153],
      drift: { vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.15 },
      pulse: Math.random() * Math.PI * 2,
    }));

    // 양자 입자
    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: 0, vy: 0,
      size: 0.4 + Math.random() * 1.1,
      // depth 0 (멀리) ~ 1 (가까이) — 시각 깊이감
      depth: Math.random(),
      baseAlpha: 0.3 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      // 양자 점멸 — 가끔 사라짐
      flickerThreshold: 0.85 + Math.random() * 0.13,
      // 색상: 70% cyan, 15% white, 10% purple, 5% magenta
      hue: (() => {
        const r = Math.random();
        if (r < 0.05) return [236, 72, 153];   // magenta
        if (r < 0.15) return [168, 85, 247];   // purple
        if (r < 0.30) return [220, 245, 255];  // white
        if (r < 0.55) return [77, 255, 255];   // soft cyan
        return [0, 212, 255];                  // cyan
      })(),
      // trail (이전 위치)
      trail: [],
    }));

    // 큰 빛 입자 (lens flare 용)
    const flares = Array.from({ length: FLARE_COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      size: 1.5 + Math.random() * 2.5,
      drift: { vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2 },
      pulsePhase: Math.random() * Math.PI * 2,
      hue: Math.random() < 0.3 ? [255, 255, 255] : [77, 255, 255],
    }));

    let rafId;
    let lastTime = performance.now();

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    function handleMouseMove(e) {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
      mouseRef.current.inside = true;
    }
    function handleMouseLeave() {
      mouseRef.current.inside = false;
      mouseRef.current.x = -9999;
      mouseRef.current.y = -9999;
    }
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    function draw(now) {
      const dt = Math.min(40, now - lastTime) / 16;
      lastTime = now;
      const t = now * 0.001;

      // 1. 배경 fade (motion trail 효과 — 완전 clear 안 하고 검은색 살짝 알파)
      ctx.fillStyle = 'rgba(2, 6, 16, 0.18)';
      ctx.fillRect(0, 0, W, H);

      // 2. 성운 (가장 뒤)
      ctx.globalCompositeOperation = 'lighter';
      for (const n of nebulae) {
        n.x += n.drift.vx * dt;
        n.y += n.drift.vy * dt;
        if (n.x < -n.radius) n.x = W + n.radius;
        if (n.x > W + n.radius) n.x = -n.radius;
        if (n.y < -n.radius) n.y = H + n.radius;
        if (n.y > H + n.radius) n.y = -n.radius;
        n.pulse += 0.005 * dt;
        const pulseFactor = 1 + Math.sin(n.pulse) * 0.15;
        const r = n.radius * pulseFactor;
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
        grad.addColorStop(0, `rgba(${n.hue[0]}, ${n.hue[1]}, ${n.hue[2]}, 0.10)`);
        grad.addColorStop(0.4, `rgba(${n.hue[0]}, ${n.hue[1]}, ${n.hue[2]}, 0.04)`);
        grad.addColorStop(1, `rgba(${n.hue[0]}, ${n.hue[1]}, ${n.hue[2]}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // 3. 별 (twinkle)
      for (const s of stars) {
        s.twinklePhase += s.twinkleSpeed * 0.02 * dt;
        const twinkle = 0.5 + Math.sin(s.twinklePhase) * 0.5;
        const alpha = s.baseAlpha * twinkle;
        if (s.hue === 'purple') ctx.fillStyle = `rgba(168, 85, 247, ${alpha})`;
        else if (s.hue === 'white') ctx.fillStyle = `rgba(245, 250, 255, ${alpha})`;
        else ctx.fillStyle = `rgba(0, 212, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
        // 큰 별 cross flare
        if (s.size > 0.7 && twinkle > 0.7) {
          ctx.strokeStyle = `rgba(220, 240, 255, ${alpha * 0.3})`;
          ctx.lineWidth = 0.3;
          ctx.beginPath();
          ctx.moveTo(s.x - s.size * 3, s.y); ctx.lineTo(s.x + s.size * 3, s.y);
          ctx.moveTo(s.x, s.y - s.size * 3); ctx.lineTo(s.x, s.y + s.size * 3);
          ctx.stroke();
        }
      }

      // 4. 양자 입자 (벡터 필드 따라 흐름)
      for (const p of particles) {
        // Perlin-like noise 벡터 필드
        const nx = fakeNoise(p.x * 0.005, p.y * 0.005, t);
        const ny = fakeNoise2(p.x * 0.005, p.y * 0.005, t);
        const speedFactor = 0.2 + p.depth * 1.2; // 가까운 입자가 더 빠름
        p.vx = nx * speedFactor;
        p.vy = ny * speedFactor;
        // 마우스 자석 (살짝 회피)
        if (mouseRef.current.inside) {
          const dx = p.x - mouseRef.current.x;
          const dy = p.y - mouseRef.current.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < 22500 && distSq > 1) {
            const dist = Math.sqrt(distSq);
            const push = (150 - dist) / 150 * 1.5;
            p.vx += (dx / dist) * push;
            p.vy += (dy / dist) * push;
          }
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // wrap around
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.y > H + 10) p.y = -10;

        p.phase += 0.025 * dt;

        // 양자 점멸 — 가끔 사라짐
        const flicker = Math.sin(t * 2 + p.phase) * 0.5 + 0.5;
        const isFlickering = flicker > p.flickerThreshold;
        const breath = 0.6 + Math.abs(Math.sin(p.phase)) * 0.4;
        const alpha = p.baseAlpha * breath * (isFlickering ? 0.3 : 1) * (0.4 + p.depth * 0.6);
        const sz = p.size * (0.5 + p.depth * 0.9);

        // Trail (가까운 빠른 입자만)
        if (p.depth > 0.7 && (Math.abs(p.vx) + Math.abs(p.vy)) > 0.5) {
          p.trail.unshift({ x: p.x, y: p.y });
          if (p.trail.length > 5) p.trail.pop();
          for (let i = 0; i < p.trail.length; i++) {
            const trailAlpha = alpha * (1 - i / p.trail.length) * 0.3;
            ctx.fillStyle = `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${trailAlpha})`;
            ctx.beginPath();
            ctx.arc(p.trail[i].x, p.trail[i].y, sz * (1 - i / p.trail.length) * 0.5, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          p.trail.length = 0;
        }

        // 글로우 (가까운 점만)
        if (p.depth > 0.6 && !isFlickering) {
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz * 5);
          grad.addColorStop(0, `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${alpha * 0.5})`);
          grad.addColorStop(0.5, `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${alpha * 0.15})`);
          grad.addColorStop(1, `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, sz * 5, 0, Math.PI * 2);
          ctx.fill();
        }

        // 코어
        ctx.fillStyle = `rgba(${p.hue[0]}, ${p.hue[1]}, ${p.hue[2]}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. 큰 빛 입자 (lens flare)
      for (const f of flares) {
        f.x += f.drift.vx * dt;
        f.y += f.drift.vy * dt;
        if (f.x < -50) f.x = W + 50;
        if (f.x > W + 50) f.x = -50;
        if (f.y < -50) f.y = H + 50;
        if (f.y > H + 50) f.y = -50;
        f.pulsePhase += 0.04 * dt;
        const pulse = 0.6 + Math.sin(f.pulsePhase) * 0.4;
        // 강한 글로우
        const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size * 25 * pulse);
        grad.addColorStop(0, `rgba(${f.hue[0]}, ${f.hue[1]}, ${f.hue[2]}, ${0.6 * pulse})`);
        grad.addColorStop(0.3, `rgba(${f.hue[0]}, ${f.hue[1]}, ${f.hue[2]}, ${0.2 * pulse})`);
        grad.addColorStop(1, `rgba(${f.hue[0]}, ${f.hue[1]}, ${f.hue[2]}, 0)`);
        ctx.fillStyle = grad;
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.size * 25 * pulse, 0, Math.PI * 2);
        ctx.fill();
        // 코어
        ctx.fillStyle = `rgba(${f.hue[0]}, ${f.hue[1]}, ${f.hue[2]}, ${0.95 * pulse})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.size * pulse, 0, Math.PI * 2);
        ctx.fill();
        // Cross spike (lens flare)
        if (pulse > 0.7) {
          ctx.strokeStyle = `rgba(${f.hue[0]}, ${f.hue[1]}, ${f.hue[2]}, ${(pulse - 0.7) * 1.5})`;
          ctx.lineWidth = 0.6;
          const spike = f.size * 14 * pulse;
          ctx.beginPath();
          ctx.moveTo(f.x - spike, f.y); ctx.lineTo(f.x + spike, f.y);
          ctx.moveTo(f.x, f.y - spike); ctx.lineTo(f.x, f.y + spike);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      // Vignette 제거 — fillRect가 사각형 단차 만들었음
      // 페이지 자체에 radial gradient 배경 있으므로 별도 vignette 불필요

      if (!reduced) rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);
    const onResize = () => resize();
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
}
