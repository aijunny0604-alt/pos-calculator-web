// Web Speech Synthesis 훅 (텍스트 → 한국어 여성 음성)
// JARVIS 여성 한국어 톤 (Microsoft Heami / Google 한국어 여성 우선)

import { useCallback, useEffect, useRef, useState } from 'react';

const ENABLED_KEY = 'pos_ai_tts_enabled_v1';

function getSynth() {
  if (typeof window === 'undefined') return null;
  return window.speechSynthesis || null;
}

// 🔊 발화용 텍스트 정제 — 마크다운/이모지/장식기호를 읽지 않게 제거해 자연스럽게
// (기존엔 "**볼드**"를 "별표별표..."로, 이모지·구분선까지 읽어서 이상했음)
function sanitizeForSpeech(text) {
  if (!text) return '';
  let s = String(text);
  // 코드블록/인라인 코드
  s = s.replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1');
  // 마크다운 강조/취소선/헤더/링크
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1').replace(/~~([^~]+)~~/g, '$1');
  s = s.replace(/^\s{0,3}#{1,6}\s*/gm, '');
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  s = s.replace(/https?:\/\/\S+/g, '');
  // 이모지 및 기호(픽토그램/화살표/도형/별 등) 제거
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{2500}-\u{25FF}️‍]/gu, ' ');
  s = s.replace(/[•·▶►◆■□●○★☆✔✕✓|>]/g, ' ');
  // 구분선(───, ---, ===)
  s = s.replace(/[-=─━_]{3,}/g, ' ');
  // 불릿(- 또는 * 로 시작하는 줄) → 쉼표로 자연스럽게
  s = s.replace(/^\s*[-*]\s+/gm, ', ');
  // 줄바꿈 → 문장 쉼
  s = s.replace(/\n{2,}/g, '. ').replace(/\n/g, ', ');
  // 다중 공백/중복 구두점 정리
  s = s.replace(/\s{2,}/g, ' ').replace(/\s*([.,])(\s*[.,])+/g, '$1').replace(/^[\s,.·]+/, '').trim();
  return s;
}

// 한국어 voice 우선순위 선택. 한국어 voice가 없으면 null (영어 voice로 한국어 읽으면 이상함 → 침묵)
function pickKoreanFemaleVoice(voices) {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  // 우선순위 1: 한국어 + 여성 키워드
  const preferences = [
    /heami/i,         // Microsoft Heami
    /sunhi/i,         // Microsoft SunHi
    /yujin/i,         // Google 한국어
    /female.*ko|ko.*female/i,
    /ko.*woman|woman.*ko/i,
  ];
  for (const re of preferences) {
    const match = voices.find((v) => re.test(v.name || ''));
    if (match) return match;
  }

  // 우선순위 2: ko-KR lang voice (여성 우선, 없으면 첫 한국어)
  const korean = voices.filter((v) => /^ko/i.test(v.lang || '') || /한국|korean/i.test(v.name || ''));
  if (korean.length > 0) {
    const female = korean.find((v) => /heami|sunhi|female|woman|여성|소리|yujin/i.test(v.name || ''));
    return female || korean[0];
  }

  // 한국어 voice 없음 → null (자동 발화 차단). 영어 voice는 한국어 발음 ❌
  return null;
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
    if (!synth) {
      console.warn('SpeechSynthesis 미지원 브라우저');
      return false;
    }
    if (!text || !text.trim()) {
      console.warn('TTS: 빈 텍스트');
      return false;
    }
    // 🔊 마크다운/이모지/기호 제거 후 발화 (자연스러움)
    const spoken = sanitizeForSpeech(text);
    if (!spoken) return false;
    // 이전 발화 중단
    try { synth.cancel(); } catch {}

    // voice 늦게 로드되는 경우 대비
    let voice = selectedVoice;
    if (!voice) {
      const vs = synth.getVoices();
      if (vs && vs.length > 0) {
        voice = pickKoreanFemaleVoice(vs);
        if (voice) setSelectedVoice(voice);
      }
    }

    // 한국어 voice 못 찾으면 강제 발화도 스킵 (영어/일본어 voice로 한국어 = 끔찍)
    if (!voice || !/^ko/i.test(voice.lang || '')) {
      if (!options.force) {
        console.warn('TTS: 한국어 voice 없음 — 발화 스킵');
        return false;
      }
    }

    const utter = new SpeechSynthesisUtterance(spoken);
    utter.lang = options.lang || 'ko-KR';
    utter.rate = options.rate ?? 1.02;   // 살짝 자연스러운 속도
    utter.pitch = options.pitch ?? 1.0;  // 1.1은 톤이 붕떠 부자연 → 1.0 중립
    utter.volume = options.volume ?? 1.0;
    if (voice) utter.voice = voice;

    utter.onstart = () => setIsSpeaking(true);
    utter.onend = () => { setIsSpeaking(false); currentUtterRef.current = null; };
    utter.onerror = (e) => {
      console.warn('TTS error:', e?.error || e);
      setIsSpeaking(false);
      currentUtterRef.current = null;
    };

    currentUtterRef.current = utter;
    try {
      synth.speak(utter);
      return true;
    } catch (e) {
      console.warn('TTS speak failed:', e);
      return false;
    }
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
