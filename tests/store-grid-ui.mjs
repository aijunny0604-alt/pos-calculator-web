import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1536, height: 864 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, ...(viewport.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}) });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:5188/pos-calculator-web/design-preview.html?storeCheck=1');
    await page.getByRole('button', { name: '카드형', exact: true }).click();
    const rows = page.locator('.store-compact-grid .order-row-premium');
    await rows.first().waitFor();
    const count = await rows.count();
    assert.ok(count > 1);
    const boxes = await rows.evaluateAll(nodes => nodes.slice(0, 2).map(node => { const r = node.getBoundingClientRect(); return { x: r.x, width: r.width }; }));
    if (viewport.width >= 1000) assert.ok(boxes[1].x > boxes[0].x);
    else assert.equal(boxes[1].x, boxes[0].x);
    await rows.first().locator('input[type=checkbox]').check();
    await page.getByRole('button', { name: '목록형', exact: true }).click();
    assert.equal(await page.locator('.order-row-premium').count(), count);
    assert.equal(await page.locator('.order-row-premium').first().locator('input[type=checkbox]').isChecked(), true);
    await page.getByRole('button', { name: '카드형', exact: true }).click();
    assert.equal(await rows.first().locator('input[type=checkbox]').isChecked(), true);
    await rows.first().locator('div').first().click();
    await page.getByRole('dialog').first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    await page.reload();
    assert.equal(await page.getByRole('button', { name: '카드형', exact: true }).getAttribute('aria-pressed'), 'true');
    console.log(`${viewport.width}: 주문 그리드, 선택 유지, 상세창, 가로 넘침 및 보기 설정 저장 확인`);
    await page.close();
  }
} finally { await browser.close(); }
