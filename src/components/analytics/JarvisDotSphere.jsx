// 진짜 자비스 스타일 dot sphere — Fibonacci 분포 + Canvas + 3D 회전
// 500개 점이 구체 형태로 떠다님 + 중앙 펄스 코어

import { useEffect, useRef } from 'react';

export default function JarvisDotSphere({ pointCount = 500, size = 480 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // 모바일 점 수 감소
    const isMobile = window.innerWidth < 640;
    const N = isMobile ? Math.floor(pointCount * 0.55) : pointCount;

    // Fibonacci sphere 분포 — 구체 표면에 균등하게 점 배치
    const points = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2; // -1 ~ 1
      const radius = Math.sqrt(1 - y * y);
      const theta = golden * i;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;
      points.push({
        x, y, z,
        // 약간씩 다른 크기/투명도
        size: 0.6 + Math.random() * 1.4,
        baseAlpha: 0.4 + Math.random() * 0.6,
        // 일부는 cyan-soft, 일부는 white-ish
        hue: Math.random() < 0.12 ? 'white' : 'cyan',
        // 미세 진동 위상
        phase: Math.random() * Math.PI * 2,
      });
    }

    let rafId;
    let rotation = { x: 0.3, y: 0 }; // 초기 약간 기울임

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    function draw() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.42;
      const t = performance.now() * 0.001;

      // 회전 업데이트
      if (!reduced) {
        rotation.y += 0.002; // 천천히 회전
        rotation.x = 0.3 + Math.sin(t * 0.3) * 0.15; // 좌우로 흔들흔들
      }

      const cosX = Math.cos(rotation.x), sinX = Math.sin(rotation.x);
      const cosY = Math.cos(rotation.y), sinY = Math.sin(rotation.y);

      // z-sort를 위해 변환 후 정렬
      const transformed = points.map((p) => {
        // Y 축 회전
        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.x * sinY + p.z * cosY;
        // X 축 회전
        const y2 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX;
        return { x: x1, y: y2, z: z2, p };
      });
      transformed.sort((a, b) => a.z - b.z); // 뒤쪽부터 그리기

      for (const { x, y, z, p } of transformed) {
        const sx = cx + x * radius;
        const sy = cy + y * radius;
        // z에 따라 크기/투명도 조절 (앞쪽이 크고 진함)
        const depth = (z + 1) / 2; // 0~1
        const breath = 0.7 + Math.sin(t * 1.5 + p.phase) * 0.3;
        const alpha = p.baseAlpha * (0.4 + depth * 0.6) * breath;
        const sz = p.size * (0.5 + depth * 0.8);

        // 점 색상
        if (p.hue === 'white') {
          ctx.fillStyle = `rgba(220, 245, 255, ${alpha})`;
        } else {
          // cyan + 가끔 soft cyan
          const tint = Math.sin(t + p.phase) > 0.7;
          ctx.fillStyle = tint
            ? `rgba(77, 255, 255, ${alpha})`
            : `rgba(0, 212, 255, ${alpha})`;
        }

        // glow (앞쪽 점만)
        if (depth > 0.7) {
          const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sz * 4);
          grad.addColorStop(0, `rgba(0, 212, 255, ${alpha * 0.6})`);
          grad.addColorStop(1, 'rgba(0, 212, 255, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(sx, sy, sz * 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // 점 코어
        ctx.fillStyle = p.hue === 'white'
          ? `rgba(220, 245, 255, ${alpha})`
          : `rgba(${0 + (depth > 0.7 ? 77 : 0)}, 212, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(sx, sy, sz, 0, Math.PI * 2);
        ctx.fill();
      }

      // 중앙 펄스 코어 (구체 중심)
      const corePulse = 1 + Math.sin(t * 2) * 0.15;
      const coreSize = radius * 0.06 * corePulse;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize * 4);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      grad.addColorStop(0.3, 'rgba(77, 255, 255, 0.8)');
      grad.addColorStop(0.6, 'rgba(0, 212, 255, 0.4)');
      grad.addColorStop(1, 'rgba(0, 212, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreSize * 4, 0, Math.PI * 2);
      ctx.fill();
      // 코어 하이라이트
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(cx, cy, coreSize * 0.6, 0, Math.PI * 2);
      ctx.fill();

      rafId = requestAnimationFrame(draw);
    }

    draw();
    const onResize = () => { resize(); };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, [pointCount, size]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      aria-hidden="true"
      style={{ maxWidth: size, maxHeight: size, aspectRatio: '1 / 1' }}
    />
  );
}
