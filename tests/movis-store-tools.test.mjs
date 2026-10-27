import test from 'node:test';
import assert from 'node:assert/strict';
import { executeMovisStoreTool, commitStoreReorder, fetchStoreQuestions, fetchStoreSettlements } from '../src/lib/movisStoreTools.js';
import { REORDER_KEY } from '../src/lib/storeReorder.js';

const memory = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) }; };
const context = { dataState: { externalProducts: { status: 'loaded', coverage: 'complete' } }, externalProducts: [
  { channel_product_no: '1', name: '자바라', status_type: 'SALE', synced_at: '2026-10-27T00:00:00Z', options: [{ id: 'a', name: '63', stock: 0 }, { id: 'b', name: '64', stock: 2 }, { id: 'c', name: '70', stock: null }] },
  { channel_product_no: '2', name: '플랜지', status_type: 'OUTOFSTOCK', options: [] },
  { channel_product_no: '3', name: '정지 상품', status_type: 'SUSPENSION', options: [{ name: '0', stock: 0 }] },
] };

test('품절과 재고 부족은 상태와 실제 숫자에 따라 구분한다', () => {
  const result = executeMovisStoreTool('getStoreShortages', {}, context);
  assert.equal(result.data.counts.attention, 2);
  assert.equal(result.data.counts.suspended, 1);
  assert.deepEqual(result.data.items[1].options.map(o => o.name), ['63']);
  const low = executeMovisStoreTool('getStoreShortages', { status: 'low', threshold: 3 }, context);
  assert.deepEqual(low.data.items[0].options, [{ name: '64', stock: 2 }]);
  assert.equal(executeMovisStoreTool('getStoreShortages', {}, { ...context, dataState: { externalProducts: { status: 'error' } } }).ok, false);
});

test('품절 옵션 추가는 미리보기 후 저장하며 중복을 방지한다', () => {
  const s = memory();
  const pending = executeMovisStoreTool('prepareStoreReorder', { operation: 'add', productId: '1' }, context, s).data;
  assert.equal(s.getItem(REORDER_KEY), null);
  assert.equal(pending.params.after.length, 1);
  commitStoreReorder(pending.params, s);
  assert.equal(executeMovisStoreTool('getStoreReorders', {}, context, s).data.items[0].option, '63');
  assert.throws(() => executeMovisStoreTool('prepareStoreReorder', { operation: 'add', productId: '1' }, context, s), /이미/);
  assert.throws(() => executeMovisStoreTool('prepareStoreReorder', { operation: 'add', productId: '3' }, context, s), /품절/);
});

test('요청한 한 옵션만 추가하고 선택한 목록 항목만 제거한다', () => {
  const s = memory();
  const multi = { ...context, externalProducts: [{ ...context.externalProducts[0], options: [{ id: 'a', name: '63', stock: 0 }, { id: 'b', name: '64', stock: 0 }] }] };
  const first = executeMovisStoreTool('prepareStoreReorder', { operation: 'add', productId: '1', optionName: '63' }, multi, s).data.params;
  assert.deepEqual(first.after.map(r => r.option), ['63']);
  commitStoreReorder(first, s);
  const remove = executeMovisStoreTool('prepareStoreReorder', { operation: 'remove', key: first.after[0].key }, multi, s).data.params;
  assert.equal(executeMovisStoreTool('getStoreReorders', {}, multi, s).data.items.length, 1);
  commitStoreReorder(remove, s);
  assert.equal(executeMovisStoreTool('getStoreReorders', {}, multi, s).data.items.length, 0);
  assert.throws(() => executeMovisStoreTool('prepareStoreReorder', { operation: 'add', productId: '1', optionName: '없는 옵션' }, multi, s), /옵션/);
});

test('수량·완료 표시를 검증하고 다른 탭에서 바뀐 목록은 덮어쓰지 않는다', () => {
  const s = memory();
  commitStoreReorder(executeMovisStoreTool('prepareStoreReorder', { operation: 'add', productId: '2' }, context, s).data.params, s);
  const key = executeMovisStoreTool('getStoreReorders', {}, context, s).data.items[0].key;
  assert.throws(() => executeMovisStoreTool('prepareStoreReorder', { operation: 'update', key, ordered: true }, context, s), /수량/);
  const p = executeMovisStoreTool('prepareStoreReorder', { operation: 'update', key, quantity: 4, ordered: true }, context, s).data.params;
  const other = executeMovisStoreTool('prepareStoreReorder', { operation: 'update', key, note: '변경' }, context, s).data.params;
  commitStoreReorder(other, s);
  assert.throws(() => commitStoreReorder(p, s), /변경/);
  assert.equal(executeMovisStoreTool('getStoreReorders', {}, context, s).data.items[0].note, '변경');
});

