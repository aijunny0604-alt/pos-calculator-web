// 인터랙티브 자비스 dot sphere
// - Fibonacci sphere 분포
// - 상태별 색상/모양/속도 변화 (standby/listening/analyzing/responding)
// - 마우스 자석 효과 (커서 가까운 점이 끌림)
// - 점 연결선 (가까운 점끼리 미세 라인)
// - 클릭 시 ripple wave

import { useEffect, useRef } from 'react';

const STATE_CONFIG = {
  standby: {
    primary: [0, 212, 255],     // cyan
    accent: [77, 255, 255],     // soft cyan
    spinSpeed: 0.002,
    pulseSpeed: 1.5,
    radiusOscillation: 0.0,
    connectionThreshold: 0.18,
  },
  listening: {
    primary: [255, 170, 0],     // amber
    accent: [255, 56, 96],      // hot pink
    spinSpeed: 0.005,
    pulseSpeed: 4.0,
    radiusOscillation: 0.08,    // 마이크 입력 펄스
    connectionThreshold: 0.22,
  },
  analyzing: {
    primary: [168, 85, 247],    // purple
    accent: [0, 212, 255],      // cyan
    spinSpeed: 0.012,           // 빠른 spiral
    pulseSpeed: 3.0,
    radiusOscillation: 0.04,
    connectionThreshold: 0.20,
  },
  responding: {
    primary: [0, 255, 136],     // neon green
    accent: [77, 255, 255],
    spinSpeed: 0.003,
    pulseSpeed: 2.0,
    radiusOscillation: 0.03,
    connectionThreshold: 0.20,
  },
};

