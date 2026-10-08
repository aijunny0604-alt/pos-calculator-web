import test from 'node:test';
import assert from 'node:assert/strict';
const root = process.env.MOVIS_TEST_URL;
test('브리지 접근 제어: 무인증·다른 Origin·인증된 요청 구분', {
  skip: !root
}, async () => {
  const denied = await fetch(root + '/status');
  assert.equal(denied.status, 401);
  const evil = await fetch(root + '/session', {
    headers: {
      Origin: 'https://evil.example',
      'X-Movis-Client': 'pos'
    }
  });
  assert.equal(evil.status, 403);
  const none = await fetch(root + '/session');
  assert.equal(none.status, 403);
  const session = await fetch(root + '/session', {
    headers: {
      'X-Movis-Client': 'pos'
    }
  });
  assert.equal(session.status, 200);
  const {
    token
  } = await session.json();
  const stale = await fetch(root + '/tool', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requestKey: 'expired',
      requestId: 123,
      result: {
        ok: true
      }
    })
  });
  assert.equal(stale.status, 409);
  const traversal = await fetch(root.replace('/api/movis', '') + '/%2e%2e%2f.movis-runtime%2fcodex%2fauth.json');
  assert.equal(traversal.status, 403);
});
