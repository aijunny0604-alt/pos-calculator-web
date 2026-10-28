import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 for(const viewport of [{width:1366,height:768},{width:360,height:800}]) {
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5186/pos-calculator-web/design-preview.html?detailCheck=1');
  await page.getByRole('dialog',{name:'주문 상세'}).getByRole('button',{name:'닫기'}).click();
  await page.getByRole('button',{name:'Q&A · 리뷰'}).click();
  assert.equal(await page.getByText(/문의 조회는 연결 프로그램이 실행 중인 매장 PC/).isVisible(),true);
  await page.getByRole('button',{name:'리뷰 관리'}).click();
  assert.equal(await page.getByLabel('리뷰 답글 초안').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);console.log(`${viewport.width}: 문의·리뷰 안내 확인`);await page.close();
 }
}finally{await browser.close();}
