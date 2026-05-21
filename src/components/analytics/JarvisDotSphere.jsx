// 인터랙티브 자비스 dot sphere — 살아있는 양자 구체
// - Fibonacci sphere + 빠른 회전 (지구처럼)
// - 5-8개 강한 빛 입자 (sphere 표면에 떠있는 큰 별)
// - 가끔 quantum burst (입자가 갑자기 강한 빛 → 1.5s fade)
// - 표면 데이터 흐름 입자 (sphere 표면 따라 빠르게 이동)
// - 적도/극 가이드 라인
// - 상태별 색상/모양/속도 변화
// - 마우스 자석 + 클릭 ripple

import { useEffect, useRef } from 'react';

const STATE_CONFIG = {
  standby: {
    primary: [0, 212, 255],
    accent: [77, 255, 255],
    spinSpeed: 0.006,
    tilt: 0.3,
    pulseSpeed: 1.5,
    radiusOscillation: 0.02,
    connectionThreshold: 0.18,
  },
  listening: {
    primary: [255, 170, 0],
    accent: [255, 56, 96],
    spinSpeed: 0.014,
    tilt: 0.35,
    pulseSpeed: 4.0,
    radiusOscillation: 0.10,
    connectionThreshold: 0.22,
  },
  analyzing: {
    primary: [168, 85, 247],
    accent: [0, 212, 255],
    spinSpeed: 0.025,
    tilt: 0.5,
    pulseSpeed: 3.0,
    radiusOscillation: 0.05,
    connectionThreshold: 0.20,
  },
  responding: {
    primary: [0, 255, 136],
    accent: [77, 255, 255],
    spinSpeed: 0.008,
    tilt: 0.3,
    pulseSpeed: 2.0,
    radiusOscillation: 0.04,
    connectionThreshold: 0.20,
  },
};

