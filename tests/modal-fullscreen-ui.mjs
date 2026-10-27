// 개발 미리보기의 샘플 주문만 사용한다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
try {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, reducedMotion });
    await page.goto('http://127.0.0.1:5186/pos-calculator-web/design-preview.html?detailCheck=1');
    const panel = page.getByRole('dialog', { name: '주문 상세' });
    await panel.waitFor();
    await page.waitForTimeout(550);
    const original = await panel.boundingBox();
    await panel.getByRole('button', { name: '전체화면' }).click();
    await page.waitForFunction(() => document.querySelector('.order-detail-refined')?.getAnimations().some(a => a.effect?.getTiming().duration === 450));
    await page.waitForTimeout(90);
    const middle = await panel.boundingBox();
    await page.waitForTimeout(500);
    const full = await panel.boundingBox();
    assert.ok(middle.width > original.width && middle.width < full.width, `확대 중간 크기: ${JSON.stringify({ original, middle, full })}`);
    assert.ok(full.width >= 1360 && full.height >= 760);
    await panel.getByRole('button', { name: '원래 크기' }).click();
    await page.waitForFunction(() => document.querySelector('.order-detail-refined')?.getAnimations().some(a => a.effect?.getTiming().duration === 450));
    await page.waitForTimeout(550);
    const restored = await panel.boundingBox();
    assert.ok(Math.abs(restored.width - original.width) < 2 && Math.abs(restored.height - original.height) < 2);
    // 연속 전환 뒤에도 최종 상태와 움직임 정리가 일치한다.
    await panel.getByRole('button', { name: '전체화면' }).click();
    await panel.getByRole('button', { name: '원래 크기' }).click({ force: true });
    await page.waitForTimeout(600);
    assert.equal(await panel.getAttribute('data-fullscreen-motion'), null);
    assert.ok(Math.abs((await panel.boundingBox()).width - original.width) < 2);
    const header = panel.locator('.detail-refined-header');
    const bounds = await header.boundingBox();
    await page.mouse.move(bounds.x + 150, bounds.y + 25);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 180, bounds.y + 45);
    await page.mouse.up();
    assert.ok((await panel.boundingBox()).x > restored.x + 20, '드래그 위치가 즉시 바뀌어야 합니다');
    assert.equal(await panel.getAttribute('data-fullscreen-motion'), null);
    await page.close();
    console.log(`주문 상세 확대·축소·연속 클릭 (${reducedMotion}) 통과`);
  }
  const store = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await store.goto('http://127.0.0.1:5186/pos-calculator-web/design-preview.html?storeCheck=1');
  await store.getByTitle('컴팩트 모드로 (한 줄 표시)').click();
  await store.getByText('오늘 발주확인', { exact: true }).first().click();
  const storePanel = store.locator('.modal-fs-transition').last();
  await storePanel.waitFor();
  await store.waitForTimeout(500);
  const storeOriginal = await storePanel.boundingBox();
  await storePanel.getByTitle('전체화면').click();
  await store.waitForFunction(() => [...document.querySelectorAll('.modal-fs-transition')].some(el => el.getAnimations().some(a => a.effect?.getTiming().duration === 450)));
  await store.waitForTimeout(550);
  assert.ok((await storePanel.boundingBox()).width > storeOriginal.width);
  await storePanel.getByTitle('창 모드').click();
  await store.waitForTimeout(550);
  assert.ok(Math.abs((await storePanel.boundingBox()).width - storeOriginal.width) < 2);
  await store.close();
  console.log('스마트스토어 주문 상세 확대·축소 확인');
  const phone = await browser.newPage({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
  await phone.goto('http://127.0.0.1:5186/pos-calculator-web/design-preview.html?detailCheck=1');
  const modal = phone.getByRole('dialog', { name: '주문 상세' });
  await modal.waitFor();
  await phone.waitForTimeout(500);
  assert.ok((await modal.boundingBox()).width <= 360);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await modal.getByRole('button', { name: '닫기' }).isVisible(), true);
  console.log('모바일 주문 상세 너비 및 닫기 버튼 확인');
} finally {
  await browser.close();
}
