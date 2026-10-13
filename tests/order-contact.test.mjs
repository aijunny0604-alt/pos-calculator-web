import test from 'node:test';
import assert from 'node:assert/strict';
import {orderContactText} from '../src/lib/orderContact.js';
const customers=[{id:1,name:'테스트 업체',phone:'010-0000-0000',address:'거래처 기본 주소'}];
test('주문 연락처와 주소를 우선하고 줄바꿈을 보존한다',()=>{
 assert.equal(orderContactText({customerName:'테스트 업체',customerPhone:' 02-000-0000 ',customerAddress:'주문 배송지\n상세주소'},customers),'연락처: 02-000-0000\n주소: 주문 배송지\n상세주소\n');
});
test('없는 정보만 일치한 거래처에서 보완한다',()=>{
 assert.equal(orderContactText({customerName:'테스트 업체',customerPhone:'010-1111-1111'},customers),'연락처: 010-1111-1111\n주소: 거래처 기본 주소\n');
 assert.equal(orderContactText({name:'테스트 업체',phone:'',address:''},customers),'연락처: 010-0000-0000\n주소: 거래처 기본 주소\n');
});
test('동명이인·미등록·잘못된 ID를 추측하지 않는다',()=>{
 assert.equal(orderContactText({customerName:'테스트 업체'},[...customers,{...customers[0],id:2}]),'');
 assert.equal(orderContactText({customerName:'테스트 업체',customerId:9},customers),'');
 assert.equal(orderContactText({},customers),'');
 assert.equal(orderContactText({customerName:'테스트 업체',customerId:1},[...customers,{...customers[0],id:2}]),'연락처: 010-0000-0000\n주소: 거래처 기본 주소\n');
});
