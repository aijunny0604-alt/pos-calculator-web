import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5191/pos-calculator-web/design-preview.html?orderCompletionCheck=1');
    await page.getByRole('button', { name: '주문 완료', exact: true }).click();
    await page.waitForFunction(() => window.previewOrderSaved === true);
    await page.getByRole('button', { name: '주문 완료', exact: true }).waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('dialog', { name: '주문 완료' }).count(), 0, '저장 성공 후 별도 완료창을 띄우지 않음');
    assert.deepEqual(errors, []);
    await page.close();
    const failure = await browser.newPage({ viewport });
    await failure.goto('http://127.0.0.1:5191/pos-calculator-web/design-preview.html?orderCompletionCheck=1&orderSaveFailure=1');
    await failure.getByRole('button', { name: '주문 완료', exact: true }).click();
    await failure.getByRole('button', { name: '주문 완료', exact: true }).waitFor();
    assert.equal(await failure.getByRole('dialog', { name: '주문 완료' }).count(), 0);
    assert.equal(await failure.getByRole('button', { name: '주문 완료', exact: true }).isVisible(), true);
    await failure.close();
    console.log(`${viewport.width}: 성공 시 완료창 생략·저장 실패 시 주문창 유지`);
  }
} finally { await browser.close(); }
