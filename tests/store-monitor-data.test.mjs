import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchStoreMonitorOrders, fetchStoreDispatchStates } from '../src/lib/storeMonitorData.js';

test('발송 대기는 대상 ID의 상태만 조회하고 실패를 숨기지 않는다', async () => {
  let count = 0;
  const rows = await fetchStoreDispatchStates('https://example.test', {}, ['A','A','B'], async url => {
    const params = new URL(url).searchParams;
    assert.equal(params.get('id'), 'in.("A","B")');
    assert.equal(params.get('select').includes('raw_payload'), false);
    count++;
    return new Response(JSON.stringify([{id:'A',naver_dispatch_succeeded_at:'2026-10-22T00:00:00Z'}]));
  });
  assert.equal(count, 1);
  assert.equal(rows.length, 1);
  assert.deepEqual(await fetchStoreDispatchStates('https://example.test', {}, [], () => { throw Error('호출 금지'); }), []);
  await assert.rejects(fetchStoreDispatchStates('https://example.test', {}, ['A'], async () => new Response('{}',{status:503})), /503/);
});

test('최신 200건 밖의 미발송을 페이지 끝까지 읽고 중복은 제거한다', async () => {
  const waiting = Array.from({length:503}, (_,i)=>({id:`W${i}`,order_status:'converted',internal_order_id:`POS${i}`}));
  const latest = Array.from({length:200}, (_,i)=>({id:i===0?'W0':`R${i}`,order_status:'shipped'}));
  const calls = [];
  const result = await fetchStoreMonitorOrders('https://example.test', {}, async url => {
    const q=new URL(url).searchParams;
    const outstanding=q.has('or');
    calls.push(q);
    if(outstanding) {
      assert.equal(q.get('naver_dispatch_succeeded_at'),'is.null');
      assert.equal(q.get('or').includes('converted'),false);
      assert.equal(q.has('internal_order_id'),false);
    }
    const data=outstanding?waiting:latest;
    const offset=Number(q.get('offset'));
    const page=data.slice(offset,offset+Number(q.get('limit')));
    return new Response(JSON.stringify(page),{headers:{'content-range':`${offset}-${offset+page.length-1}/${data.length}`}});
  });
  assert.equal(result.length,702);
  assert.ok(result.some(o=>o.id==='W502'));
  assert.equal(result.find(o=>o.id==='W0').order_status,'shipped');
  assert.equal(calls.filter(q=>q.has('or')).length,2);
});

test('오래된 미발송 조회 실패를 정상 빈 목록으로 처리하지 않는다', async () => {
  await assert.rejects(fetchStoreMonitorOrders('https://example.test', {}, async url =>
    new URL(url).searchParams.has('or') ? new Response('{}',{status:503}) : new Response('[]')
  ), /503/);
});
