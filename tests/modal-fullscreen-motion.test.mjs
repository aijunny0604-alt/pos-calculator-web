import test from 'node:test';
import assert from 'node:assert/strict';
import { animateModalFullscreen } from '../src/lib/modalFullscreenMotion.js';

test('전체화면 대상이 없으면 모션 없이도 상태 전환은 실행된다', () => {
  let changed = 0;
  animateModalFullscreen(null, () => changed++);
  assert.equal(changed, 1);
});

test('빠른 확대·축소는 이전 프레임을 취소하고 마지막 전환만 남긴다', async () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const frames = new Map(); let next = 0, canceled = 0, changed = 0, animations = 0;
  globalThis.requestAnimationFrame = fn => { frames.set(++next, fn); return next; };
  globalThis.cancelAnimationFrame = id => { if (frames.delete(id)) canceled++; };
  const backdrop = { dataset: {} };
  const panel = {
    dataset: {}, isConnected: true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 400 }),
    closest: () => backdrop,
    animate: () => { animations++; return { finished: Promise.resolve(), cancel() {} }; },
  };
  const event = { currentTarget: { closest: () => panel } };
  try {
    animateModalFullscreen(event, () => changed++);
    animateModalFullscreen(event, () => changed++);
    assert.equal(canceled, 1);
    assert.equal(changed, 2);
    for (const fn of frames.values()) fn();
    await Promise.resolve();
    assert.equal(animations, 1);
    assert.equal(panel.dataset.fullscreenMotion, undefined);
    assert.equal(backdrop.dataset.fullscreenMotion, undefined);
  } finally {
    if (originalRequest === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = originalRequest;
    if (originalCancel === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = originalCancel;
  }
});
