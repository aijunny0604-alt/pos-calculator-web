// 타이프라이터 효과 훅 — 텍스트를 글자별로 점진적 표시
// prefers-reduced-motion 시 즉시 전체 표시

import { useEffect, useState } from 'react';

export default function useTypewriter(text, { speed = 25, enabled = true, startDelay = 0 } = {}) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!enabled || !text) {
      setDisplayed(text || '');
      setDone(true);
      return;
    }
    // reduced motion 감지
    const reduced = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setDisplayed(text);
      setDone(true);
      return;
    }

    setDisplayed('');
    setDone(false);
    let i = 0;
    let timeoutId;
    let intervalId;

    const start = () => {
      intervalId = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(intervalId);
          setDone(true);
        }
      }, speed);
    };

    if (startDelay > 0) {
      timeoutId = setTimeout(start, startDelay);
    } else {
      start();
    }

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [text, speed, enabled, startDelay]);

  return { displayed, done };
}
