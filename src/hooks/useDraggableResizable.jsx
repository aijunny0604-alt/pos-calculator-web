import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_W = 320;
const MIN_H = 240;

function getPoint(e) {
  if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

function loadRect(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && typeof p.w === 'number' && typeof p.h === 'number') return p;
  } catch {}
  return null;
}

function clampRect(r) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(Math.max(MIN_W, r.w), vw);
  const h = Math.min(Math.max(MIN_H, r.h), vh);
  const x = Math.max(0, Math.min(r.x, vw - w));
  const y = Math.max(0, Math.min(r.y, vh - h));
  return { x, y, w, h };
}

function centerRect(defaults) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(defaults.w, vw - 32);
  const h = Math.min(defaults.h, vh - 32);
  return { x: Math.max(0, (vw - w) / 2), y: Math.max(0, (vh - h) / 2), w, h };
}

/**
 * 모달에 드래그 이동 + 8방향 리사이즈 기능을 붙이는 훅.
 * 사용처에서 외부 div는 backdrop만 담당하고, 내부 모달 div에
 *   style={{ ...containerStyle }}, {...dragHandleProps} 를 적용한 후
 *   자식 끝에 {handles} 를 렌더한다.
 */
const DESKTOP_BREAKPOINT = 768;

export default function useDraggableResizable(storageKey, defaults = { w: 960, h: 720 }) {
  const [maximized, setMaximized] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= DESKTOP_BREAKPOINT
  );
  const [rect, setRect] = useState(() => {
    if (typeof window === 'undefined') return { x: 0, y: 0, w: defaults.w, h: defaults.h };
    return clampRect(loadRect(storageKey) || centerRect(defaults));
  });

  const dragState = useRef(null);
  const resizeState = useRef(null);

  // viewport resize: 모달 clamp + 데스크톱/모바일 전환
  useEffect(() => {
    const onResize = () => {
      setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
      setRect((r) => clampRect(r));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 위치/크기 저장
  useEffect(() => {
    if (maximized) return;
    try { localStorage.setItem(storageKey, JSON.stringify(rect)); } catch {}
  }, [rect, storageKey, maximized]);

  const startDrag = useCallback((e) => {
    if (maximized) return;
    if (e.target?.closest?.('button, input, textarea, select, a, [data-no-drag]')) return;
    const p = getPoint(e);
    dragState.current = { startX: p.x, startY: p.y, origX: rect.x, origY: rect.y };
    if (e.cancelable) e.preventDefault();
  }, [rect.x, rect.y, maximized]);

  const startResize = useCallback((dir) => (e) => {
    if (maximized) return;
    const p = getPoint(e);
    resizeState.current = { startX: p.x, startY: p.y, orig: { ...rect }, dir };
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
  }, [rect, maximized]);

  useEffect(() => {
    const move = (e) => {
      if (!dragState.current && !resizeState.current) return;
      const p = getPoint(e);

      if (dragState.current) {
        const d = dragState.current;
        setRect((r) => {
          const nx = d.origX + (p.x - d.startX);
          const ny = d.origY + (p.y - d.startY);
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          return {
            ...r,
            x: Math.max(-r.w + 80, Math.min(vw - 80, nx)),
            y: Math.max(0, Math.min(vh - 48, ny)),
          };
        });
        if (e.cancelable) e.preventDefault();
      } else if (resizeState.current) {
        const d = resizeState.current;
        const dx = p.x - d.startX;
        const dy = p.y - d.startY;
        setRect(() => {
          let { x, y, w, h } = d.orig;
          if (d.dir.includes('e')) w = Math.max(MIN_W, d.orig.w + dx);
          if (d.dir.includes('s')) h = Math.max(MIN_H, d.orig.h + dy);
          if (d.dir.includes('w')) {
            const nw = Math.max(MIN_W, d.orig.w - dx);
            x = d.orig.x + (d.orig.w - nw);
            w = nw;
          }
          if (d.dir.includes('n')) {
            const nh = Math.max(MIN_H, d.orig.h - dy);
            y = d.orig.y + (d.orig.h - nh);
            h = nh;
          }
          return clampRect({ x, y, w, h });
        });
        if (e.cancelable) e.preventDefault();
      }
    };
    const up = () => { dragState.current = null; resizeState.current = null; };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    window.addEventListener('touchcancel', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
      window.removeEventListener('touchcancel', up);
    };
  }, []);

  const toggleMaximized = useCallback(() => setMaximized((m) => !m), []);
  const reset = useCallback(() => {
    try { localStorage.removeItem(storageKey); } catch {}
    setRect(centerRect(defaults));
    setMaximized(false);
  }, [storageKey, defaults]);

  // 모바일은 기존 동작(중앙 정렬)을 유지 → containerStyle/handles/drag 비활성
  const containerStyle = !isDesktop
    ? {}
    : maximized
      ? { position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', maxWidth: 'none', maxHeight: 'none', borderRadius: 0 }
      : { position: 'fixed', left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px`, maxWidth: 'none', maxHeight: 'none' };

  const dragHandleProps = !isDesktop
    ? {}
    : {
        onMouseDown: startDrag,
        onTouchStart: startDrag,
        style: { cursor: maximized ? 'default' : 'move', touchAction: 'none', userSelect: 'none' },
      };

  const handleBase = 'absolute select-none';
  const handles = (!isDesktop || maximized) ? null : (
    <>
      {/* edges */}
      <div data-no-drag className={`${handleBase} top-0 left-3 right-3 h-1.5`} style={{ cursor: 'n-resize', zIndex: 40 }} onMouseDown={startResize('n')} onTouchStart={startResize('n')} />
      <div data-no-drag className={`${handleBase} bottom-0 left-3 right-3 h-1.5`} style={{ cursor: 's-resize', zIndex: 40 }} onMouseDown={startResize('s')} onTouchStart={startResize('s')} />
      <div data-no-drag className={`${handleBase} left-0 top-3 bottom-3 w-1.5`} style={{ cursor: 'w-resize', zIndex: 40 }} onMouseDown={startResize('w')} onTouchStart={startResize('w')} />
      <div data-no-drag className={`${handleBase} right-0 top-3 bottom-3 w-1.5`} style={{ cursor: 'e-resize', zIndex: 40 }} onMouseDown={startResize('e')} onTouchStart={startResize('e')} />
      {/* corners */}
      <div data-no-drag className={`${handleBase} top-0 left-0 w-4 h-4`} style={{ cursor: 'nw-resize', zIndex: 41 }} onMouseDown={startResize('nw')} onTouchStart={startResize('nw')} />
      <div data-no-drag className={`${handleBase} top-0 right-0 w-4 h-4`} style={{ cursor: 'ne-resize', zIndex: 41 }} onMouseDown={startResize('ne')} onTouchStart={startResize('ne')} />
      <div data-no-drag className={`${handleBase} bottom-0 left-0 w-4 h-4`} style={{ cursor: 'sw-resize', zIndex: 41 }} onMouseDown={startResize('sw')} onTouchStart={startResize('sw')} />
      <div
        data-no-drag
        className={`${handleBase} bottom-0 right-0 w-5 h-5`}
        style={{ cursor: 'se-resize', zIndex: 41 }}
        onMouseDown={startResize('se')}
        onTouchStart={startResize('se')}
      >
        <div style={{
          position: 'absolute', right: 4, bottom: 4, width: 10, height: 10,
          borderRight: '2px solid currentColor', borderBottom: '2px solid currentColor',
          opacity: 0.45, pointerEvents: 'none',
        }} />
      </div>
    </>
  );

  // 외부에서 최소 크기 보장 (주문 품목 수에 따라 모달 자동 확장)
  const ensureSize = useCallback(({ minW, minH } = {}) => {
    setRect((r) => {
      let { x, y, w, h } = r;
      if (minW && w < minW) w = Math.min(minW, window.innerWidth - 16);
      if (minH && h < minH) h = Math.min(minH, window.innerHeight - 16);
      return clampRect({ x, y, w, h });
    });
  }, []);

  return { rect, maximized, isDesktop, containerStyle, dragHandleProps, handles, toggleMaximized, reset, ensureSize, startResize };
}
