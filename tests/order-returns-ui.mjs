import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch();
const base = process.env.POS_PREVIEW_URL || 'http://127.0.0.1:5174/pos-calculator-web';
try {
  for (const config of [{ width: 1440, height: 900, customer: false }, { width: 390, height: 700, customer: false }, { width: 360, height: 620, customer: true }]) {
    const page = await browser.newPage({ viewport: { width: config.width, height: config.height }, hasTouch: config.width < 768 });
    page.setDefaultTimeout(9000);
    await page.route('**/*', route => route.request().url().startsWith(new URL(base).origin) ? route.continue() : route.abort());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/tests/order-return-ui.html${config.customer ? '?customer' : ''}`);
    if (config.customer) {
      await page.getByRole('heading', { name: '교환 검증 샘플 업체' }).click();
      await page.getByText('기존 머플러팁', { exact: false }).first().click();
    }
    const editTrigger = page.getByRole('button', { name: '사유·교체 기록' }).first();
    await editTrigger.click();
    const dialog = page.getByRole('dialog', { name: '반품 기록 수정' });
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.ok(await editTrigger.evaluate(button => document.activeElement === button));
    await editTrigger.click();
    await dialog.getByLabel('처리 유형').selectOption('exchange');
    await dialog.getByLabel(/^반품 사유/).selectOption('오배송');
    await dialog.getByLabel('교체 주문 연결').selectOption('DEMO-EXCHANGE');
    await dialog.getByText('주문 금액 차액 +308,880원').waitFor();
    await dialog.getByLabel('상세 사유', { exact: false }).fill('다른 품목이 출고됐습니다.');
    const edit = dialog.getByRole('button', { name: '기록 저장' });
    await edit.click();
    await dialog.getByRole('alert').getByText('샘플 저장 실패').waitFor();
    assert.equal(await dialog.getByLabel('교체 주문 연결').inputValue(), 'DEMO-EXCHANGE');
    assert.equal(await dialog.getByLabel('상세 사유', { exact: false }).inputValue(), '다른 품목이 출고됐습니다.');
    await edit.click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByText('반품 후 교체 · 오배송', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('반품 금액 저장값').textContent(), '92400');
    const createTrigger = page.getByRole('button', { name: config.customer ? '반품 처리' : '반품', exact: true });
    await createTrigger.click();
    const create = page.getByRole('dialog', { name: '반품·교체 처리' });
    await create.waitFor();
    await page.keyboard.press('Escape');
    await create.waitFor({ state: 'hidden' });
    assert.ok(await createTrigger.evaluate(button => document.activeElement === button));
    await createTrigger.click();
    await create.getByText(/남은 3개/).waitFor();
    const submit = create.getByRole('button', { name: '반품 확정' });
    assert.equal(await submit.isEnabled(), false);
    await create.getByRole('button', { name: '남은 수량 모두 선택' }).click();
    assert.equal(await create.getByLabel('기존 머플러팁 반품 수량').inputValue(), '3');
    await create.getByLabel(/^반품 사유/).selectOption('고객 요청');
    const bounds = await submit.boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= config.height);
    await submit.click();
    await create.waitFor({ state: 'hidden' });
    assert.equal(await page.getByLabel('반품 금액 저장값').textContent(), '369600');
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${config.width}px ${config.customer ? '거래처 상세' : '주문 상세'}: 기존 기록 보완, 실패 시 입력 보존, 잔여 수량 반품, 닫기·포커스 통과`);
  }
} finally {
  await browser.close();
}
