import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyOrderChannel, aggregateByChannel, getNaverDispatchOrderId } from '../src/lib/channelClassifier.js';
import { mergeOrderMemos, loadedCustomerMemo, savedCartOrderPayload, confirmSavedCart } from '../src/lib/cartOrderContext.js';

const customers = [{id:1,name:'스토어 고객',category:'엠파츠'},{id:2,name:'일반 업체',category:'도매'}];
const memo = '[엠파츠] [네이버 스마트스토어] 202610210000001\n구매자: 스토어 고객';
const cart = {id:'cart',name:'스토어 고객',memo,created_at:'2026-10-21T01:00:00Z',delivery_date:'2026-10-22',status:'scheduled',price_type:'retail',items:[{name:'상품',price:110000,quantity:1}]};

test('메모가 없는 기존 예약 주문도 정확한 스토어 거래처로 분류한다',()=>{
  assert.equal(classifyOrderChannel({customerName:'스토어고객'},customers),'naver');
  assert.equal(classifyOrderChannel({customer_id:1,customerName:'변경된 이름'},customers),'naver');
  assert.equal(classifyOrderChannel({customerName:'일반 업체'},customers),'general');
  assert.equal(classifyOrderChannel({customerName:'스토어'},customers),'general');
  assert.equal(classifyOrderChannel({customerName:'스토어 고객',customer_id:2},customers),'general');
});
test('이름 중복과 존재하지 않는 명시적 고객 ID로는 스토어 주문을 추정하지 않는다',()=>{
  assert.equal(classifyOrderChannel({customerName:'스토어 고객'},[...customers,{id:3,name:'스토어 고객'}]),'general');
  assert.equal(classifyOrderChannel({customerName:'스토어 고객',customer_id:99},customers),'general');
  assert.equal(classifyOrderChannel({memo}),'naver');
  assert.equal(classifyOrderChannel({customer_name:'엠파츠'}),'naver');
});
test('카드와 채널 집계가 동일한 분류를 사용한다',()=>{
  const totals=aggregateByChannel([{customerName:'스토어 고객',totalAmount:110000},{customerName:'일반 업체',totalAmount:20000}],customers);
  assert.deepEqual(totals.naver,{count:1,revenue:110000});
  assert.deepEqual(totals.general,{count:1,revenue:20000});
});
test('장바구니 저장 후 다음날 예약·주문해도 출처와 외부 번호를 보존한다',()=>{
  const saved={...cart,memo:mergeOrderMemos(memo,'주문이력에서 복사 (SAMPLE-1)','출고 예약')};
  const order=savedCartOrderPayload(saved);
  assert.equal(classifyOrderChannel(order),'naver');
  assert.equal(getNaverDispatchOrderId(order),'202610210000001');
  assert.equal(order.total_amount,110000);
  assert.equal(order.price_type,'retail');
  assert.match(order.memo,/출고 예약/);
});
test('POS에서 같은 고객 메모는 유지하고 고객 변경 시 이전 외부 주문 연결은 넘기지 않는다',()=>{
  assert.equal(loadedCustomerMemo(cart,'스토어고객','추가 메모'),`${memo}\n추가 메모`);
  assert.equal(loadedCustomerMemo(cart,'다른 고객','추가 메모'),'추가 메모');
  assert.equal(mergeOrderMemos(memo,memo),memo);
});
test('카테고리만 있는 주문 및 여러 외부 주문이 병합된 주문은 자동 발송 대상에서 제외한다',()=>{
  assert.equal(getNaverDispatchOrderId({customerName:'스토어 고객'}),null);
  assert.equal(getNaverDispatchOrderId({memo:mergeOrderMemos(memo,'[네이버 스마트스토어] 202610210000002')}),null);
  assert.equal(getNaverDispatchOrderId({memo:`${memo}\n${memo}`}), '202610210000001');
});
test('저장된 0원 할인 단가를 원가로 되돌리지 않고 단가 누락만 보완한다',()=>{
  const order=savedCartOrderPayload({...cart,items:[{price:0,retail:100,quantity:1},{retail:200,quantity:2},{price:50,retail:100,quantity:0}]});
  assert.equal(order.total_amount,400);
  assert.equal(order.items[0].price,0);
});
test('주문 저장 완료 이후에만 장바구니를 삭제한다',async()=>{
  const events=[];
  const result=await confirmSavedCart(cart,async payload=>{events.push('저장');assert.equal(payload.memo,memo);return {id:'order'};},async id=>{assert.equal(id,'cart');events.push('삭제');});
  assert.deepEqual(events,['저장','삭제']);
  assert.equal(result.id,'order');
});
test('주문 저장 취소·실패 시 장바구니는 남긴다',async()=>{
  let deleted=false;
  const remove=async()=>{deleted=true;};
  assert.equal(await confirmSavedCart(cart,async()=>null,remove),null);
  await assert.rejects(confirmSavedCart(cart,async()=>{throw Error('저장 실패');},remove));
  assert.equal(deleted,false);
});
