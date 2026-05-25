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

export function speak(text, { rate = 1.05, pitch = 1.1, volume = 0.8 } = {}) {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel(); // 이전 발화 중단
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'ko-KR';
  utter.rate = rate;    // 약간 빠르게 (세련된 느낌)
  utter.pitch = pitch;  // 약간 높게 (여성 톤)
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