test('잘못된 저장 자료와 저장 실패를 성공으로 처리하지 않는다', () => {
  const s = memory(); s.setItem(REORDER_KEY, '{}');
  assert.throws(() => executeMovisStoreTool('getStoreReorders', {}, context, s), /형식/);
  const clean = memory(); const p = executeMovisStoreTool('prepareStoreReorder', { operation: 'add', productId: '2' }, context, clean).data.params;
  clean.setItem = () => { throw Error('저장 실패'); };
  assert.throws(() => commitStoreReorder(p, clean), /저장 실패/);
});

test('문의 조회는 페이지 정보를 보존하고 API 실패를 빈 목록으로 바꾸지 않는다', async () => {
  const requests = [];
  const fetcher = async (url, init) => { requests.push([url, init]); return url.endsWith('/session') ? { ok: true, json: async () => ({ token: 'test' }) } : { ok: true, json: async () => ({ contents: [{ questionId: 2, productName: '상품', question: '문의', answered: false }], last: true }) }; };
  const response = await fetchStoreQuestions({ days: 7 }, fetcher);
  assert.equal(response.data.items[0].question, '문의');
  assert.match(requests[1][0], /days=7.*answered=false/);
  const failure = await fetchStoreQuestions({}, async url => url.endsWith('/session') ? { ok: true, json: async () => ({ token: 'test' }) } : { ok: false, json: async () => ({ error: '권한 없음' }) });
  assert.equal(failure.ok, false);
  assert.match(failure.error, /권한 없음/);
});

test('정산은 공식 응답과 페이지 범위를 보존하며 오류를 0원으로 바꾸지 않는다', async () => {
  const fetcher = async url => url.endsWith('/session') ? { ok: true, json: async () => ({ token: 'test' }) } : { ok: true, json: async () => ({ elements: [{ settleAmount: 123, settleCompleteDate: null }], page: 1, last: false }) };
  const result = await fetchStoreSettlements({ start: '2026-10-01', end: '2026-10-26' }, fetcher);
  assert.equal(result.data.items[0].settleAmount, 123);
  assert.equal(result.data.last, false);
  const error = await fetchStoreSettlements({ start: '2026-10-01', end: '2026-10-26' }, async url => url.endsWith('/session') ? { ok: true, json: async () => ({ token: 'test' }) } : { ok: false, json: async () => ({ error: '권한 없음' }) });
  assert.equal(error.ok, false);
  assert.match(error.error, /권한 없음/);
});

test('한 주문의 서로 다른 상품별 취소·반품 요청을 구분하고 자료 실패를 알린다', () => {
  const claims = { externalOrders:[{id:'order1',provider_order_id:'S-1'}], externalOrderItems:[
    {external_order_id:'order1',provider_product_name:'상품 A',raw_payload:{productOrder:{claimType:'RETURN',claimStatus:'RETURN_REQUEST'}}},
    {external_order_id:'order1',provider_product_name:'상품 B',raw_payload:{productOrder:{claimType:'CANCEL',claimStatus:'CANCEL_REQUEST'}}},
    {external_order_id:'order1',provider_product_name:'상품 C',raw_payload:{productOrder:{claimType:'RETURN',claimStatus:'RETURN_DONE'}}},
  ], dataState:{externalOrders:{status:'loaded',coverage:'complete'},externalOrderItems:{status:'loaded',coverage:'complete'}} };
  const result=executeMovisStoreTool('getStoreClaims',{},claims);
  assert.equal(result.data.total,2);assert.deepEqual(result.data.items.map(item=>item.type),['RETURN','CANCEL']);
  assert.equal(executeMovisStoreTool('getStoreClaims',{type:'RETURN'},claims).data.total,1);
  assert.equal(executeMovisStoreTool('getStoreClaims',{}, {...claims,dataState:{...claims.dataState,externalOrderItems:{status:'error'}}}).ok,false);
});
