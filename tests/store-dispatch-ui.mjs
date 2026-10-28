// 발송 상태는 개발 샘플로만 변경하며 실제 송장 요청을 전송하지 않는다.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 for(const viewport of [{width:1366,height:768},{width:390,height:844}]) {
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5186/pos-calculator-web/design-preview.html?dispatchCheck=1');
  await page.getByText('발송 반응성 샘플',{exact:true}).first().waitFor();
  await page.getByRole('button',{name:'샘플 성공'}).click();
  await page.getByText('발송완료',{exact:true}).first().waitFor();
  await page.getByRole('button',{name:'샘플 배송중'}).click();
  await page.getByText('배송중',{exact:true}).first().waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]); console.log(`${viewport.width}: 대기 → 발송 → 배송중 표시 확인`);await page.close();
 }
} finally {await browser.close();}
