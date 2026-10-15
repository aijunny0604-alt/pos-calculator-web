import test from 'node:test';
import assert from 'node:assert/strict';
import { runMovisReads } from '../src/lib/movisReadQueue.js';

test('22 libraries use at most two concurrent reads and all are loaded', async () => {
  let active = 0, peak = 0;
  const seen = [];
  await runMovisReads(Array.from({length: 22}, (_, i) => i), async item => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 1));
    seen.push(item);
    active--;
  });
  assert.equal(peak, 2);
  assert.deepEqual(seen.sort((a, b) => a - b), Array.from({length: 22}, (_, i) => i));
});

test('cancellation prevents queued libraries from starting', async () => {
  const controller = new AbortController();
  const seen = [];
  await assert.rejects(runMovisReads([0, 1, 2, 3], async item => {
    seen.push(item);
    controller.abort();
  }, controller.signal), {name: 'AbortError'});
  assert.deepEqual(seen, [0]);
});

test('a stalled read times out and stops the remaining queue', async () => {
  const seen = [];
  await assert.rejects(runMovisReads([0, 1, 2, 3], (item, _, signal) => {
    seen.push(item);
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}));
  }, undefined, 2, 5), {name: 'TimeoutError'});
  assert.deepEqual(seen, [0, 1]);
});
