import test from 'node:test';
import assert from 'node:assert/strict';
import { getStoreOrderView, matchesStoreWidget, orderStage, isStoreAwaitingDispatch } from '../src/lib/storeOrderView.js';

const now = new Date(2026, 9, 21, 12).getTime();
const today = new Date(2026, 9, 21, 10).toISOString();
const yesterday = new Date(2026, 9, 20, 10).toISOString();
const range = { from: new Date(2026, 9, 21), to: new Date(2026, 9, 22) };
const row = (id, status, extra = {}) => ({ id, provider: 'naver', buyer_name: id, received_at: today, order_status: status, ...extra });
const options = { dateRange: range, now };

test('어제 접수·오늘 발송한 주문은 단계 숫자와 클릭 목록 모두에 포함한다', () => {
  const orders = [row('오늘발송', 'shipped'), row('어제접수', 'shipped', { received_at: yesterday, naver_dispatch_succeeded_at: today }), row('지난발송', 'shipped', { received_at: yesterday, naver_dispatch_succeeded_at: yesterday })];
  const view = getStoreOrderView(orders, { ...options, statusFilter: 's2' });
  assert.equal(view.stages.stages[2], 2);
  assert.deepEqual(view.filtered.map(o => o.id), ['오늘발송', '어제접수']);
});

test('진행 단계별 건수는 날짜·검색·마켓·종결 숨김 조합에서도 클릭 결과와 같다', () => {
  const orders = ['PAYED', 'confirmed', 'shipped', 'DELIVERING', 'DELIVERED', 'PURCHASE_DECIDED', 'CANCELED', 'PAYMENT_WAITING']
    .map((s, i) => row(`샘플${i}`, s));
  orders.push(row('다른마켓', 'shipped', { provider: 'mock' }));
  orders.push(row('이전미처리', 'PAYED', { received_at: yesterday }));
  for (const providerFilter of ['all', 'naver', 'mock']) for (const searchQuery of ['', '샘플']) for (const showCompleted of [false, true]) {
    const common = { ...options, providerFilter, searchQuery, showCompleted };
    const base = getStoreOrderView(orders, common);
    for (let i = 0; i < 5; i++) assert.equal(getStoreOrderView(orders, { ...common, statusFilter: `s${i}` }).filtered.length, base.stages.stages[i]);
    assert.equal(getStoreOrderView(orders, { ...common, statusFilter: 'cancel' }).filtered.length, base.stages.canceled);
    assert.equal(getStoreOrderView(orders, { ...common, statusFilter: 'unpaid' }).filtered.length, base.stages.unpaid);
  }
});

test('배송완료의 반품요청과 결제완료의 취소요청은 배송 단계에 중복되지 않는다', () => {
  const orders = [row('반품요청', 'DELIVERED'), row('취소요청', 'PAYED')];
  const itemsByOrder = { 반품요청: [{ raw_payload: { productOrder: { claimStatus: 'RETURN_REQUEST', claimType: 'RETURN' } } }], 취소요청: [{ raw_payload: { productOrder: { claimStatus: 'CANCEL_REQUEST' } } }] };
  const view = getStoreOrderView(orders, { ...options, itemsByOrder });
  assert.deepEqual(view.stages.stages, [0, 0, 0, 0, 0]);
  assert.equal(view.stages.canceled, 2);
  assert.equal(getStoreOrderView(orders, { ...options, itemsByOrder, statusFilter: 's4' }).filtered.length, 0);
  assert.equal(getStoreOrderView(orders, { ...options, itemsByOrder, statusFilter: 'cancel' }).filtered.length, 2);
});

test('빠른 확인은 전체 기간을 집계하고 클릭해도 동일 건수다', () => {
  const orders = [row('예전대기', 'PAYED', { received_at: yesterday, needs_naver_confirm: true, dispatch_due_date: today }), row('종료큐잔존', 'shipped', { needs_naver_dispatch: true }), row('취소완료', 'CANCELED'), row('취소대기', 'CANCEL_REQUEST')];
  const view = getStoreOrderView(orders, options);
  for (const key of Object.keys(view.widgets)) assert.equal(getStoreOrderView(orders, { ...options, widgetFilter: key }).filtered.length, view.widgets[key]);
  assert.equal(view.widgets.autoPending, 1);
  assert.equal(view.widgets.cancel, 1);
  assert.equal(view.widgets.needShip, 1);
  assert.equal(view.widgets.dueDday, 1); // 오늘 오전 기한도 D-day와 초과에 모두 해당
  assert.equal(view.widgets.overdue, 1);
});

