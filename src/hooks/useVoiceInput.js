// Web Speech Recognition 훅 (음성 → 텍스트, 한국어)
// 마이크 권한, 상태 관리, Spacebar PTT 지원

import { useCallback, useEffect, useRef, useState } from 'react';

const PERM_DENIED_KEY = 'pos_ai_voice_perm_denied_v1';

function getSR() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export const isVoiceSupported = () => Boolean(getSR());

export default function useVoiceInput({ onFinal, onInterim, autoSubmit = true } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(() => {
    try { return localStorage.getItem(PERM_DENIED_KEY) === '1'; } catch { return false; }
  });
  const recRef = useRef(null);
  const finalRef = useRef('');

  useEffect(() => () => {
    try { recRef.current?.abort(); } catch {}
  }, []);

  const start = useCallback(() => {
    const SR = getSR();
    if (!SR) {
      setError('이 브라우저는 음성 인식을 지원하지 않습니다 (Chrome/Edge 권장)');
      return false;
    }
    if (isListening) return false;

    try {
      const rec = new SR();
      rec.lang = 'ko-KR';
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      finalRef.current = '';
      setInterim('');
      setError(null);

      rec.onstart = () => setIsListening(true);

      rec.onresult = (event) => {
        let interimText = '';
        let finalText = '';
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          if (result.isFinal) finalText += transcript;
          else interimText += transcript;
        }
        finalRef.current = finalText || finalRef.current;
        setInterim(interimText || finalText);
        if (interimText) onInterim?.(interimText);
      };

      rec.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setPermissionDenied(true);
          try { localStorage.setItem(PERM_DENIED_KEY, '1'); } catch {}
          setError('마이크 권한이 거부되었습니다. 브라우저 주소창 자물쇠 → 마이크 허용 후 새로고침');
        } else if (event.error === 'no-speech') {
          setError(null); // 무음은 에러 아님
        } else if (event.error === 'aborted') {
          // 사용자 중단 — 정상
        } else {
          setError(`음성 인식 오류: ${event.error}`);
        }
      };

      rec.onend = () => {
        setIsListening(false);
        const final = finalRef.current.trim();
        if (final) {
          if (autoSubmit) onFinal?.(final);
          else onInterim?.(final);
        }
        setInterim('');
      };

      rec.start();
      recRef.current = rec;
      return true;
    } catch (e) {
      setError(`음성 인식 시작 실패: ${e.message}`);
      return false;
    }
  }, [isListening, onFinal, onInterim, autoSubmit]);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch {}
  }, []);

  const abort = useCallback(() => {
    try { recRef.current?.abort(); } catch {}
    setIsListening(false);
    setInterim('');
  }, []);

  return {
    isListening,
    interim,
    error,
    permissionDenied,
    supported: isVoiceSupported(),
    start,
    stop,
    abort,
  };
}
