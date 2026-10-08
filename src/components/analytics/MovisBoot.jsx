import { useEffect, useRef, useState } from 'react';
import MovisCore from './MovisCore';

// 진입 연출이며 인증/자료 조회의 성공 여부를 표시하지 않는다.
export default function MovisBoot() {
  const [visible, setVisible] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const root = useRef(null);
  useEffect(() => {
    if (!visible) return;
    const parent = root.current?.parentElement;
    const content = root.current?.nextElementSibling;
    const previous = document.activeElement;
    if (content) content.inert = true;
    root.current?.querySelector('button')?.focus({ preventScroll: true });
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const close = () => setVisible(false);
    const key = e => { if (e.key === 'Escape') close(); };
    const timer = setTimeout(close, 2400);
    media.addEventListener('change', close);
    document.addEventListener('keydown', key);
    return () => {
      clearTimeout(timer);
      media.removeEventListener('change', close);
      document.removeEventListener('keydown', key);
      if (content) content.inert = false;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
      else parent?.querySelector('textarea')?.focus({ preventScroll: true });
    };
  }, [visible]);
  if (!visible) return null;
  return <div ref={root} className="movis-boot" role="region" aria-label="무비스 시작 화면">
    <div className="movis-boot-grid" aria-hidden="true" />
    <div className="movis-boot-scan" aria-hidden="true" />
    <div className="movis-boot-center">
      <div className="movis-boot-eyebrow">MOVE MOTORS / INTELLIGENCE INTERFACE</div>
      <div className="movis-boot-reactor" aria-hidden="true"><MovisCore state="thinking" /></div>
      <div className="movis-boot-word">MOVIS<span>02</span></div>
      <div className="movis-boot-caption">당신의 판단을 위한 지능.</div>
      <div className="movis-boot-line" aria-hidden="true"><i /></div>
      <div className="movis-boot-foot">OPERATIONS INTELLIGENCE SYSTEM</div>
    </div>
    <button type="button" className="movis-boot-skip" onClick={() => setVisible(false)}>바로 시작 <span aria-hidden="true">↗</span></button>
  </div>;
}