test('배송중은 발송대기/기한 초과에서 제외하고 손상된 날짜를 초과로 만들지 않는다', () => {
  assert.equal(matchesStoreWidget(row('배송중', 'DELIVERING', { dispatch_due_date: yesterday }), [], 'overdue', now), false);
  assert.equal(matchesStoreWidget(row('손상', 'PAYED', { dispatch_due_date: '잘못된 날짜' }), [], 'overdue', now), false);
  assert.equal(orderStage(row('배송완료', 'DELIVERED', { naver_dispatch_succeeded_at: today })).stage, 4);
  assert.equal(orderStage(row('배송중', 'DELIVERING', { naver_dispatch_succeeded_at: today })).stage, 3);
});

test('오늘 접수 KPI는 오늘 작업한 과거 주문과 구분한다', () => {
  const orders = [row('오늘접수', 'shipped'), row('과거접수오늘작업', 'shipped', { received_at: yesterday, naver_dispatch_succeeded_at: today })];
  assert.deepEqual(getStoreOrderView(orders, { ...options, widgetFilter: 'receivedToday' }).filtered.map(o => o.id), ['오늘접수']);
});

test('기간 끝날의 마지막 밀리초는 포함하고 다음날 자정은 제외한다', () => {
  const orders = [row('마지막', 'shipped', { received_at: new Date(2026, 9, 21, 23, 59, 59, 999).toISOString() }), row('다음날', 'shipped', { received_at: new Date(2026, 9, 22).toISOString() })];
  assert.deepEqual(getStoreOrderView(orders, options).filtered.map(o => o.id), ['마지막']);
});

test('단계 해제는 원래 조회 범위로 돌아가고 완료 건은 원래 숨김 설정을 따른다', () => {
  const orders = [row('완료', 'DELIVERED'), row('진행', 'DELIVERING')];
  assert.equal(getStoreOrderView(orders, { ...options, statusFilter: 's4' }).filtered[0].id, '완료');
  assert.deepEqual(getStoreOrderView(orders, options).filtered.map(o => o.id), ['진행']);
});

test('대표 상태 shipped여도 상품별 네이버 배송중·배송완료를 위젯과 필터에 반영한다', () => {
  const orders = [row('진행', 'shipped'), row('완료', 'shipped')];
  const item = status => ({raw_payload:{productOrder:{productOrderStatus:status}}});
  const itemsByOrder = {진행:[item('DELIVERING'),item('DELIVERED')],완료:[item('DELIVERED'),item('PURCHASE_DECIDED')]};
  const common = {...options,itemsByOrder};
  const view = getStoreOrderView(orders,common);
  assert.deepEqual(view.stages.stages,[0,0,0,1,1]);
  assert.deepEqual(view.filtered.map(o=>o.id),['진행']);
  assert.deepEqual(getStoreOrderView(orders,{...common,statusFilter:'s4'}).filtered.map(o=>o.id),['완료']);
  assert.equal(orderStage(orders[0],itemsByOrder.진행).stage,3);
  assert.equal(orders[0].order_status,'shipped');
});

test('일부 배송완료·상태 누락·취소 품목을 섞어도 전체 완료를 성급하게 표시하지 않는다', () => {
  const item = status => ({raw_payload:{productOrder:{productOrderStatus:status}}});
  const o=row('혼합','shipped');
  assert.equal(orderStage(o,[item('DELIVERED'),item('PAYED')]).stage,2);
  assert.equal(orderStage(o,[item('DELIVERED'),{}]).stage,2);
  assert.equal(orderStage(o,[item('DELIVERED'),item('CANCELED')]).stage,4);
  assert.equal(orderStage(row('취소','CANCELED'),[item('DELIVERING')]).canceled,true);
  assert.equal(orderStage(row('완료','DELIVERED'),[item('PAYED')]).stage,4);
  assert.equal(orderStage(row('원본','shipped',{raw_payload:{productOrder:{productOrderStatus:'DELIVERING'}}})).stage,3);
  assert.equal(matchesStoreWidget(row('뒤처짐','confirmed',{needs_naver_dispatch:true}),[item('DELIVERING')],'autoPending',now),false);
});


