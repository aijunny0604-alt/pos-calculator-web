import test from 'node:test';
import assert from 'node:assert/strict';
import {positiveMoney,paymentRows,toLocalDateTime,validateAllocation} from '../src/lib/paymentSafety.js';
test('금액은 유한한 양의 원화 정수만 허용한다',()=>{
 for(const value of [0,-1,'',null,NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>positiveMoney(value));
 assert.equal(positiveMoney('99000'),99000);
});
test('빈 응답과 부분 저장 응답은 성공 처리하지 않는다',()=>{
 for(const result of [null,[],{},[{}],[{id:1}]]) assert.throws(()=>paymentRows(result,2));
 assert.equal(paymentRows([{id:1},{id:2}],2).length,2);
});
test('일괄 입금에서 초과 금액·타 거래처·중복 명세서를 거부한다',()=>{
 const a={record:{id:1,customer_id:7,balance:100},apply:60};
 assert.doesNotThrow(()=>validateAllocation([a],60,7));
 assert.throws(()=>validateAllocation([a],70,7));
 assert.throws(()=>validateAllocation([a],60,8));
 assert.throws(()=>validateAllocation([a,a],120,7));
 assert.throws(()=>validateAllocation([{...a,apply:101}],101,7));
});
test('입금 시각은 현지 시간 입력값으로 변환한다',()=>{
 const date=new Date('2026-10-14T23:15:37Z');
 const value=toLocalDateTime(date);
 assert.equal(new Date(value).getTime(),date.getTime()-37000);
 assert.equal(toLocalDateTime('invalid'),'');
});
