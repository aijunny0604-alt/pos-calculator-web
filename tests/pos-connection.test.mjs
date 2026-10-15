import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCoreData, fetchPosJSON } from '../src/lib/posConnection.js';

test('empty successful lists are valid; null failed reads are not online', () => {
  assert.doesNotThrow(() => validateCoreData([], [], [], []));
  for (let i = 0; i < 4; i++) {
    const lists = [[], [], [], []]; lists[i] = null;
    assert.throws(() => validateCoreData(...lists));
  }
});
test('GET has a deadline and failed reads are not silently retried', async () => {
  let calls = 0;
  await assert.rejects(fetchPosJSON('https://example.test', {}, async (_, options) => {
    calls++; assert.ok(options.signal instanceof AbortSignal);
    return new Response('unavailable', {status: 503});
  }), /503/);
  assert.equal(calls, 1);
});
test('writes preserve caller options and are never retried on network failure', async () => {
  const options = {method: 'POST', body: '{}'}; let calls = 0;
  await assert.rejects(fetchPosJSON('https://example.test', options, async (_, received) => {
    calls++; assert.equal(received, options); throw new TypeError('network');
  }), /network/);
  assert.equal(calls, 1);
});
