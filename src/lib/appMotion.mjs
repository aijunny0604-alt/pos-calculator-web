// 사용자 요청: MOVE 전체 UI 모션을 OS/브라우저의 동작 줄이기 설정과 독립적으로 유지한다.
export function enableAppMotion() {
  if (typeof document !== 'undefined') document.documentElement.dataset.moveMotion = 'always';
}

export function shouldReduceMotion() {
  if (typeof document !== 'undefined' && document.documentElement.dataset.moveMotion === 'always') return false;
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}
