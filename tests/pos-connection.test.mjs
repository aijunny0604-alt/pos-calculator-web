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

test('core read failures and recovery report the specific resource without retrying writes', async () => {
  const originalWindow = globalThis.window;
  const events = [];
  globalThis.window = { dispatchEvent: event => events.push(event.detail) };
  try {
    await assert.rejects(fetchPosJSON('https://example.test/rest/v1/orders?limit=1', {}, async () => new Response('down', { status: 503 })));
    await fetchPosJSON('https://example.test/rest/v1/products?limit=1', {}, async () => new Response('[]', { status: 200 }));
    await assert.rejects(fetchPosJSON('https://example.test/rest/v1/orders', { method:'POST' }, async () => { throw new TypeError('network'); }));
    assert.deepEqual(events, [{ result:'failure', resource:'orders' }, { result:'success', resource:'products' }]);
  } finally { globalThis.window = originalWindow; }
});
