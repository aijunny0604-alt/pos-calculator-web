import test from 'node:test';
import assert from 'node:assert/strict';
import {customerMatches,orderProductMatches} from '../src/lib/customerSearch.mjs';
test('업체명 순서·혼합문자·중간 단어 생략·연락처',()=>{
 const c={name:'WP튠 김해',address:'경남 김해시',phone:'010-1234-5678'};
 for(const q of ['WP김해','김해 WP','김해WP','wp 튠','ＷＰ 김해','01012345678'])assert.equal(customerMatches(c,q),true,q);
 for(const q of ['WP 부산','01012345679','없는업체'])assert.equal(customerMatches(c,q),false,q);
});
test('제품은 한 품목 안에서 모든 검색어 충족, 규격 구분',()=>{
 const o={items:[{name:'스텐 밴딩 54-30'},{product_name:'브레이크 호스'}]};
 assert.equal(orderProductMatches(o,'밴딩 스텐'),true);
 assert.equal(orderProductMatches(o,'호스 브레이크'),true);
 assert.equal(orderProductMatches(o,'스텐 호스'),false);
 assert.equal(orderProductMatches(o,'밴딩 64'),false);
 assert.equal(orderProductMatches({},''),true);
});

test('초성·전각·분해 한글과 이름/지역/전화 조합', () => {
 const c = {name:'WP튠 김해', address:'경상남도 김해시 주촌면', phone:'010-1234-5678'};
 for (const q of ['wpㄱㅎ', 'ㄱㅎ WP', 'WP 경상남도', '김해 5678', 'WP 010-1234-5678', 'ＷＰㄱㅎ', '김해'.normalize('NFD'), 'WPᄀᄒ']) {
  assert.equal(customerMatches(c,q),true,q);
 }
 for (const q of ['wpㅂㅅ', 'WP 경기도', 'WP 010-5678-1234', '김해 5679', '경상남도 없는업체']) {
  assert.equal(customerMatches(c,q),false,q);
 }
});

test('한글 단어 순서 변경·붙여쓰기와 과도한 유사 일치 차단', () => {
 const c={name:'김해 예성 모터스',address:'부산 사상구'};
 for(const q of ['모터스 김해', '모터스김해', '예성모터스', '김해 부산', 'ㅇㅅㅁㅌㅅ']) assert.equal(customerMatches(c,q),true,q);
 for(const q of ['김성터', '김부', '김해 서울', '모터스부산없는']) assert.equal(customerMatches(c,q),false,q);
 assert.equal(customerMatches({name:'WP튠 부산'},'WP김해'),false);
 assert.equal(customerMatches({name:'김해',address:'예성'},'해예'),false,'필드 경계를 넘겨 이어붙이지 않음');
});

test('전화번호 형식·부분 번호·누락값', () => {
 const c={name:'예성 모터스',phone:'010-1234-5678'};
 for(const q of ['010 1234 5678', '(010)1234-5678', '５６７８', '5678']) assert.equal(customerMatches(c,q),true,q);
 assert.equal(customerMatches(c,'01056781234'),false);
 assert.equal(customerMatches(null,'김해'),false);
 assert.equal(customerMatches({},'김해'),false);
 assert.equal(customerMatches({},'  '),true);
 assert.equal(customerMatches({name:'테스트',mobile:'010-1111-2222'},'2222'),true);
});
