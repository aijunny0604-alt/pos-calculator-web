import test from 'node:test';
import assert from 'node:assert/strict';
import {financeQuery, financeResult} from '../bridge/store-finance.mjs';
import {fetchStoreFinance} from '../src/lib/storeFinance.js';
const now = new Date('2026-10-26T15:30:00Z'); // 한국시간 10월 27일
test('부가세는 전월 말일 이내의 유효한 날짜만 허용한다', () => {
  assert.match(financeQuery('vat-case',{start:'2026-09-01',end:'2026-09-30'},now).url,/vat\/case\?pageNumber=1&pageSize=50&startDate=2026-09-01&endDate=2026-09-30/);
  for(const input of [{start:'2026-09-01',end:'2026-10-01'},{start:'2026-02-30',end:'2026-03-01'},{start:'2026-01-01',end:'2026-09-30'}]) assert.throws(()=>financeQuery('vat-case',input,now));
});
test('정산 기준일과 주문번호를 제한하고 임의 API 경로를 허용하지 않는다',()=>{
  const q=financeQuery('commission-details',{date:'2026-10-20',orderId:'20261020-123',page:2},now);
  assert.match(q.url,/periodType=SETTLE_CASEBYCASE_SETTLE_BASIS_DATE/);assert.match(q.url,/orderId=20261020-123/);
  assert.throws(()=>financeQuery('commission-details',{date:'2026-10-20',orderId:'../../bad'},now));
  assert.throws(()=>financeQuery('other',{date:'2026-10-20'},now));
});
test('응답은 금액·상태·페이지를 유지하며 구매자·계좌 정보를 제외한다',()=>{
  const data={elements:[{productName:'샘플',settleExpectAmount:0,settleCompleteDate:null,purchaserName:'개인정보',accountNo:'123'}],pagination:{totalPages:2,totalElements:51}};
  const r=financeResult('settlement-case',data,1,now);
  assert.equal(r.last,false);assert.equal(r.totalElements,51);assert.equal(r.elements[0].settleExpectAmount,0);assert.equal(r.elements[0].settleCompleteDate,null);
  assert.equal('purchaserName' in r.elements[0],false);assert.equal('accountNo' in r.elements[0],false);
  assert.throws(()=>financeResult('settlement-case',{elements:null},1,now));
});
test('연결 및 네이버 실패는 빈 자료로 속이지 않는다',async()=>{
  const fetcher=async url=>url.endsWith('/session')?{ok:true,json:async()=>({token:'test'})}:{ok:false,status:403,json:async()=>({error:'권한 확인'})};
  await assert.rejects(()=>fetchStoreFinance('vat-case',{start:'2026-09-01',end:'2026-09-30'},fetcher),/권한 확인/);
  await assert.rejects(()=>fetchStoreFinance('unknown',{},fetcher),/지원하지/);
});
