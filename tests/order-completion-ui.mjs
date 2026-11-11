import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5190/pos-calculator-web/design-preview.html?orderCompletionCheck=1');
    await page.getByRole('button', { name: '주문 완료', exact: true }).click();
    const success = page.getByRole('dialog', { name: '주문 완료' });
    await success.waitFor();
    await page.waitForTimeout(1500);
    assert.equal(await success.isVisible(), true, '장바구니 초기화 후에도 완료창을 유지해야 함');
    assert.match(await success.innerText(), /주문번호/);
    await success.getByRole('button', { name: '확인', exact: true }).click();
    await success.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    await page.close();
    const failure = await browser.newPage({ viewport });
    await failure.goto('http://127.0.0.1:5190/pos-calculator-web/design-preview.html?orderCompletionCheck=1&orderSaveFailure=1');
    await failure.getByRole('button', { name: '주문 완료', exact: true }).click();
    await failure.getByRole('button', { name: '주문 완료', exact: true }).waitFor();
    assert.equal(await failure.getByRole('dialog', { name: '주문 완료' }).count(), 0);
    assert.equal(await failure.getByRole('button', { name: '주문 완료', exact: true }).isVisible(), true);
    await failure.close();
    console.log(`${viewport.width}: 성공 안내 유지·확인 닫기·저장 실패 시 완료 방지`);
  }
} finally { await browser.close(); }
