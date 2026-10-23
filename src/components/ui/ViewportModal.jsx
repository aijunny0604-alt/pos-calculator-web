import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import MotionBackdrop from './MotionBackdrop';

// 페이지 스크롤/transform 및 하단 내비게이션에서 독립된 화면 기준 모달.
export default function ViewportModal({ children, animated = false, ...props }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      if (!ref.current) return;
      ref.current.style.height = `${viewport?.height ?? window.innerHeight}px`;
      ref.current.style.top = `${viewport?.offsetTop ?? 0}px`;
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  const Backdrop = animated ? MotionBackdrop : 'div';
  return createPortal(<Backdrop ref={ref} {...props}>{children}</Backdrop>, document.body);
}
