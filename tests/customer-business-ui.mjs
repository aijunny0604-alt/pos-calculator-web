import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless:true });
try {
  for (const width of [1440,390]) {
    const page = await browser.newPage({ viewport:{width,height:900} });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:5191/pos-calculator-web/design-preview.html?businessHistoryCheck=1');
    await page.getByText('사업자 이력 샘플 업체',{exact:true}).click();
    const panel = page.getByRole('region',{name:'거래처 사업자 정보와 변경 이력'});
    await panel.getByText('123-45-67890',{exact:true}).waitFor();
    await panel.getByRole('button',{name:'사업자 변경',exact:true}).click();
    await panel.getByLabel('상호 *',{exact:true}).fill('새 상호');
    await panel.getByLabel('사업자등록번호 *',{exact:true}).fill('987-65-43210');
    await panel.getByRole('button',{name:'이전 정보 보존 후 저장'}).click();
    await panel.getByText('987-65-43210',{exact:true}).waitFor();
    await panel.getByRole('button',{name:/이전 사업자·등록증/}).click();
    await panel.getByText('123-45-67890',{exact:true}).waitFor();
    assert.equal(await panel.getByRole('link',{name:'이전 사업자등록증 열기 ↗'}).getAttribute('href'),'https://example.test/old.png');
    await panel.getByRole('button',{name:'사업자 변경',exact:true}).click();
    await panel.getByLabel('상호 *',{exact:true}).fill('저장하지 않은 초안');
    await page.getByRole('button',{name:'다른 기기 변경 모사'}).click();
    await panel.getByRole('button',{name:'이전 정보 보존 후 저장'}).click();
    await panel.getByText(/다른 화면에서 사업자 정보가 변경/).waitFor();
    assert.equal(await panel.getByLabel('상호 *',{exact:true}).inputValue(),'저장하지 않은 초안');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors,[]); await page.close();
    console.log(`${width}: 이전·현재 정보, 등록증 보존 표시, 충돌 거부·초안 보존 확인`);
  }
} finally { await browser.close(); }
