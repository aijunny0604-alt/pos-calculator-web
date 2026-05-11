import { useEffect, useRef, useState } from 'react';

export default function useCountUp(target, duration = 700) {
  const t = Number(target);
  const safe = Number.isFinite(t) ? t : 0;
  const [n, setN] = useState(safe);
  const fromRef = useRef(safe);

  useEffect(() => {
    const to = Number.isFinite(t) ? t : 0;
    const from = fromRef.current;
    if (from === to) {
      setN(to);
      return;
    }
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (to - from) * eased;
      setN(to >= 0 ? Math.floor(v) : Math.ceil(v));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setN(to);
        fromRef.current = to;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [t, duration]);

  return n;
}
