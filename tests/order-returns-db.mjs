import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE orders(id text PRIMARY KEY, customer_name text, customer_id text, items jsonb, returns jsonb, total numeric, total_returned numeric);
    CREATE TABLE customer_returns(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, return_id text, customer_name text, customer_id text,
      order_number text, items jsonb, total_amount numeric CHECK (total_amount <> 1000), returned_at timestamptz);
    GRANT SELECT, UPDATE ON orders TO anon;
    GRANT SELECT, UPDATE, DELETE, INSERT ON customer_returns TO anon;
    INSERT INTO orders VALUES
      ('original','샘플 모터스','sample','[{"id":7,"name":"기존 팁","price":92400,"quantity":4},{"id":8,"name":"별도 부속","price":1000,"quantity":1}]',NULL,370600,0),
      ('replacement','샘플모터스','sample','[]','[]',401280,0),
      ('other','다른 고객',NULL,'[]','[]',400000,0);
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261126_order_return_details.sql', import.meta.url), 'utf8'));
  await db.exec('SET ROLE anon');
  const [row] = (await db.query("SELECT * FROM orders WHERE id = 'original'")).rows;
  const exchange = { kind: 'exchange', reason: '오배송', note: '다른 품목 출고', exchangeOrderNumber: 'replacement', replacement: '교체 팁 4개' };
  const save = async ({ action = 'add', id = 'RET-1', returns = [], total = 0, selections = [{ index: 0, quantity: 4 }], details = exchange } = {}) =>
    (await db.query('SELECT public.save_order_return($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8::jsonb) AS result',
      [row.id, action, id, JSON.stringify(row.items), JSON.stringify(returns), total, JSON.stringify(selections), JSON.stringify(details)])).rows[0].result;

  await assert.rejects(save({ details: { ...exchange, exchangeOrderNumber: 'other' } }), /return_exchange_order_invalid/);
  await assert.rejects(save({ selections: [{ index: 1, quantity: 1 }] }), /check constraint/);
  assert.equal((await db.query("SELECT returns FROM orders WHERE id = 'original'")).rows[0].returns, null, '거래처 기록 저장 실패 시 주문도 롤백');
  await assert.rejects(save({ selections: [{ index: 0, quantity: 5 }] }), /invalid_return_quantity/);
  await assert.rejects(save({ selections: [{ index: 0, quantity: 1 }, { index: '00', quantity: 1 }] }), /invalid_return_selection/);
  const added = await save();
  assert.equal(added.total_returned, 369600);
  assert.deepEqual(added.returns[0].returnDetails, exchange);
  await assert.rejects(save({ id: 'RET-stale' }), /return_order_changed/);
  await assert.rejects(save({ id: 'RET-over', returns: added.returns, total: added.total_returned, selections: [{ index: 0, quantity: 1 }] }), /invalid_return_quantity/);
  const edited = await save({ action: 'edit', returns: added.returns, total: added.total_returned, details: { ...exchange, note: '교체 완료 기록' } });
  assert.equal(edited.total_returned, 369600);
  assert.equal(edited.returns[0].returnedAt, added.returns[0].returnedAt);
  assert.equal(edited.returns[0].returnDetails.note, '교체 완료 기록');
  assert.deepEqual((await db.query('SELECT items FROM customer_returns')).rows, [{ items: edited.returns }]);
  const removed = await save({ action: 'remove', returns: edited.returns, total: edited.total_returned });
  assert.deepEqual(removed, { returns: [], total_returned: 0 });
  assert.deepEqual((await db.query('SELECT items FROM customer_returns')).rows, []);
  const legacy = added.returns.map(({ returnDetails, ...entry }) => entry);
  await db.query("UPDATE orders SET returns=$1::jsonb, total_returned=369600 WHERE id='original'", [JSON.stringify(legacy)]);
  const updatedLegacy = await save({ action: 'edit', returns: legacy, total: 369600 });
  assert.deepEqual(updatedLegacy.returns, added.returns);
  assert.equal(updatedLegacy.total_returned, 369600);
  assert.deepEqual((await db.query('SELECT items FROM customer_returns')).rows, [{ items: updatedLegacy.returns }]);
  console.log('반품 추가·기록 수정·취소, 기존 기록 보완, 단가·잔여 수량·동시 수정 검증, 거래처 기록 실패 롤백 통과');
} finally {
  await db.close();
}
