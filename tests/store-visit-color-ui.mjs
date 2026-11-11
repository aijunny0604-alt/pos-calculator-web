import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1536, height: 864 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5190/pos-calculator-web/design-preview.html?storeCheck=1&storeVisitCheck=1');
    for (const mode of ['목록형', '카드형', '상세형']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      const visit = page.locator('[data-visit-receipt="true"][data-claim="false"]').filter({ hasText: '오늘 발주확인' });
      const normal = page.locator('[data-visit-receipt="false"][data-claim="false"]').filter({ hasText: '오늘 결제' });
      await visit.waitFor();
      assert.ok(await visit.getByText('방문수령', { exact: true }).count());
      const visitStyle = await visit.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderLeftColor }));
      const normalStyle = await normal.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderLeftColor }));
      assert.notEqual(visitStyle.background, normalStyle.background, `${mode}: 방문수령 배경 구분`);
      assert.notEqual(visitStyle.border, normalStyle.border, `${mode}: 방문수령 테두리 구분`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await page.getByText('배송완료·취소 표시').click();
    const claim = page.locator('[data-visit-receipt="true"][data-claim="true"]').filter({ hasText: '반품 요청 샘플' });
    await claim.waitFor();
    assert.notEqual(await claim.evaluate(el => getComputedStyle(el).borderLeftColor), 'rgb(118, 86, 188)', '반품 경고 색상 우선');
    assert.deepEqual(errors, []);
    console.log(`${viewport.width}: 세 보기 방문수령 구분과 반품 경고 우선 확인`);
    await page.close();
  }
} finally { await browser.close(); }
