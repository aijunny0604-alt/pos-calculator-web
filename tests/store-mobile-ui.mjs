// PC와 휴대폰 브라우저를 분리한다. 실제 중계를 쓰되 네이버는 가짜 응답만 사용한다.
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const child=spawn(process.execPath,['--import','./tests/store-product-mock-fetch.mjs','bridge/store-care.mjs'],{env:{...process.env,MOVIS_CARE_PORT:'43132',NAVER_CLIENT_ID:'sample',NAVER_CLIENT_SECRET:'$2a$10$abcdefghijklmnopqrstuu'},stdio:'ignore',windowsHide:true});
const browser=await chromium.launch({headless:true});
try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:43132/session',{headers:{Origin:'http://127.0.0.1:5186'}});break;}catch{await new Promise(r=>setTimeout(r,100));}}
 // 디자인 미리보기의 외부 통신 차단 CSP만 우회한다. 네이버는 별도의 가짜 서버로 고정돼 있다.
 const pc=await browser.newContext({viewport:{width:1366,height:768},bypassCSP:true}),mobile=await browser.newContext({viewport:{width:360,height:800},hasTouch:true,isMobile:true,bypassCSP:true});
 const a=await pc.newPage(),b=await mobile.newPage();
 a.on('requestfailed',r=>{if(r.url().includes('4313')||r.url().includes('43128'))console.log(`샘플 연결 오류: ${r.failure()?.errorText}`);});
 a.on('console',m=>{if(m.type()==='error')console.log(`샘플 브라우저 오류: ${m.text().slice(0,200)}`);});
 const target='http://127.0.0.1:5186/pos-calculator-web/design-preview.html?stockCheck=1&storeCheck=1&mobileTransportCheck=1';
 const open=async page=>{await page.goto(target);await page.getByRole('button',{name:'상품·품절 관리'}).click();await page.getByRole('button',{name:/샘플 플랜지 FL 63.*옵션 상세/}).click();await page.getByRole('button',{name:'휴대폰 연결',exact:true}).click();};
 await open(a);await a.getByRole('button',{name:'PC에서 연결 코드 만들기'}).click();
 await a.waitForTimeout(3000);if(await a.getByRole('alert').count())throw new Error(`PC 연결: ${await a.getByRole('alert').first().innerText()}`);
 const code=await a.locator('p.font-mono').innerText();
 await open(b);await b.getByLabel('휴대폰 연결 코드').fill(code);await b.getByRole('button',{name:'휴대폰 연결하기'}).click();
 await b.getByText('이 휴대폰에 연결 정보가 저장됨').waitFor({timeout:15000});
 await b.getByRole('button',{name:'현재 상태 조회'}).click();
 await b.getByLabel('변경할 옵션').selectOption('combination:30');
 await b.getByLabel('변경할 재고 수량').fill('5');await b.getByRole('button',{name:'변경 확인',exact:true}).click();
 await b.getByText('네이버에 적용할까요?').waitFor();await b.getByRole('button',{name:'네이버에 적용'}).click();
 await b.getByText('상품 재고 5개').waitFor({timeout:15000});
 assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await a.getByRole('button',{name:'PC에서 전체 연결 종료'}).click();
  await b.getByRole('button',{name:'이 기기 연결 해제'}).click();
  await b.getByLabel('휴대폰 연결 코드').fill(code);
  await b.getByRole('button',{name:'휴대폰 연결하기'}).click();
 await b.getByText(/매장 PC 응답이 없습니다/).waitFor({timeout:15000});
 console.log('별도 PC·모바일 브라우저: 연결, 조회, 가짜 변경, 연결 해제 통과');
 await pc.close();await mobile.close();
}finally{await browser.close();child.kill();}
