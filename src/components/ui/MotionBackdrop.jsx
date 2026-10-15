import { useLayoutEffect, useRef } from 'react';

// 업무 콜백은 즉시 끝내고, 퇴장 장면만 잠깐 유지한다. 복제본에는 이벤트/포커스가 없다.
export default function MotionBackdrop({ children, ...props }) {
  const root = useRef(null);
  useLayoutEffect(() => {
    const node = root.current;
    let painted = false;
    const frame = requestAnimationFrame(() => { painted = true; });
    return () => {
      cancelAnimationFrame(frame);
      if (!painted || !node?.isConnected || !node.getBoundingClientRect().width) return;
      const ghost = node.cloneNode(true);
      ghost.setAttribute('aria-hidden', 'true');
      ghost.setAttribute('inert', '');
      ghost.classList.add('move-dialog-exit');
      ghost.style.pointerEvents = 'none';
      // 중첩 창은 각자의 퇴장을 담당하므로 중복 잔상을 만들지 않는다.
      ghost.querySelectorAll('.move-dialog-backdrop').forEach(el => el.remove());
      [ghost, ...ghost.querySelectorAll('*')].forEach(el => {
        el.removeAttribute('id'); el.removeAttribute('autofocus');
        el.removeAttribute('aria-modal');
        if (el.matches('button,input,select,textarea,a,[tabindex]')) el.setAttribute('tabindex', '-1');
      });
      const sources = node.querySelectorAll('*');
      const copies = ghost.querySelectorAll('*');
      document.body.appendChild(ghost);
      // 긴 본문을 닫아도 마지막으로 보고 있던 스크롤 위치에서 퇴장한다.
      if (sources.length === copies.length) sources.forEach((el, i) => {
        copies[i].scrollTop = el.scrollTop; copies[i].scrollLeft = el.scrollLeft;
      });
      const timer = setTimeout(() => ghost.remove(), 260);
      ghost.addEventListener('animationend', event => {
        if (event.target === ghost) { clearTimeout(timer); ghost.remove(); }
      });
    };
  }, []);
  return <div ref={root} {...props}>{children}</div>;
}
