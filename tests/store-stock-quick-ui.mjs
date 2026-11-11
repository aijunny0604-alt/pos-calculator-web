import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1536, height: 864 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5190/pos-calculator-web/design-preview.html?stockCheck=1&storeCheck=1&productEditorCheck=1');
    await page.getByRole('button', { name: '상품·품절 관리' }).click();
    await page.getByRole('button', { name: /샘플 플랜지 FL 63.*재고 수정/ }).click();
    const dialog = page.getByRole('dialog');
    const option = dialog.getByLabel('변경할 옵션');
    await option.waitFor();
    await option.selectOption('combination:8');
    const qty = dialog.getByLabel('변경할 재고 수량');
    await qty.fill('-1');
    assert.equal(await dialog.getByRole('button', { name: '변경 확인', exact: true }).isDisabled(), true);
    await qty.fill('5');
    await dialog.getByRole('button', { name: '변경 확인', exact: true }).click();
    await dialog.getByText('네이버에 적용할까요?').waitFor();
    assert.equal(await page.evaluate(() => window.previewProductConfirms || 0), 0);
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    assert.equal(await page.evaluate(() => window.previewProductConfirms || 0), 0);
    await dialog.getByRole('button', { name: '변경 확인', exact: true }).click();
    await dialog.getByRole('button', { name: '네이버에 적용' }).click();
    await page.waitForFunction(() => window.previewProductConfirms === 1);
    await dialog.getByText(/상품 재고 5개/).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log(`${viewport.width}: 목록 진입, 자동 조회, 수량 검증, 취소 및 모의 적용 확인`);
    await page.close();
  }
  const disconnected = await browser.newPage();
  await disconnected.route('http://127.0.0.1:43128/**', route => route.abort());
  await disconnected.goto('http://127.0.0.1:5190/pos-calculator-web/design-preview.html?stockCheck=1&storeCheck=1&storeOfflineCheck=1');
  await disconnected.getByRole('button', { name: '상품·품절 관리' }).click();
  await disconnected.getByRole('button', { name: /샘플 플랜지 FL 63.*재고 수정/ }).click();
  await disconnected.getByRole('dialog').getByRole('alert').waitFor();
  assert.equal(await disconnected.getByLabel('변경할 재고 수량').count(), 0);
  console.log('연결 실패: 오류 안내 및 재고 변경 차단 확인');
  await disconnected.close();
} finally { await browser.close(); }
