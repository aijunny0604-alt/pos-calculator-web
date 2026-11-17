import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const url='http://127.0.0.1:5191/pos-calculator-web/design-preview.html?storeCheck=1&storeSoldOutCheck=1';
const initialized=()=>JSON.parse(localStorage.getItem('move-store-sold-out-alerts-v1')||'{}').initialized === true;
try {
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]) {
  const page=await browser.newPage({viewport});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url); await page.waitForFunction(initialized);
  assert.equal(await page.getByRole('dialog',{name:'새로 품절된 상품'}).count(),0);
  await page.getByRole('button',{name:'샘플 품절 발생'}).click();
  const dialog=page.getByRole('dialog',{name:'새로 품절된 상품'});
  await dialog.waitFor();
  assert.equal(await dialog.getByText('알림 검증용 상품').count(),2);
  assert.equal(await dialog.getByText('블랙',{exact:true}).count(),1);
  assert.equal(await dialog.getByText('화이트',{exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.reload();
  await dialog.waitFor();
  await dialog.getByRole('button',{name:'확인',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  await page.evaluate(()=>window.simulateSoldOut());
  await page.waitForTimeout(1800);
  assert.equal(await page.getByRole('dialog',{name:'새로 품절된 상품'}).count(),0);
  assert.deepEqual(errors,[]);
  await page.close();
  const editing=await browser.newPage({viewport});
  await editing.goto(url); await editing.waitForFunction(initialized);
  await editing.getByRole('button',{name:'상품·품절 관리'}).click();
  await editing.getByRole('button',{name:'알림 검증용 상품 옵션 상세'}).click();
  const details=editing.getByRole('dialog',{name:'스토어 상품 상세'}); await details.waitFor();
  await editing.evaluate(()=>window.simulateSoldOut());
  await editing.waitForFunction(()=>JSON.parse(localStorage.getItem('move-store-sold-out-alerts-v1')||'{}').pending?.length===2);
  assert.equal(await editing.getByRole('dialog',{name:'새로 품절된 상품'}).count(),0);
  await details.getByRole('button',{name:'닫기',exact:true}).first().click();
  await editing.getByRole('dialog',{name:'새로 품절된 상품'}).waitFor();
  await editing.close();
  console.log(`${viewport.width}: 초기 기준, 신규 품절, 중복 방지, 상세창 종료 후 알림 확인`);
 }
} finally { await browser.close(); }
