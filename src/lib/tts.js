// MOVIS TTS — Web Speech Synthesis API (무료)
// 한국어 여성 음성, 세련된 속도 설정

let preferredVoice = null;

function getKoreanFemaleVoice() {
  if (preferredVoice) return preferredVoice;
  const voices = speechSynthesis.getVoices();
  // 한국어 여성 음성 우선순위
  const koFemale = voices.find(v => v.lang.startsWith('ko') && v.name.toLowerCase().includes('female'));
  const koGoogle = voices.find(v => v.lang.startsWith('ko') && v.name.includes('Google'));
  const koAny = voices.find(v => v.lang.startsWith('ko'));
  preferredVoice = koFemale || koGoogle || koAny || null;
  return preferredVoice;
}

// 음성 목록 로드 대기 (일부 브라우저 비동기)
if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.onvoiceschanged = () => { preferredVoice = null; getKoreanFemaleVoice(); };
}

// 마크다운/이모지/장식기호 제거 — 그대로 읽으면 "별표별표"·이모지까지 읽어 이상함
function sanitizeForSpeech(text) {
  if (!text) return '';
  let s = String(text);
  s = s.replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1');
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/__([^_]+)__/g, '$1').replace(/~~([^~]+)~~/g, '$1');
  s = s.replace(/^\s{0,3}#{1,6}\s*/gm, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '');
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{2500}-\u{25FF}️‍]/gu, ' ');
  s = s.replace(/[•·▶►◆■□●○★☆✔✕✓|>]/g, ' ').replace(/[-=─━_]{3,}/g, ' ').replace(/^\s*[-*]\s+/gm, ', ');
  s = s.replace(/\n{2,}/g, '. ').replace(/\n/g, ', ').replace(/\s{2,}/g, ' ').replace(/\s*([.,])(\s*[.,])+/g, '$1').trim();
  return s;
}

export function speak(text, { rate = 1.02, pitch = 1.0, volume = 0.85 } = {}) {
  if (typeof speechSynthesis === 'undefined') return;
  const spoken = sanitizeForSpeech(text);
  if (!spoken) return;
  speechSynthesis.cancel(); // 이전 발화 중단
  const utter = new SpeechSynthesisUtterance(spoken);
  utter.lang = 'ko-KR';
  utter.rate = rate;    // 자연스러운 속도
  utter.pitch = pitch;  // 중립 톤(1.1은 붕뜸)
  utter.volume = volume;
  const voice = getKoreanFemaleVoice();
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
  return utter;
}

export function stopSpeaking() {
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.cancel();
  }
}
