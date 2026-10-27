// 자동 높이·최대 너비도 실제 화면 위치를 기준으로 같은 모션으로 전환한다.
const activeMotions = new WeakMap();
const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';

export function animateModalFullscreen(event, update) {
  const panel = event?.currentTarget?.closest?.('.modal-fs-transition');
  if (!panel || typeof panel.animate !== 'function') {
    update();
    return;
  }
  const from = panel.getBoundingClientRect();
  const previous = activeMotions.get(panel);
  if (previous) {
    cancelAnimationFrame(previous.frame);
    previous.animation?.cancel();
  }
  const backdrop = panel.closest('.modal-backdrop-fs-transition');
  panel.dataset.fullscreenMotion = 'true';
  if (backdrop) backdrop.dataset.fullscreenMotion = 'true';
  const motion = { frame: 0, animation: null };
  activeMotions.set(panel, motion);
  update();
  motion.frame = requestAnimationFrame(() => {
    if (activeMotions.get(panel) !== motion) return;
    const to = panel.getBoundingClientRect();
    if (!panel.isConnected || !from.width || !from.height || !to.width || !to.height) {
      delete panel.dataset.fullscreenMotion;
      if (backdrop) delete backdrop.dataset.fullscreenMotion;
      activeMotions.delete(panel);
      return;
    }
    motion.animation = panel.animate([
      { transformOrigin: 'top left', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})` },
      { transformOrigin: 'top left', transform: 'translate(0, 0) scale(1, 1)' },
    ], { duration: 450, easing });
    const finish = () => {
      if (activeMotions.get(panel) !== motion) return;
      delete panel.dataset.fullscreenMotion;
      if (backdrop) delete backdrop.dataset.fullscreenMotion;
      activeMotions.delete(panel);
    };
    motion.animation.finished.then(finish, finish);
  });
}
