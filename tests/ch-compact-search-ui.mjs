import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true});
try {
  for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
    const page = await browser.newPage({viewport});
    const errors = []; page.on('pageerror', error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:5191/pos-calculator-web/design-preview.html?chSearchCheck=1');
    await page.getByPlaceholder('제품명 검색...').fill('Ch20076');
    await page.getByText('CH 200 76', {exact:true}).first().waitFor();
    await page.getByText('CH 200 77', {exact:true}).first().waitFor();
    assert.equal(await page.getByText('CH 201 76', {exact:true}).count(),0);
    assert.equal(await page.getByText('CH 200 78', {exact:true}).count(),0);
    assert.ok(await page.getByText('근접 규격', {exact:true}).count());
    await page.getByRole('button',{name:'카드 보기',exact:true}).click();
    await page.locator('p').filter({hasText:'CH 200 77'}).first().waitFor();
    assert.ok(await page.getByText('근접 규격', {exact:true}).count());
    assert.deepEqual(errors,[]);
    console.log(`${viewport.width}: 붙여쓴 CH 검색, 근접 규격 표시, 목록·카드 보기 확인`);
    await page.close();
  }
} finally { await browser.close(); }
