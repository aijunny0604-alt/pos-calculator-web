// Web Speech Synthesis 훅 (텍스트 → 한국어 여성 음성)
// JARVIS 여성 한국어 톤 (Microsoft Heami / Google 한국어 여성 우선)

import { useCallback, useEffect, useRef, useState } from 'react';

const ENABLED_KEY = 'pos_ai_tts_enabled_v1';

function getSynth() {
  if (typeof window === 'undefined') return null;
  return window.speechSynthesis || null;
}

// 한국어 여성 voice 우선순위 선택
function pickKoreanFemaleVoice(voices) {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  // 우선순위 1: 한국어 + 여성 키워드
  const preferences = [
    /heami/i,         // Microsoft Heami (한국어 여성)
    /sunhi/i,         // Microsoft SunHi (한국어 여성)
    /female.*ko|ko.*female/i,
    /yujin/i,         // Google 한국어
  ];
  for (const re of preferences) {
    const match = voices.find((v) => re.test(v.name || ''));
    if (match) return match;
  }

  // 우선순위 2: 한국어 이름 또는 lang ko
  const korean = voices.filter((v) => /^ko/i.test(v.lang) || /한국|korean/i.test(v.name || ''));
  if (korean.length > 0) {
    // 여성으로 추정되는 것 우선 (이름 끝이 i/ah/heami 등)
    const female = korean.find((v) => /heami|sunhi|female|woman|여성|소리/i.test(v.name || ''));
    return female || korean[0];
  }

  // 우선순위 3: 첫 voice (fallback)
  return voices[0];
}

export default function useTextToSpeech({ defaultEnabled = false } = {}) {
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [enabled, setEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem(ENABLED_KEY);
      return stored === null ? defaultEnabled : stored === '1';
    } catch { return defaultEnabled; }
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const currentUtterRef = useRef(null);

  // voice 목록 로드 (브라우저별 비동기 + 동기 모두 처리)
  useEffect(() => {
    const synth = getSynth();
    if (!synth) return;

    const loadVoices = () => {
      const vs = synth.getVoices();
      if (vs && vs.length > 0) {
        setVoices(vs);
        setSelectedVoice(pickKoreanFemaleVoice(vs));
      }
    };
    loadVoices();
    // Chrome은 voiceschanged 이벤트로 비동기 로드
    if (typeof synth.onvoiceschanged !== 'undefined') {
      synth.onvoiceschanged = loadVoices;
    }
    return () => {
      try { synth.cancel(); } catch {}
    };
  }, []);

  // enabled 상태 영속화
  useEffect(() => {
    try { localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0'); } catch {}
  }, [enabled]);

  const speak = useCallback((text, options = {}) => {
    const synth = getSynth();
    if (!synth || !text || !text.trim()) return;
    // 이전 발화 중단
    try { synth.cancel(); } catch {}

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = options.lang || 'ko-KR';
    utter.rate = options.rate ?? 1.0;
    utter.pitch = options.pitch ?? 1.1; // 약간 상향 — 여성 톤
    utter.volume = options.volume ?? 1.0;
    if (selectedVoice) utter.voice = selectedVoice;

    utter.onstart = () => setIsSpeaking(true);
    utter.onend = () => { setIsSpeaking(false); currentUtterRef.current = null; };
    utter.onerror = () => { setIsSpeaking(false); currentUtterRef.current = null; };

    currentUtterRef.current = utter;
    synth.speak(utter);
  }, [selectedVoice]);

  // 자동 발화 (enabled=true 일 때만)
  const speakAuto = useCallback((text, options = {}) => {
    if (!enabled) return;
    speak(text, options);
  }, [enabled, speak]);

  const cancel = useCallback(() => {
    const synth = getSynth();
    try { synth?.cancel(); } catch {}
    setIsSpeaking(false);
    currentUtterRef.current = null;
  }, []);

  return {
    supported: Boolean(getSynth()),
    voices,
    selectedVoice,
    setSelectedVoice,
    enabled,
    setEnabled,
    isSpeaking,
    speak,        // 강제 발화 (수동 토글 클릭 시)
    speakAuto,    // 자동 발화 (enabled 시에만)
    cancel,
  };
}
