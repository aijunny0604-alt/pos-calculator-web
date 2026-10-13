import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { prepareOrderContact, commitOrderContact } from '../src/lib/movisOrderContact.js';
import { validateAction, validatePending, validateIntent } from '../src/lib/movisValidation.js';
mkdirSync('tests/.artifacts', { recursive: true });
buildSync({ entryPoints: ['src/lib/geminiTools.js'], bundle: true, platform: 'node', format: 'esm', outfile: 'tests/.artifacts/order-tools.mjs', logLevel: 'silent' });
buildSync({ entryPoints: ['src/lib/movisActionGuard.js'], bundle: true, platform: 'node', format: 'esm', outfile: 'tests/.artifacts/order-guard.mjs', logLevel: 'silent' });
const { GEMINI_TOOLS, WRITE_TOOLS, executeTool } = await import('./.artifacts/order-tools.mjs');
const { capturePreconditions, checkActionBeforeCommit } = await import('./.artifacts/order-guard.mjs');
const order = { id: 'TEST-1', customer_name: '테스트 고객', customer_phone: null, customer_address: '기존 테스트 주소', memo: '', items: [], created_at: new Date().toISOString() };
const args = { orderNumber: 'TEST-1', phone: ' 010-0000-0000 ' };
test('등록된 주문 배송정보 도구가 실제 확인 미리보기로 연결된다', () => {
  assert.ok(WRITE_TOOLS.has('updateOrderContact'));
  assert.equal(GEMINI_TOOLS.filter(t => t.name === 'updateOrderContact').length, 1);
  const result = executeTool('updateOrderContact', args, { orders: [order] });
  assert.equal(result.data.action, 'updateOrderContact');
  assert.deepEqual(result.data.params, { orderId: 'TEST-1', customerName: '테스트 고객', phone: '010-0000-0000' });
  assert.equal(validateAction(result.data.action, result.data.params).length, 0);
  assert.match(result.data.preview, /\(없음\) → 010/);
});
test('정확하지 않은 주문·중복 주문·빈 변경은 거부한다', () => {
  for (const [input, rows] of [[{ phone: '1' }, [order]], [{ ...args, orderNumber: 'UNKNOWN' }, [order]], [args, [order, order]], [{ orderNumber: 'TEST-1' }, [order]], [{ ...args, phone: 1 }, [order]]]) assert.equal(prepareOrderContact(input, rows).ok, false);
});
test('주소만 수정하거나 명시적으로 비울 때 다른 필드는 보존한다', () => {
  const result = prepareOrderContact({ orderNumber: 'TEST-1', address: '' }, [order]);
  assert.equal(result.data.params.address, '');
  assert.equal('phone' in result.data.params, false);
  assert.match(result.data.preview, /삭제/);
});
test('목록만 읽고 변경하거나 잘못된 업무 목적·임의 필드를 사용하면 거부한다', () => {
  const result = prepareOrderContact(args, [order]);
  assert.equal(validatePending(result, [{ name: 'listAvailableTools', result: { ok: true } }]).ok, false);
  assert.ok(validateIntent('updateOrderContact', 'customer_update', args).length);
  assert.ok(validateAction('updateOrderContact', { ...result.data.params, total: 1 }).length);
});
test('배송정보 변경 또는 원본 확인 누락 시 저장 전에 차단한다', async () => {
  const pending = prepareOrderContact(args, [order]).data;
  pending.preconditions = capturePreconditions(pending, { orders: [order] });
  const client = { from: () => ({ select: () => ({ in: async () => ({ data: [{ ...order, customer_address: '다른 PC에서 수정' }] }) }) }) };
  await assert.rejects(checkActionBeforeCommit(pending, client), /변경되었습니다/);
  await assert.rejects(checkActionBeforeCommit({ ...pending, preconditions: [] }, client), /원본 확인/);
});
test('저장 및 재조회가 모두 성공할 때만 완료하고 전달하지 않은 주소는 쓰지 않는다', async () => {
  let written;
  const row = { ...order, customer_phone: '010-0000-0000' };
  const api = { updateOrder: async (id, patch) => { assert.equal(id, order.id); written = patch; return [row]; } };
  const client = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: row }) }) }) }) };
  assert.deepEqual(await commitOrderContact({ orderId: order.id, phone: '010-0000-0000' }, api, client), row);
  assert.deepEqual(written, { customer_phone: '010-0000-0000' });
  await assert.rejects(commitOrderContact({ orderId: order.id, phone: '1' }, api, client), /재조회가 일치하지/);
  for (const saved of [null, true, []]) await assert.rejects(commitOrderContact({ orderId: order.id, phone: '1' }, { updateOrder: async () => saved }, client), /저장 결과/);
});
test('주문 검색 결과에 실제 주문 연락처·주소를 제공한다', () => {
  const result = executeTool('searchOrders', {}, { orders: [order] });
  assert.equal(result.data.orders[0].customerAddress, order.customer_address);
  assert.equal(result.data.orders[0].customerPhone, '');
});