export default function JarvisDotSphere({
  pointCount = 520,
  size = 480,
  mode = 'standby', // 'standby' | 'listening' | 'analyzing' | 'responding'
  audioLevel = 0,    // 0~1 (외부에서 amplitude 전달 시)
}) {
  const canvasRef = useRef(null);
  const modeRef = useRef(mode);
  const audioRef = useRef(audioLevel);
  const mouseRef = useRef({ x: 0, y: 0, inside: false });
  const ripplesRef = useRef([]); // {x, y, age}

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { audioRef.current = audioLevel; }, [audioLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const isMobile = window.innerWidth < 640;
    const N = isMobile ? Math.floor(pointCount * 0.5) : pointCount;

    // Fibonacci sphere 분포
    const points = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const radius = Math.sqrt(1 - y * y);
      const theta = golden * i;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;
      points.push({
        x, y, z,
        size: 0.6 + Math.random() * 1.4,
        baseAlpha: 0.4 + Math.random() * 0.6,
        isAccent: Math.random() < 0.12,
        phase: Math.random() * Math.PI * 2,
        // 자석 효과 변위
        ox: 0, oy: 0,
      });
    }

    let rafId;
    let rotation = { x: 0.3, y: 0 };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    function handleMouseMove(e) {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
      mouseRef.current.inside = mouseRef.current.x >= 0 && mouseRef.current.x <= rect.width &&
                                 mouseRef.current.y >= 0 && mouseRef.current.y <= rect.height;
    }
    function handleMouseLeave() { mouseRef.current.inside = false; }
    function handleClick(e) {
      const rect = canvas.getBoundingClientRect();
      ripplesRef.current.push({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        age: 0,
      });
      if (ripplesRef.current.length > 5) ripplesRef.current.shift();
    }
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('click', handleClick);

    function lerpColor(c1, c2, t) {
      return [
        Math.round(c1[0] + (c2[0] - c1[0]) * t),
        Math.round(c1[1] + (c2[1] - c1[1]) * t),
        Math.round(c1[2] + (c2[2] - c1[2]) * t),
      ];
    }

    function draw() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const t = performance.now() * 0.001;
      const cfg = STATE_CONFIG[modeRef.current] || STATE_CONFIG.standby;
      const audio = audioRef.current;

      // 펄스로 반지름 변동
      const baseRadius = Math.min(w, h) * 0.42;
      const pulse = 1 + Math.sin(t * cfg.pulseSpeed) * cfg.radiusOscillation + audio * 0.15;
      const radius = baseRadius * pulse;

      // 회전
      if (!reduced) {
        rotation.y += cfg.spinSpeed;
        rotation.x = 0.3 + Math.sin(t * 0.3) * 0.15;
      }

      const cosX = Math.cos(rotation.x), sinX = Math.sin(rotation.x);
      const cosY = Math.cos(rotation.y), sinY = Math.sin(rotation.y);

      // 변환 + z-sort
      const transformed = points.map((p) => {
        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.x * sinY + p.z * cosY;
        const y2 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX;
        return { x: x1, y: y2, z: z2, p };
      });
      transformed.sort((a, b) => a.z - b.z);

      // 화면 좌표 계산 + 마우스 자석 효과
      const screen = transformed.map(({ x, y, z, p }) => {
        let sx = cx + x * radius;
        let sy = cy + y * radius;
        // 자석 효과 (앞쪽 점만)
        const depth = (z + 1) / 2;
        if (mouseRef.current.inside && depth > 0.5) {
          const dx = mouseRef.current.x - sx;
          const dy = mouseRef.current.y - sy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const range = 100;
          if (dist < range && dist > 0) {
            const pull = (1 - dist / range) * 12;
            sx += (dx / dist) * pull;
            sy += (dy / dist) * pull;
          }
        }
        // ripple wave 효과
        for (const r of ripplesRef.current) {
          const dx = sx - r.x;
          const dy = sy - r.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const waveRadius = r.age * 8;
          const waveWidth = 40;
          if (Math.abs(dist - waveRadius) < waveWidth) {
            const strength = 1 - Math.abs(dist - waveRadius) / waveWidth;
            const push = strength * 8 * (1 - r.age / 30);
            if (dist > 0) {
              sx += (dx / dist) * push;
              sy += (dy / dist) * push;
            }
          }
        }
        return { sx, sy, z, depth, p };
      });

      // 연결선 (가까운 앞쪽 점끼리)
      const connThreshold = cfg.connectionThreshold * radius;
      for (let i = 0; i < screen.length; i++) {
        if (screen[i].depth < 0.5) continue; // 앞쪽만
        for (let j = i + 1; j < Math.min(i + 18, screen.length); j++) {
          if (screen[j].depth < 0.5) continue;
          const dx = screen[i].sx - screen[j].sx;
          const dy = screen[i].sy - screen[j].sy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connThreshold) {
            const alpha = (1 - dist / connThreshold) * 0.15 * Math.min(screen[i].depth, screen[j].depth);
            ctx.strokeStyle = `rgba(${cfg.primary[0]}, ${cfg.primary[1]}, ${cfg.primary[2]}, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(screen[i].sx, screen[i].sy);
            ctx.lineTo(screen[j].sx, screen[j].sy);
            ctx.stroke();
          }
        }
      }

      // 점 그리기
      for (const { sx, sy, depth, p } of screen) {
        const breath = 0.7 + Math.sin(t * 1.5 + p.phase) * 0.3;
        const alpha = p.baseAlpha * (0.4 + depth * 0.6) * breath;
        const sz = p.size * (0.5 + depth * 0.9);

        // 색상: 상태별 + accent 비율
        const color = p.isAccent ? cfg.accent : cfg.primary;

        // 앞쪽 점 glow
        if (depth > 0.7) {
          const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sz * 4);
          grad.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha * 0.6})`);
          grad.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(sx, sy, sz * 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // 점 코어
        ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(sx, sy, sz, 0, Math.PI * 2);
        ctx.fill();
      }

      // 중앙 코어
      const corePulse = 1 + Math.sin(t * 2) * 0.15 + audio * 0.4;
      const coreSize = baseRadius * 0.06 * corePulse;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize * 5);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      grad.addColorStop(0.3, `rgba(${cfg.accent[0]}, ${cfg.accent[1]}, ${cfg.accent[2]}, 0.8)`);
      grad.addColorStop(0.6, `rgba(${cfg.primary[0]}, ${cfg.primary[1]}, ${cfg.primary[2]}, 0.4)`);
      grad.addColorStop(1, `rgba(${cfg.primary[0]}, ${cfg.primary[1]}, ${cfg.primary[2]}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreSize * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.beginPath();
      ctx.arc(cx, cy, coreSize * 0.6, 0, Math.PI * 2);
      ctx.fill();

      // ripple 그리기 + age update
      for (const r of ripplesRef.current) {
        const waveRadius = r.age * 8;
        const alpha = Math.max(0, 1 - r.age / 30);
        ctx.strokeStyle = `rgba(${cfg.accent[0]}, ${cfg.accent[1]}, ${cfg.accent[2]}, ${alpha * 0.6})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, waveRadius, 0, Math.PI * 2);
        ctx.stroke();
        r.age++;
      }
      ripplesRef.current = ripplesRef.current.filter((r) => r.age < 30);

      rafId = requestAnimationFrame(draw);
    }

    draw();
    const onResize = () => { resize(); };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('click', handleClick);
    };
  }, [pointCount, size]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-crosshair"
      aria-hidden="true"
      style={{ maxWidth: size, maxHeight: size, aspectRatio: '1 / 1' }}
    />
  );
}
