import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE orders(id text PRIMARY KEY, customer_name text, customer_id text, customer_phone text,
      customer_address text, price_type text, items jsonb, returns jsonb, total numeric, total_returned numeric DEFAULT 0,
      subtotal numeric, vat numeric, memo text, created_at timestamptz);
    CREATE TABLE products(id bigint PRIMARY KEY, name text, wholesale numeric, retail numeric, stock int, discount_tiers jsonb, tax_free boolean);
    CREATE TABLE customer_returns(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, return_id text, customer_name text, customer_id text,
      order_number text, items jsonb, total_amount numeric, returned_at timestamptz);
    GRANT SELECT, INSERT, UPDATE ON orders TO anon;
    GRANT SELECT, UPDATE ON products TO anon;
    GRANT SELECT, UPDATE, DELETE, INSERT ON customer_returns TO anon;
    INSERT INTO products VALUES (2,'교체 팁',100320,120000,8,NULL,false),
      (3,'다른 부속',25000,30000,1,NULL,true);
    INSERT INTO orders (id,customer_name,customer_id,customer_phone,customer_address,price_type,items,total,returns,total_returned) VALUES
      ('original','샘플 모터스','sample','1234','샘플 주소','wholesale','[{"id":1,"name":"기존 팁","price":92400,"quantity":4}]',
      369600,'[{"returnId":"RET-old","itemId":1,"itemName":"기존 팁","price":92400,"quantity":4,"total":369600,"returnedAt":"2026-11-26T02:00:00Z"}]',369600),
      ('second','다른 샘플','other',NULL,NULL,'retail','[{"id":1,"name":"기존 팁","price":120000,"quantity":2}]',240000,NULL,0);
  `);
  for (const file of ['20261126_order_return_details.sql', '20261126_exchange_dispatch_orders.sql']) {
    await db.exec(await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
  }
  await db.exec('SET ROLE anon');
  const [first, second] = (await db.query('SELECT * FROM orders ORDER BY id')).rows;
  const details = { kind: 'exchange', reason: '오배송', note: '샘플 교체 출고' };
  const piece = { id: 2, quantity: 4, basePrice: 100320, price: 100320, catalogTiers: [] };
  const dispatch = async ({
    source = first, action = 'edit', returnId = 'RET-old', requestId = 'RET-request',
    lines = [piece], method = 'courier', note = details, selections = [],
  } = {}) => (await db.query(
    'SELECT public.save_return_with_exchange_order($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb,$11) AS value',
    [source.id, action, returnId, JSON.stringify(source.items), JSON.stringify(source.returns || []), source.total_returned,
      JSON.stringify(selections), JSON.stringify(note), requestId, JSON.stringify(lines), method],
  )).rows[0].value;
  const state = async () => ({
    stocks: (await db.query('SELECT stock FROM products ORDER BY id')).rows.map(row => row.stock),
    newOrders: (await db.query('SELECT count(*)::int AS count FROM orders WHERE exchange_origin_order_id IS NOT NULL')).rows[0].count,
  });

  await assert.rejects(dispatch({ lines: [piece, { id: 3, quantity: 2, basePrice: 25000, price: 25000, catalogTiers: [] }] }), /exchange_stock_unavailable/);
  await assert.rejects(dispatch({ note: { ...details, reason: '잘못된 사유' } }), /invalid_return_details/);
  await assert.rejects(dispatch({ lines: [{ ...piece, basePrice: 101 }] }), /exchange_price_changed/);
  assert.deepEqual(await state(), { stocks: [8, 1], newOrders: 0 });

  const result = await dispatch();
  const [date] = (await db.query("SELECT to_char(now() AT TIME ZONE 'Asia/Seoul','YYYYMMDD') AS today")).rows;
  assert.ok(result.exchange_order.id.startsWith(`ORD-${date.today}-`));
  assert.equal(result.exchange_order.exchange_delivery_method, 'courier');
  assert.equal(result.exchange_order.customer_address, first.customer_address);
  assert.equal(result.exchange_order.total, 401280);
  assert.equal(result.total_returned, 369600);
  assert.equal(result.returns[0].returnDetails.exchangeOrderNumber, result.exchange_order.id);
  assert.equal(result.returns[0].returnDetails.replacement, '교체 팁 ×4');
  const [journal] = (await db.query("SELECT items FROM customer_returns WHERE order_number = 'original'")).rows;
  assert.deepEqual(journal.items, result.returns);
  const replay = await dispatch();
  assert.equal(replay.reused, true);
  assert.equal(replay.exchange_order.id, result.exchange_order.id);
  await assert.rejects(dispatch({ method: 'pickup' }), /exchange_already_created/);
  await assert.rejects(dispatch({ requestId: 'RET-another' }), /exchange_already_created/);
  assert.deepEqual(await state(), { stocks: [4, 1], newOrders: 1 });

  const pickup = await dispatch({
    source: second, action: 'add', returnId: 'RET-new', requestId: 'RET-new', selections: [{ index: 0, quantity: 1 }],
    lines: [{ id: 3, quantity: 1, basePrice: 30000, price: 30000, catalogTiers: [] }], method: 'pickup',
  });
  assert.equal(pickup.exchange_order.exchange_delivery_method, 'pickup');
  assert.equal(pickup.exchange_order.subtotal, 30000);
  assert.equal(pickup.exchange_order.vat, 0);
  assert.equal(pickup.total_returned, 120000);
  assert.deepEqual(await state(), { stocks: [4, 0], newOrders: 2 });
  console.log('매장 출고 주문과 반품 기록의 동시 저장, 재고·단가 오류 롤백, 재시도 중복 차단, 한국 날짜, 택배·방문 수령 통과');
} finally {
  await db.close();
}
