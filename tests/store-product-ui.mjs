// 개발용 샘플 및 모의 API만 사용하며 실제 상품은 변경하지 않는다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 for(const viewport of [{width:1366,height:768},{width:360,height:800}]){
  const page=await browser.newPage({viewport});
  await page.route('http://127.0.0.1:43128/**',route=>route.abort());
  await page.goto('http://127.0.0.1:5186/pos-calculator-web/design-preview.html?stockCheck=1&storeCheck=1&productEditorCheck=1');
  await page.getByRole('button',{name:'상품·품절 관리'}).click();
  await page.getByRole('button',{name:/샘플 플랜지 FL 63.*옵션 상세/}).click();
  await page.getByRole('button',{name:'현재 상태 조회'}).click();
  await page.waitForTimeout(500);
  if (!(await page.getByLabel('변경할 옵션').count())) throw new Error(`조회 실패: ${await page.getByRole('dialog').innerText()}`);
  await page.getByLabel('변경할 옵션').selectOption('combination:8');
  await page.getByLabel('변경할 재고 수량').fill('5');
  await page.getByRole('button',{name:'변경 확인',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.previewProductConfirms||0),0);
  await page.getByRole('button',{name:'취소',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.previewProductConfirms||0),0);
  await page.getByRole('button',{name:'변경 확인',exact:true}).click();
  await page.getByRole('button',{name:'네이버에 적용'}).click();
  await page.waitForFunction(() => window.previewProductConfirms === 1);
  assert.equal(await page.evaluate(()=>window.previewProductConfirms||0),1);
  await page.getByRole('button',{name:'+ 재주문',exact:true}).first().click();
  await page.getByRole('button',{name:/재주문 목록 보기/}).click();
  await page.getByRole('button',{name:'재주문 수량 추천'}).click();
  const labels=page.locator('label');
  await labels.filter({hasText:'최근 30일 판매량'}).locator('input').fill('30');
  await labels.filter({hasText:'매장 실재고'}).locator('input').fill('5');
  await labels.filter({hasText:'확인한 미입고 발주량'}).locator('input').fill('3');
  assert.match(await page.locator('text=추천 수량').first().innerText(),/22개/);
  await page.getByRole('button',{name:'발주 수량에 적용'}).click();
  assert.equal(await page.getByLabel(/발주 수량/).first().inputValue(),'22');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  assert.equal(overflow,false);
  console.log(`${viewport.width}×${viewport.height}: 확인·취소·모의 적용·추천 통과`);
  await page.close();
 }
} finally {await browser.close();}
