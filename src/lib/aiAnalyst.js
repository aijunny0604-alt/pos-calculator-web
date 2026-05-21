// AI 분석 dispatcher — Gemini 우선, 실패 시 Groq 폴백
//
// 폴백 조건 (자동 전환):
//   - Gemini 에러 메시지에 "일일 사용량 초과" / "429" / "503" / "서버" 포함
//   - 또는 Gemini answer 빈 문자열 + error 존재
//
// localStorage 'aiProvider' = 'auto' | 'gemini-only' | 'groq-only' (사용자 강제 선택)

import { askAnalyst as askGemini } from './geminiAnalyst';
import { askGroq, hasGroqKey } from './groqAnalyst';

export function getProviderPreference() {
  try {
    if (typeof localStorage === 'undefined') return 'auto';
    return localStorage.getItem('aiProvider') || 'auto';
  } catch {
    return 'auto';
  }
}

export function setProviderPreference(pref) {
  try {
    if (['auto', 'gemini-only', 'groq-only'].includes(pref)) {
      localStorage.setItem('aiProvider', pref);
      return true;
    }
  } catch {}
  return false;
}

function shouldFallback(result) {
  if (!result) return true;
  if (result.error) {
    const msg = String(result.error);
    if (/429|503|일일 사용량|서버|초과|장애|연결 실패/.test(msg)) return true;
  }
  if (!result.answer || !result.answer.trim()) return true;
  return false;
}

/**
 * 통합 askAI — Gemini → Groq 폴백
 * 응답에 provider 필드 포함 ('gemini' | 'groq' | 'gemini→groq' 폴백 표시)
 */
export async function askAI(question, context, options = {}) {
  const pref = getProviderPreference();
  const groqAvailable = hasGroqKey();

  // 사용자가 Groq 강제
  if (pref === 'groq-only' && groqAvailable) {
    const r = await askGroq(question, context, options);
    return { ...r, provider: 'groq' };
  }

  // 사용자가 Gemini 강제
  if (pref === 'gemini-only') {
    const r = await askGemini(question, context, options);
    return { ...r, provider: 'gemini' };
  }

  // auto: Gemini 시도
  const geminiResult = await askGemini(question, context, options);

  // 폴백 불필요 또는 Groq 없음 → Gemini 결과
  if (!shouldFallback(geminiResult) || !groqAvailable) {
    return { ...geminiResult, provider: 'gemini' };
  }

  // Gemini 실패 + Groq 사용 가능 → 폴백
  options.onProgress?.({ name: '__fallback__', args: { from: 'gemini', to: 'groq' } });
  const groqResult = await askGroq(question, context, options);
  return {
    ...groqResult,
    provider: 'gemini→groq',
    fallback: true,
    geminiError: geminiResult.error,
  };
}

// 캐시 / 통계 함수는 Gemini 쪽 재사용 (Groq는 자체 캐시 없음)
export { clearAnalystCache, getCacheStats } from './geminiAnalyst';
export { hasGroqKey, saveGroqKey, getGroqKey } from './groqAnalyst';
