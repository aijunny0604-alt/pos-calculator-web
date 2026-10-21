import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const labRoot=process.env.MOVIS_PG_LAB_DIR || fileURLToPath(new URL('../../payment-db-lab/',import.meta.url));
const {default:EmbeddedPostgres}=await import(pathToFileURL(path.join(labRoot,'node_modules/embedded-postgres/dist/index.js')));
const databaseDir=path.join(labRoot,`data-${Date.now()}`);
const pgCtl=path.join(labRoot,'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe');
const ctl=args=>{const r=spawnSync(pgCtl,args,{windowsHide:true,encoding:'utf8',stdio:'ignore',timeout:20000});if(r.status!==0)throw new Error(r.stderr||r.stdout);};
const server=new EmbeddedPostgres({databaseDir,port:55437,user:'postgres',password:randomUUID(),persistent:true,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:console.error});
const clients=[];const report=[];
try {
 await server.initialise();ctl(['-D',databaseDir,'-l',path.join(databaseDir,'server.log'),'-o','-h 127.0.0.1 -p 55437','-w','start']);
 const connect=async()=>{const c=server.getPgClient('postgres','127.0.0.1');await c.connect();clients.push(c);await c.query("SET statement_timeout='8s'");return c;};
 const admin=await connect(),a=await connect(),b=await connect();
 const engine=(await admin.query('SHOW server_version')).rows[0].server_version;
 await admin.query(`CREATE TABLE payment_records(id bigint PRIMARY KEY,total_amount numeric,paid_amount numeric DEFAULT 0,balance numeric GENERATED ALWAYS AS(total_amount-paid_amount) STORED,updated_at timestamptz);
 CREATE TABLE payment_history(id bigint PRIMARY KEY,payment_record_id bigint REFERENCES payment_records(id) ON DELETE CASCADE,amount numeric,type text DEFAULT 'income');
 CREATE FUNCTION recalc_payment_record() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target_id BIGINT; BEGIN target_id:=COALESCE(NEW.payment_record_id,OLD.payment_record_id); UPDATE payment_records SET paid_amount=COALESCE((SELECT SUM(CASE WHEN type='expense' THEN -amount ELSE amount END) FROM payment_history WHERE payment_record_id=target_id),0),updated_at=NOW() WHERE id=target_id; RETURN COALESCE(NEW,OLD); END; $$;
 CREATE TRIGGER trg_recalc_payment AFTER INSERT OR UPDATE OR DELETE ON payment_history FOR EACH ROW EXECUTE FUNCTION recalc_payment_record();`);
 const reset=()=>admin.query('TRUNCATE payment_history,payment_records; INSERT INTO payment_records(id,total_amount) VALUES (1,1000),(2,1000)');
 const paid=async id=>Number((await admin.query('SELECT paid_amount FROM payment_records WHERE id=$1',[id])).rows[0].paid_amount);
 for(const version of ['before-20261015','current-production-function']) {
  if(version==='current-production-function')await admin.query(readFileSync(new URL('../supabase/migrations/20261015_payment_recalc_lock.sql',import.meta.url),'utf8').replace(/^\uFEFF/,''));
  await reset();
  await admin.query("INSERT INTO payment_history VALUES (1,1,400,'income'),(2,1,50,'expense')");assert.equal(await paid(1),350);
  await admin.query('UPDATE payment_history SET amount=100 WHERE id=2');assert.equal(await paid(1),300);
  await admin.query('DELETE FROM payment_history WHERE id=2');assert.equal(await paid(1),400);
  await admin.query('UPDATE payment_history SET payment_record_id=2 WHERE id=1');
  const movedOld=await paid(1);if(version==='current-production-function')assert.equal(movedOld,0);
  await reset();
  await assert.rejects(admin.query("INSERT INTO payment_history VALUES (1,1,100,'income'),(2,999,200,'income')"));assert.equal(await paid(1),0);assert.equal(Number((await admin.query('SELECT count(*) FROM payment_history')).rows[0].count),0);
  await a.query('BEGIN');await a.query("INSERT INTO payment_history VALUES (1,1,100,'income')");
  await b.query('BEGIN');const pid=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const pending=b.query("INSERT INTO payment_history VALUES (2,1,200,'income')");
  let waiting=false;
  for(let i=0;i<100;i++){const r=await admin.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid]);if(r.rows[0]?.wait_event_type==='Lock'){waiting=true;break;}await new Promise(r=>setTimeout(r,20));}
  assert.ok(waiting,'두 번째 세션의 잠금 대기를 확인해야 한다');
  await a.query('COMMIT');await pending;await b.query('COMMIT');
  const concurrentPaid=await paid(1);if(version==='current-production-function')assert.equal(concurrentPaid,300);
  report.push({engine,version,serialIncomeExpenseUpdateDelete:'pass',batchRollback:'pass',movedOldPaid:movedOld,concurrentPaid,expectedConcurrent:300});
 }
 await reset();
 await admin.query("INSERT INTO payment_history VALUES(10,1,100,'income'),(11,1,100,'income')");
 report.push({case:'same-request-replayed',paid:await paid(1),serverIdempotency:false});
 await admin.query('INSERT INTO payment_records(id,total_amount) VALUES (3,1000)');
 await assert.rejects(admin.query("INSERT INTO payment_history VALUES(12,999,100,'income')"));
 report.push({case:'separate-create-then-payment-failure',parentRemains:Number((await admin.query('SELECT count(*) FROM payment_records WHERE id=3')).rows[0].count)===1});
 console.log(JSON.stringify(report,null,2));writeFileSync(new URL('./.artifacts/payment-db-lab.json',import.meta.url),JSON.stringify(report,null,2));
} finally {for(const c of clients)await c.end().catch(()=>{});ctl(['-D',databaseDir,'-m','fast','-w','stop']);}


