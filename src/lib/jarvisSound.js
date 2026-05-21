// JARVIS 효과음 시스템 — Web Audio API 자체 합성 (외부 파일 0)
// 음소거 토글: localStorage 'pos_ai_sfx_muted_v1'

const MUTE_KEY = 'pos_ai_sfx_muted_v1';

let audioCtx = null;

function getCtx() {
  if (audioCtx && audioCtx.state !== 'closed') return audioCtx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
    return audioCtx;
  } catch {
    return null;
  }
}

export function isMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(muted) {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, '1');
    else localStorage.removeItem(MUTE_KEY);
    return true;
  } catch {
    return false;
  }
}

// 사용자 첫 인터랙션 시 ctx resume (브라우저 autoplay 정책)
export function unlockAudio() {
  const ctx = getCtx();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

// 기본 톤 합성 헬퍼
function playTone({ freq = 440, freqEnd = null, duration = 200, type = 'sine', volume = 0.15, attack = 0.005, release = 0.05 }) {
  if (isMuted()) return;
  const ctx = getCtx();
  if (!ctx) return;
  unlockAudio();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(0.01, freqEnd), now + duration / 1000);
  }
  // ADSR envelope
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + attack);
  gain.gain.setValueAtTime(volume, now + duration / 1000 - release);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration / 1000 + 0.05);
}

// 화음 (여러 톤 동시)
function playChord(freqs, opts = {}) {
  for (const f of freqs) playTone({ ...opts, freq: f });
}

// 노이즈 (burst)
function playNoise({ duration = 60, volume = 0.1 } = {}) {
  if (isMuted()) return;
  const ctx = getCtx();
  if (!ctx) return;
  unlockAudio();
  const now = ctx.currentTime;
  const bufferSize = ctx.sampleRate * (duration / 1000);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration / 1000);
  src.connect(gain).connect(ctx.destination);
  src.start(now);
}

// ===== 효과음 API =====

// 마이크 ON: 상승 sweep
export function sfxMicOn() {
  playTone({ freq: 220, freqEnd: 880, duration: 140, type: 'sine', volume: 0.12 });
}

// 마이크 OFF: 하강 sweep
export function sfxMicOff() {
  playTone({ freq: 880, freqEnd: 220, duration: 140, type: 'sine', volume: 0.1 });
}

// 메시지 도착: 화음 띵~
export function sfxMessageArrive() {
  playChord([880, 1320], { duration: 220, type: 'sine', volume: 0.08, release: 0.15 });
}

// 도구 호출: 짧은 디지털 틱
export function sfxToolCall() {
  playTone({ freq: 1500, duration: 35, type: 'square', volume: 0.06 });
}

// 답변 완료: arpeggio
export function sfxAnswerComplete() {
  const ctx = getCtx();
  if (!ctx) return;
  setTimeout(() => playTone({ freq: 440, duration: 80, type: 'sine', volume: 0.1 }), 0);
  setTimeout(() => playTone({ freq: 660, duration: 80, type: 'sine', volume: 0.1 }), 80);
  setTimeout(() => playTone({ freq: 880, duration: 160, type: 'sine', volume: 0.12, release: 0.12 }), 160);
}

// 에러: 낮은 sawtooth
export function sfxError() {
  playTone({ freq: 220, duration: 280, type: 'sawtooth', volume: 0.1, release: 0.15 });
}

// 입자 burst: noise + 짧은 tone
export function sfxBurst() {
  playNoise({ duration: 40, volume: 0.08 });
  playTone({ freq: 2000, duration: 50, type: 'sine', volume: 0.06 });
}

// hover/click: 미세
export function sfxClick() {
  playTone({ freq: 800, duration: 30, type: 'triangle', volume: 0.05 });
}
