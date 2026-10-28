import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 for (const viewport of [{width:1366,height:768},{width:390,height:844},{width:360,height:800}]) {
  const page=await browser.newPage({viewport,deviceScaleFactor:viewport.width<500?3:1,hasTouch:viewport.width<500});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5186/pos-calculator-web/design-preview.html?storeCheck=1&salesCheck=1');
  await page.getByRole('button',{name:'기간 매출'}).click();
  await page.getByRole('button',{name:'매출 조회'}).click();
  await page.getByText('13,000원',{exact:true}).first().waitFor();
  assert.match(await page.locator('main').innerText(),/미결제 제외\s*1건/);
  assert.match(await page.locator('main').innerText(),/취소·반품 확인\s*1건/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`tests/.artifacts/store-sales-${viewport.width}.png`});
  await page.getByRole('button',{name:'주문 관리'}).click();
  assert.equal(await page.getByRole('button',{name:'기간 매출'}).isVisible(),true);
  assert.deepEqual(errors,[]);console.log(`${viewport.width}×${viewport.height}: 기간 매출 조회·이동 통과`);
  await page.close();
 }
} finally {await browser.close();}
