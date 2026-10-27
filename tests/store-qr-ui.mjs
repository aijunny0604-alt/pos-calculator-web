// 독립된 PC·모바일 브라우저, 실제 중계, 가짜 네이버 응답만 사용한다.
// QR 디코더는 테스트 전용 경로에서 로드한다 (환경변수 MOVIS_JSQR_MODULE).
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const jsQR=require(process.env.MOVIS_JSQR_MODULE || path.resolve('../../qr-decode-staging/package/dist/jsQR.js'));
const child=spawn(process.execPath,['--import','./tests/store-product-mock-fetch.mjs','bridge/store-care.mjs'],{env:{...process.env,MOVIS_CARE_PORT:'43132',NAVER_CLIENT_ID:'sample',NAVER_CLIENT_SECRET:'$2a$10$abcdefghijklmnopqrstuu'},stdio:'ignore',windowsHide:true});
const browser=await chromium.launch({headless:true});
try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:43132/session',{headers:{Origin:'http://127.0.0.1:5186'}});break;}catch{await new Promise(r=>setTimeout(r,100));}}
 const pc=await browser.newContext({viewport:{width:1366,height:768},bypassCSP:true}),phone=await browser.newContext({viewport:{width:360,height:800},hasTouch:true,isMobile:true,bypassCSP:true});
 const a=await pc.newPage(),b=await phone.newPage();
 const preview='http://127.0.0.1:5186/pos-calculator-web/design-preview.html?stockCheck=1&storeCheck=1&mobileTransportCheck=1';
 const open=async page=>{await page.goto(preview);await page.getByRole('button',{name:'상품·품절 관리'}).click();await page.getByRole('button',{name:/샘플 플랜지 FL 63.*옵션 상세/}).click();await page.getByRole('button',{name:'휴대폰 연결',exact:true}).click();};
 await open(a);await a.getByRole('button',{name:'PC에서 QR코드 만들기'}).click();
 const svg=a.getByRole('img',{name:'휴대폰 연결 QR코드'});await svg.waitFor({timeout:15000});
 assert.equal(await svg.locator('xpath=ancestor::*[@data-sentry-block]').count(),1);
 assert.equal(await a.locator('p.font-mono').count(),0);
 const data=await svg.evaluate(async element=>{
  const image=new Image(),markup=new XMLSerializer().serializeToString(element),url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml'}));
  try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});const canvas=document.createElement('canvas');canvas.width=232;canvas.height=232;const context=canvas.getContext('2d');context.drawImage(image,0,0,232,232);return Array.from(context.getImageData(0,0,232,232).data);}finally{URL.revokeObjectURL(url);}
 });
 const decoded=jsQR(new Uint8ClampedArray(data),232,232);assert.ok(decoded,'QR 디코딩 실패');
 const scanned=new URL(decoded.data);assert.equal(scanned.origin,'https://aijunny0604-alt.github.io');assert.match(scanned.hash,/^#store-pair=[0-9a-f]{32}$/);
 const secret=scanned.hash.slice('#store-pair='.length);let leaked=false;
 b.on('request',request=>{if(request.url().includes(secret))leaked=true;});
 await b.route('**/rest/v1/**',route=>route.fulfill({status:200,headers:{'content-range':'0-0/0','content-type':'application/json'},body:'[]'}));
 await b.goto(`http://127.0.0.1:5186/pos-calculator-web/${scanned.hash}`);
 await b.getByRole('dialog').getByText('스캔한 QR코드로 이 휴대폰을 매장 PC에 연결할까요?').waitFor();
 assert.equal(new URL(b.url()).hash,'');assert.equal(await b.evaluate(()=>sessionStorage.getItem('move-store-mobile-session-v1')),null);
 await b.getByRole('dialog').getByRole('button',{name:'취소'}).click();
 assert.equal(await b.evaluate(()=>sessionStorage.getItem('move-store-mobile-session-v1')),null);
 await b.goto(`http://127.0.0.1:5186/pos-calculator-web/${scanned.hash}`);
 await b.getByRole('dialog').getByText('스캔한 QR코드로 이 휴대폰을 매장 PC에 연결할까요?').waitFor();
 await b.getByRole('button',{name:'이 휴대폰 연결'}).click();await b.getByRole('dialog').getByText('매장 PC와 연결됐습니다.').waitFor({timeout:15000});
 assert.equal(await b.evaluate(()=>!!sessionStorage.getItem('move-store-mobile-session-v1')),true);assert.equal(leaked,false);
 await open(b);await b.getByRole('button',{name:'현재 상태 조회'}).click();
 await b.getByLabel('변경할 옵션').selectOption('combination:30');await b.getByLabel('변경할 재고 수량').fill('5');
 await b.getByRole('button',{name:'변경 확인',exact:true}).click();await b.getByRole('button',{name:'네이버에 적용'}).click();
 await b.getByText('상품 재고 5개').waitFor({timeout:15000});assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 console.log('실제 QR 디코딩, 주소 제거, 사용자 확인, 가짜 상품 변경 통과');
 await pc.close();await phone.close();
}finally{await browser.close();child.kill();}