test('이전 발주확인·내부등록 주문은 오늘/다음날/사용자 기간에도 미발송으로 남는다', () => {
  const orders = [row('확인내부등록', 'confirmed', {received_at:yesterday,naver_confirm_succeeded_at:yesterday,internal_order_id:'POS-1'}),
    row('전환미발송', 'converted', {received_at:yesterday,internal_order_id:'POS-2'}),
    row('발송성공', 'confirmed', {received_at:yesterday,internal_order_id:'POS-3',naver_dispatch_succeeded_at:yesterday})];
  for (const day of [21,22,28]) {
    const dateRange = {from:new Date(2026,9,day),to:new Date(2026,9,day+1)};
    const common = {...options,dateRange};
    const view = getStoreOrderView(orders,common);
    assert.equal(view.stages.stages[1],2);
    assert.equal(view.widgets.needShip,2);
    assert.equal(view.widgets.newAfterConfirm,2);
    assert.deepEqual(getStoreOrderView(orders,{...common,statusFilter:'s1'}).filtered.map(o=>o.id),['확인내부등록','전환미발송']);
    assert.deepEqual(view.filtered.map(o=>o.id),['확인내부등록','전환미발송']);
  }
});

test('발송 실패/대기열/송장만 입력된 주문은 남고 발송 성공·종결·미결제·클레임은 제외한다', () => {
  const base = row('예전확인','confirmed',{received_at:yesterday,internal_order_id:'POS',naver_confirm_succeeded_at:yesterday});
  for (const extra of [{},{needs_naver_dispatch:true},{naver_dispatch_error:'실패'},{tracking_number:'1234'}])
    assert.equal(isStoreAwaitingDispatch({...base,...extra}),true);
  for (const status of ['shipped','DISPATCHED','DELIVERING','DELIVERED','PURCHASE_DECIDED','CANCELED','CANCEL_REQUEST','RETURNED','EXCHANGED','PAYMENT_WAITING','PAY_WAITING'])
    assert.equal(isStoreAwaitingDispatch({...base,order_status:status}),false,status);
  assert.equal(isStoreAwaitingDispatch({...base,naver_dispatch_succeeded_at:today}),false);
  assert.equal(isStoreAwaitingDispatch({...base,naver_cancel_succeeded_at:today}),false);
  assert.equal(orderStage({...base,naver_cancel_succeeded_at:today}).canceled,true);
  for (const status of ['DELIVERING','DELIVERED']) assert.equal(isStoreAwaitingDispatch(base,[{raw_payload:{productOrder:{productOrderStatus:status}}}]),false);
  assert.equal(isStoreAwaitingDispatch(base,[{raw_payload:{productOrder:{claimStatus:'CANCEL_REQUEST'}}}]),false);
});

test('미발송 예외도 마켓/검색 필터를 지키고 발송 완료 뒤 다음날 범위에서는 빠진다', () => {
  const orders = [row('네이버','converted',{received_at:yesterday,provider:'naver',internal_order_id:'P1'}),row('타마켓','confirmed',{received_at:yesterday,provider:'mock'})];
  const common = {...options,providerFilter:'naver'};
  assert.equal(getStoreOrderView(orders,common).widgets.needShip,1);
  assert.equal(getStoreOrderView(orders,{...common,searchQuery:'없음'}).filtered.length,0);
  orders[0] = {...orders[0],naver_dispatch_succeeded_at:today};
  assert.equal(getStoreOrderView(orders,common).stages.stages[1],0);
  assert.equal(getStoreOrderView(orders,common).stages.stages[2],1);
  assert.equal(getStoreOrderView(orders,common).widgets.needShip,0);
  assert.equal(getStoreOrderView(orders,{...common,dateRange:{from:range.to,to:new Date(2026,9,23)}}).filtered.length,0);
});
