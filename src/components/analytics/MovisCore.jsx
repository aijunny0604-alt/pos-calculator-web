import { useEffect, useRef, useState } from 'react';
const VERTEX = `
attribute vec3 position; attribute float glow;
uniform float time; uniform float group; uniform float aspect; uniform float pixelRatio; uniform float energy;
varying float light; varying float depth;
mat3 rx(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
mat3 ry(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
mat3 rz(float a){float c=cos(a),s=sin(a);return mat3(c,s,0.,-s,c,0.,0.,0.,1.);}
void main(){
 vec3 p=position;
 if(group<.5) p=ry(time*.12)*rx(.27)*p;
 else p=ry(group*.61+time*.08)*rx(.55+group*.45)*rz(time*(.07+group*.025))*p;
 float z=4.4-p.z; float zoom=2.6/z;
 gl_Position=vec4(p.x*zoom/aspect,p.y*zoom,0.,1.);
 depth=clamp((p.z+2.)/4.,.15,1.); light=glow*(.5+depth*.5);
 gl_PointSize=(1.3+glow*2.3+energy)*pixelRatio*zoom;
}`;
const FRAGMENT = `precision mediump float; varying float light; varying float depth; uniform float points; uniform vec3 tint;
void main(){float a=light;if(points>.5){float r=length(gl_PointCoord-.5)*2.;a*=1.-smoothstep(.15,1.,r);}gl_FragColor=vec4(tint*(.65+depth*.5),a);}`;
function sphere() {
  const a = [];
  for (let i = 0; i < 1300; i++) {
    const y = 1 - 2 * i / 1299,
      r = Math.sqrt(1 - y * y),
      p = i * 2.399963;
    a.push(Math.cos(p) * r * .85, y * .85, Math.sin(p) * r * .85, .25 + i % 7 / 10);
  }
  return a;
}
function ring(radius, ticks = false) {
  const a = [];
  for (let i = 0; i < 240; i++) {
    const t = i / 240 * Math.PI * 2,
      n = (i + 1) / 240 * Math.PI * 2;
    if (ticks) {
      if (i % 3) continue;
      for (const r of [radius, radius + (i % 15 === 0 ? .105 : .04)]) a.push(Math.cos(t) * r, Math.sin(t) * r, 0, .6);
    } else {
      if (i % 60 > 49) continue;
      a.push(Math.cos(t) * radius, Math.sin(t) * radius, 0, .45, Math.cos(n) * radius, Math.sin(n) * radius, 0, .45);
    }
  }
  return a;
}
function lattice() {
  const a = [];
  for (let j = 1; j < 12; j++) {
    const y = Math.cos(j * Math.PI / 12) * .87,
      r = Math.sin(j * Math.PI / 12) * .87;
    for (let i = 0; i < 64; i++) {
      for (const t of [i / 64 * 2 * Math.PI, (i + 1) / 64 * 2 * Math.PI]) a.push(Math.cos(t) * r, y, Math.sin(t) * r, .12);
    }
  }
  return a;
}
export default function MovisCore({
  state = 'standby',
  compact = false
}) {
  const canvas = useRef(null),
    stateRef = useRef(state);
  stateRef.current = state;
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const el = canvas.current,
      gl = el?.getContext('webgl', {
        alpha: true,
        antialias: true,
        powerPreference: 'low-power'
      });
    if (!gl) {
      setFallback(true);
      return;
    }
    let frame,
      visible = true,
      disposed = false,
      last = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error('shader');
      return s;
    };
    let program, vs, fs;
    try {
      vs = compile(gl.VERTEX_SHADER, VERTEX);
      fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('program');
    } catch {
      setFallback(true);
      return;
    }
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    const p = gl.getAttribLocation(program, 'position'),
      g = gl.getAttribLocation(program, 'glow');
    const u = Object.fromEntries(['time', 'group', 'aspect', 'pixelRatio', 'energy', 'points', 'tint'].map(k => [k, gl.getUniformLocation(program, k)]));
    const groups = [{
      a: sphere(),
      group: 0,
      points: true
    }, {
      a: lattice(),
      group: 0
    }, ...[1.05, 1.24, 1.44].flatMap((r, i) => [{
      a: ring(r),
      group: i + 1
    }, {
      a: ring(r, true),
      group: i + 1
    }])].map(item => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(item.a), gl.STATIC_DRAW);
      return {
        ...item,
        b,
        count: item.a.length / 4
      };
    });
    function draw(now = 0) {
      if (disposed) return;
      if (visible && !document.hidden && (reduced.matches || now - last > 1000 / 30)) {
        last = now;
        const dpr = Math.min(devicePixelRatio || 1, 1.75),
          w = Math.round(el.clientWidth * dpr),
          h = Math.round(el.clientHeight * dpr);
        if (w && h) {
          if (el.width !== w || el.height !== h) {
            el.width = w;
            el.height = h;
            gl.viewport(0, 0, w, h);
          }
          gl.clear(gl.COLOR_BUFFER_BIT);
          const busy = stateRef.current === 'thinking',
            review = stateRef.current === 'review';
          gl.uniform1f(u.time, reduced.matches ? 12 : now / 1000 * (busy ? 1.65 : 1));
          gl.uniform1f(u.aspect, w / h);
          gl.uniform1f(u.pixelRatio, dpr);
          gl.uniform1f(u.energy, busy ? .8 : 0);
          gl.uniform3f(u.tint, review ? .95 : .2, review ? .66 : .84, review ? .3 : 1.);
          for (const item of groups) {
            gl.bindBuffer(gl.ARRAY_BUFFER, item.b);
            gl.enableVertexAttribArray(p);
            gl.vertexAttribPointer(p, 3, gl.FLOAT, false, 16, 0);
            gl.enableVertexAttribArray(g);
            gl.vertexAttribPointer(g, 1, gl.FLOAT, false, 16, 12);
            gl.uniform1f(u.group, item.group);
            gl.uniform1f(u.points, item.points ? 1 : 0);
            gl.drawArrays(item.points ? gl.POINTS : gl.LINES, 0, item.count);
          }
        }
      }
      if (!reduced.matches && visible && !document.hidden) frame = requestAnimationFrame(draw);
    }
    const restart = () => {
      cancelAnimationFrame(frame);
      draw(performance.now());
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      restart();
    });
    observer.observe(el);
    const resize = new ResizeObserver(restart);
    resize.observe(el);
    document.addEventListener('visibilitychange', restart);
    reduced.addEventListener('change', restart);
    const lost = e => {
      e.preventDefault();
      setFallback(true);
      cancelAnimationFrame(frame);
    };
    el.addEventListener('webglcontextlost', lost);
    restart();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      document.removeEventListener('visibilitychange', restart);
      reduced.removeEventListener('change', restart);
      el.removeEventListener('webglcontextlost', lost);
      groups.forEach(i => gl.deleteBuffer(i.b));
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);
  return <div className={`movis-core ${compact ? 'is-compact' : ''} state-${state}`} aria-hidden="true">
    <div className="movis-core-halo" /><div className="movis-core-orbit" /><div className="movis-core-axis" />
    <canvas ref={canvas} className={fallback ? 'is-unavailable' : ''} />
    {fallback && <div className="movis-core-fallback" />}
    <div className="movis-core-heart"><span /><i /></div>
    <span className="movis-core-mark mark-top">M / V — 02</span>
  </div>;
}