export default function JarvisDotSphere({
  pointCount = 520,
  size = 480,
  mode = 'standby',
  audioLevel = 0,
}) {
  const canvasRef = useRef(null);
  const modeRef = useRef(mode);
  const audioRef = useRef(audioLevel);
  const mouseRef = useRef({ x: 0, y: 0, inside: false });
  const ripplesRef = useRef([]);

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

    // Fibonacci sphere
    const points = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = golden * i;
      points.push({
        x: Math.cos(theta) * r,
        y,
        z: Math.sin(theta) * r,
        size: 0.5 + Math.random() * 1.5,
        baseAlpha: 0.4 + Math.random() * 0.55,
        isAccent: Math.random() < 0.13,
        phase: Math.random() * Math.PI * 2,
        // 표면 jitter (입자가 살아있는 느낌)
        jitterFreq: 0.5 + Math.random() * 1.5,
        jitterAmp: 0.005 + Math.random() * 0.015,
        // burst 상태
        burstUntil: 0,
      });
    }

    // 강한 빛 입자 (sphere 표면에 떠있는 큰 별)
    const FLARE_COUNT = isMobile ? 4 : 7;
    const flares = Array.from({ length: FLARE_COUNT }, () => {
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.acos(2 * Math.random() - 1);
      return {
        x: Math.sin(theta) * Math.cos(phi),
        y: Math.cos(theta),
        z: Math.sin(theta) * Math.sin(phi),
        size: 2.5 + Math.random() * 2.5,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 1.5 + Math.random() * 1.5,
      };
    });

    // 표면 흐름 입자 (sphere 표면을 따라 이동)
    const STREAM_COUNT = isMobile ? 8 : 16;
    const streams = Array.from({ length: STREAM_COUNT }, () => ({
      // 위도/경도 (구 좌표)
      lat: (Math.random() - 0.5) * Math.PI,
      lon: Math.random() * Math.PI * 2,
      // 흐름 방향 (위도/경도 변화)
      dLat: (Math.random() - 0.5) * 0.04,
      dLon: 0.03 + Math.random() * 0.04,
      size: 1.2 + Math.random() * 0.8,
      trailLength: 8 + Math.floor(Math.random() * 6),
      trail: [],
    }));

    let rafId;
    let rotation = { x: 0.3, y: 0 };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
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
      ripplesRef.current.push({ x: e.clientX - rect.left, y: e.clientY - rect.top, age: 0 });
      if (ripplesRef.current.length > 5) ripplesRef.current.shift();
    }
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('click', handleClick);

    // Quantum burst — 가끔 랜덤 입자가 강한 빛
    let lastBurst = 0;
    function maybeBurst(t) {
      if (t - lastBurst < 0.8 + Math.random() * 1.2) return;
      lastBurst = t;
      const p = points[Math.floor(Math.random() * points.length)];
      p.burstUntil = t + 1.5;
    }

    function project(x, y, z, cosX, sinX, cosY, sinY, radius, cx, cy) {
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;
      const y2 = y * cosX - z1 * sinX;
      const z2 = y * sinX + z1 * cosX;
      return { sx: cx + x1 * radius, sy: cy + y2 * radius, z: z2, depth: (z2 + 1) / 2 };
    }

    function draw() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      // motion trail: 완전 clear 대신 살짝 fade (잔상)
      ctx.fillStyle = 'rgba(2, 6, 16, 0.22)';
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2, cy = h / 2;
      const t = performance.now() * 0.001;
      const cfg = STATE_CONFIG[modeRef.current] || STATE_CONFIG.standby;
      const audio = audioRef.current;

      const baseRadius = Math.min(w, h) * 0.42;
      const pulse = 1 + Math.sin(t * cfg.pulseSpeed) * cfg.radiusOscillation + audio * 0.15;
      const radius = baseRadius * pulse;

      if (!reduced) {
        rotation.y += cfg.spinSpeed;
        rotation.x = cfg.tilt + Math.sin(t * 0.25) * 0.12;
      }
      const cosX = Math.cos(rotation.x), sinX = Math.sin(rotation.x);
      const cosY = Math.cos(rotation.y), sinY = Math.sin(rotation.y);

      maybeBurst(t);

      // 1. 외곽 글로우 ring (sphere 바깥에 부드러운 빛)
      const outerGrad = ctx.createRadialGradient(cx, cy, radius * 0.95, cx, cy, radius * 1.6);
      outerGrad.addColorStop(0, `rgba(${cfg.primary[0]}, ${cfg.primary[1]}, ${cfg.primary[2]}, 0.08)`);
      outerGrad.addColorStop(1, `rgba(${cfg.primary[0]}, ${cfg.primary[1]}, ${cfg.primary[2]}, 0)`);
      ctx.fillStyle = outerGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.6, 0, Math.PI * 2);
      ctx.fill();

      // 2. 점 좌표 변환 (+ jitter)
      const transformed = points.map((p) => {
        // 표면 jitter (입자가 약간 떨림)
        const jx = Math.sin(t * p.jitterFreq + p.phase) * p.jitterAmp;
        const jy = Math.cos(t * p.jitterFreq * 1.3 + p.phase) * p.jitterAmp;
        const jz = Math.sin(t * p.jitterFreq * 0.8 + p.phase * 2) * p.jitterAmp;
        const pr = project(p.x + jx, p.y + jy, p.z + jz, cosX, sinX, cosY, sinY, radius, cx, cy);
        return { ...pr, p };
      });
      transformed.sort((a, b) => a.z - b.z);

      // 3. 마우스 자석 + ripple
      const screen = transformed.map((d) => {
        let { sx, sy, z, depth, p } = d;
        if (mouseRef.current.inside && depth > 0.5) {
          const dx = mouseRef.current.x - sx, dy = mouseRef.current.y - sy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const range = 100;
          if (dist < range && dist > 0) {
            const pull = (1 - dist / range) * 12;
            sx += (dx / dist) * pull;
            sy += (dy / dist) * pull;
          }
        }
        for (const r of ripplesRef.current) {
          const dx = sx - r.x, dy = sy - r.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const waveRadius = r.age * 8, waveWidth = 40;
          if (Math.abs(dist - waveRadius) < waveWidth) {
            const strength = 1 - Math.abs(dist - waveRadius) / waveWidth;
            const push = strength * 8 * (1 - r.age / 30);
            if (dist > 0) { sx += (dx / dist) * push; sy += (dy / dist) * push; }
          }
        }
        return { sx, sy, z, depth, p };
      });

      // 4. 연결선 (앞쪽 가까운 점끼리)
      const connTh = cfg.connectionThreshold * radius;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < screen.length; i++) {
        if (screen[i].depth < 0.55) continue;
        for (let j = i + 1; j < Math.min(i + 14, screen.length); j++) {
          if (screen[j].depth < 0.55) continue;
          const dx = screen[i].sx - screen[j].sx, dy = screen[i].sy - screen[j].sy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connTh) {
            const alpha = (1 - dist / connTh) * 0.18 * Math.min(screen[i].depth, screen[j].depth);
            ctx.strokeStyle = `rgba(${cfg.primary[0]}, ${cfg.primary[1]}, ${cfg.primary[2]}, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(screen[i].sx, screen[i].sy);
            ctx.lineTo(screen[j].sx, screen[j].sy);
            ctx.stroke();
          }
        }
      }

      // 5. 점 그리기 (양자 burst 포함)
      for (const { sx, sy, depth, p } of screen) {
        const breath = 0.7 + Math.sin(t * 1.5 + p.phase) * 0.3;
        const isBursting = t < p.burstUntil;
        const burstFactor = isBursting ? (p.burstUntil - t) / 1.5 : 0;
        const alpha = p.baseAlpha * (0.4 + depth * 0.6) * breath * (1 + burstFactor * 2);
        const sz = p.size * (0.5 + depth * 0.9) * (1 + burstFactor * 3);
        const color = p.isAccent ? cfg.accent : cfg.primary;

        // 글로우 (앞쪽 + burst 입자)
        if (depth > 0.7 || isBursting) {
          const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sz * (isBursting ? 7 : 4));
          const glowAlpha = alpha * (isBursting ? 1 : 0.6);
          grad.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${glowAlpha})`);
          grad.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(sx, sy, sz * (isBursting ? 7 : 4), 0, Math.PI * 2);
          ctx.fill();
        }

        // 코어
        ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${Math.min(1, alpha)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, sz, 0, Math.PI * 2);
        ctx.fill();
      }

      // 6. 강한 빛 입자 (lens flare in sphere)
      for (const f of flares) {
        f.pulsePhase += 0.03 * f.pulseSpeed;
        const fPulse = 0.5 + Math.sin(f.pulsePhase) * 0.5;
        const pr = project(f.x, f.y, f.z, cosX, sinX, cosY, sinY, radius, cx, cy);
        if (pr.depth < 0.3) continue; // 뒤편은 안 보임
        const fSize = f.size * (0.6 + pr.depth * 1.0) * (0.7 + fPulse * 0.6);
        const fAlpha = 0.4 + pr.depth * 0.6;
        // 강한 글로우
        ctx.globalCompositeOperation = 'lighter';
        const fgrad = ctx.createRadialGradient(pr.sx, pr.sy, 0, pr.sx, pr.sy, fSize * 12);
        fgrad.addColorStop(0, `rgba(${cfg.accent[0]}, ${cfg.accent[1]}, ${cfg.accent[2]}, ${fAlpha * 0.6})`);
        fgrad.addColorStop(0.3, `rgba(${cfg.primary[0]}, ${cfg.primary[1]}, ${cfg.primary[2]}, ${fAlpha * 0.3})`);
        fgrad.addColorStop(1, `rgba(${cfg.primary[0]}, ${cfg.primary[1]}, ${cfg.primary[2]}, 0)`);
        ctx.fillStyle = fgrad;
        ctx.beginPath();
        ctx.arc(pr.sx, pr.sy, fSize * 12, 0, Math.PI * 2);
        ctx.fill();
        // 코어 하이라이트
        ctx.fillStyle = `rgba(255, 255, 255, ${fAlpha * fPulse})`;
        ctx.beginPath();
        ctx.arc(pr.sx, pr.sy, fSize * 0.8, 0, Math.PI * 2);
        ctx.fill();
        // Cross spike
        if (fPulse > 0.7) {
          ctx.strokeStyle = `rgba(${cfg.accent[0]}, ${cfg.accent[1]}, ${cfg.accent[2]}, ${(fPulse - 0.7) * fAlpha * 2})`;
          ctx.lineWidth = 0.6;
          const spike = fSize * 8 * fPulse;
          ctx.beginPath();
          ctx.moveTo(pr.sx - spike, pr.sy); ctx.lineTo(pr.sx + spike, pr.sy);
          ctx.moveTo(pr.sx, pr.sy - spike); ctx.lineTo(pr.sx, pr.sy + spike);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      // 7. 표면 흐름 입자 (sphere 표면 따라 빠르게 이동)
      for (const s of streams) {
        s.lat += s.dLat;
        s.lon += s.dLon;
        // 위도 경계
        if (s.lat > Math.PI / 2 || s.lat < -Math.PI / 2) s.dLat *= -1;
        const sx0 = Math.sin(Math.PI / 2 - s.lat) * Math.cos(s.lon);
        const sy0 = Math.cos(Math.PI / 2 - s.lat);
        const sz0 = Math.sin(Math.PI / 2 - s.lat) * Math.sin(s.lon);
        const pr = project(sx0, sy0, sz0, cosX, sinX, cosY, sinY, radius, cx, cy);
        if (pr.depth < 0.5) {
          s.trail.length = 0;
          continue;
        }
        s.trail.unshift({ x: pr.sx, y: pr.sy, depth: pr.depth });
        if (s.trail.length > s.trailLength) s.trail.pop();
        // 점 + trail
        for (let i = 0; i < s.trail.length; i++) {
          const tp = s.trail[i];
          const trailAlpha = (1 - i / s.trail.length) * 0.6 * tp.depth;
          ctx.fillStyle = `rgba(${cfg.accent[0]}, ${cfg.accent[1]}, ${cfg.accent[2]}, ${trailAlpha})`;
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, s.size * (1 - i / s.trail.length), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 8. 중앙 코어
      const corePulse = 1 + Math.sin(t * 2) * 0.2 + audio * 0.4;
      const coreSize = baseRadius * 0.07 * corePulse;
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize * 6);
      coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      coreGrad.addColorStop(0.3, `rgba(${cfg.accent[0]}, ${cfg.accent[1]}, ${cfg.accent[2]}, 0.8)`);
      coreGrad.addColorStop(0.6, `rgba(${cfg.primary[0]}, ${cfg.primary[1]}, ${cfg.primary[2]}, 0.4)`);
      coreGrad.addColorStop(1, `rgba(${cfg.primary[0]}, ${cfg.primary[1]}, ${cfg.primary[2]}, 0)`);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreSize * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
      ctx.beginPath();
      ctx.arc(cx, cy, coreSize * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // 9. Ripple wave
      for (const r of ripplesRef.current) {
        const wR = r.age * 8;
        const alpha = Math.max(0, 1 - r.age / 30);
        ctx.strokeStyle = `rgba(${cfg.accent[0]}, ${cfg.accent[1]}, ${cfg.accent[2]}, ${alpha * 0.6})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, wR, 0, Math.PI * 2);
        ctx.stroke();
        r.age++;
      }
      ripplesRef.current = ripplesRef.current.filter((r) => r.age < 30);

      rafId = requestAnimationFrame(draw);
    }

    draw();
    const onResize = () => resize();
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
