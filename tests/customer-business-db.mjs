// PGlite는 격리된 개발 환경에 설치하며 운영 의존성에는 추가하지 않는다.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated;
    create table public.customers(id bigint primary key, name text, business_cert_url text, business_cert_path text);
    insert into public.customers values(1,'기존 업체','https://example.test/old.png','old.png'),(2,'신규 업체',null,null);
    grant select, update on public.customers to anon,authenticated;`);
  const migration = await readFile(new URL('../supabase/migrations/20261118_customer_business_history.sql',import.meta.url),'utf8');
  await db.exec(migration); await db.exec(migration);
  await db.exec(`set role anon; update customers set business_profile='{"company_name":"새 사업자","business_number":"1234567890"}' where id=1; reset role;`);
  let rows = (await db.query('select * from customer_business_history')).rows;
  assert.equal(rows.length,1); assert.equal(rows[0].snapshot.cert_path,'old.png');
  await db.exec(`update customers set name='표시명 수정' where id=1; update customers set business_profile=business_profile where id=1;`);
  assert.equal((await db.query('select * from customer_business_history')).rows.length,1);
  await db.exec(`update customers set business_cert_url='https://example.test/new.png',business_cert_path='new.png' where id=1`);
  rows = (await db.query('select * from customer_business_history order by changed_at')).rows;
  assert.equal(rows.length,2); assert.equal(rows[1].snapshot.profile.company_name,'새 사업자');
  await db.exec(`update customers set business_profile='{"company_name":"처음 등록","business_number":"9876543210"}' where id=2`);
  assert.equal((await db.query('select * from customer_business_history')).rows.length,2);
  await db.exec(`alter table customer_business_history add constraint reject_test_snapshot check (snapshot->'profile'->>'business_number' is distinct from '1234567890') not valid;`);
  await assert.rejects(db.exec(`update customers set business_profile='{"company_name":"저장되면 안됨"}' where id=1`));
  assert.equal((await db.query('select business_profile from customers where id=1')).rows[0].business_profile.company_name,'새 사업자');
  await db.exec('alter table customer_business_history drop constraint reject_test_snapshot');
  await db.exec('set role anon');
  assert.equal((await db.query('select * from customer_business_history')).rows.length,2);
  await assert.rejects(db.exec('delete from customer_business_history'));
  await db.exec('reset role; alter table customers enable row level security; set role anon;');
  assert.equal((await db.query('select * from customer_business_history')).rows.length,0);
  console.log('이력·등록증 보존, 동일값·첫등록 제외, 이력 저장 실패 롤백, 직접 삭제 거부와 RLS 연동 통과');
} finally { await db.close(); }
