// 음성 입력 버튼 — 마이크 + JARVIS 스타일 ripple + 진동 막대
// PTT (Spacebar 길게 누르기) + 클릭 모두 지원

import { useEffect, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';

export default function VoiceButton({
  isListening,
  supported,
  permissionDenied,
  interim,
  onStart,
  onStop,
  size = 'md',
}) {
  const buttonSize = size === 'sm' ? 'w-11 h-11' : size === 'lg' ? 'w-14 h-14' : 'w-11 h-11';
  const iconSize = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';

  // Spacebar PTT (데스크탑 한정)
  const pressTimerRef = useRef(null);
  const isPttActiveRef = useRef(false);

  useEffect(() => {
    if (!supported) return;
    const isTextField = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    };

    const handleKeyDown = (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (isTextField(document.activeElement)) return;
      if (isPttActiveRef.current || isListening) return;
      // 200ms 길게 눌러야 PTT 시작 (실수 방지)
      pressTimerRef.current = setTimeout(() => {
        isPttActiveRef.current = true;
        onStart?.();
      }, 200);
    };

    const handleKeyUp = (e) => {
      if (e.code !== 'Space') return;
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
      if (isPttActiveRef.current) {
        isPttActiveRef.current = false;
        onStop?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    };
  }, [supported, isListening, onStart, onStop]);

  const handleClick = () => {
    if (!supported || permissionDenied) return;
    if (isListening) onStop?.();
    else onStart?.();
  };

  // 비지원/거부 상태
  if (!supported || permissionDenied) {
    return (
      <button
        type="button"
        disabled
        title={!supported ? '이 브라우저는 음성 인식 미지원 (Chrome/Edge 권장)' : '마이크 권한 거부됨 — 주소창 자물쇠에서 허용 후 새로고침'}
        className={`flex-shrink-0 ${buttonSize} rounded-xl border border-[var(--border)] flex items-center justify-center text-[var(--muted-foreground)] cursor-not-allowed opacity-50`}
        aria-label="음성 입력 비활성"
      >
        <MicOff className={iconSize} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={isListening ? '듣는 중... (다시 클릭 시 종료)' : '음성 입력 (Spacebar 길게 또는 클릭)'}
      aria-label={isListening ? '음성 입력 중지' : '음성 입력 시작'}
      className={`relative flex-shrink-0 ${buttonSize} rounded-xl flex items-center justify-center transition-all ${
        isListening
          ? 'bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-lg shadow-cyan-500/50'
          : 'bg-white border border-cyan-300 text-cyan-600 hover:bg-cyan-50 hover:border-cyan-500 hover:shadow-md hover:shadow-cyan-200'
      }`}
      style={isListening ? { boxShadow: '0 0 24px rgba(0,212,255,0.6), 0 0 8px rgba(0,212,255,0.8)' } : undefined}
    >
      <Mic className={`${iconSize} ${isListening ? 'animate-jarvis-pulse' : ''}`} />
      {/* 듣는 중 ripple */}
      {isListening && (
        <>
          <span className="absolute inset-0 rounded-xl animate-jarvis-voice-ripple-1 pointer-events-none" style={{ border: '2px solid rgba(0,212,255,0.6)' }} />
          <span className="absolute inset-0 rounded-xl animate-jarvis-voice-ripple-2 pointer-events-none" style={{ border: '2px solid rgba(0,212,255,0.4)' }} />
          <span className="absolute inset-0 rounded-xl animate-jarvis-voice-ripple-3 pointer-events-none" style={{ border: '2px solid rgba(0,212,255,0.2)' }} />
        </>
      )}
    </button>
  );
}
