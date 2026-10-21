import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPosRows } from '../src/lib/posConnection.js';
test('서버 응답 상한보다 많은 자료를 모두 읽고 필터를 보존한다',async()=>{
  const data=Array.from({length:1203},(_,id)=>({id}));let calls=0;
  const result=await fetchPosRows('https://example.test/records?customer_id=eq.7&order=id.asc',{},async raw=>{
    const url=new URL(raw);assert.equal(url.searchParams.get('customer_id'),'eq.7');calls++;
    const offset=Number(url.searchParams.get('offset')),limit=Math.min(200,Number(url.searchParams.get('limit')));
    const page=data.slice(offset,offset+limit);
    return new Response(JSON.stringify(page),{headers:{'Content-Range':`${offset}-${offset+page.length-1}/${data.length}`}});
  });
  assert.equal(calls,7);assert.deepEqual(result,data);
});
test('최근 N건 요청은 명시한 건수만 조회한다',async()=>{
  const result=await fetchPosRows('https://example.test/history?limit=2',{},async raw=>{
    assert.equal(new URL(raw).searchParams.get('limit'),'2');
    return new Response('[{"id":1},{"id":2}]',{headers:{'Content-Range':'0-1/1000'}});
  });assert.equal(result.length,2);
});
test('중간 페이지 실패나 불완전 빈 응답을 부분 합계로 반환하지 않는다',async()=>{
  for(const fail of [()=>new Response('denied',{status:503}),()=>new Response('[]',{headers:{'Content-Range':'*/4'}})]) {
    let calls=0;await assert.rejects(fetchPosRows('https://example.test/history',{},async()=>++calls===1?new Response('[{"id":1},{"id":2}]',{headers:{'Content-Range':'0-1/4'}}):fail()));
  }
});
