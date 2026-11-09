import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1536, height: 864 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, ...(viewport.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}) });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('shippingCustomEntries', JSON.stringify([{ id: 'sample-custom', name: '직접 추가 샘플', phone: '010-0000-0000', address: '샘플 주소', product: '샘플 상품', sender: '무브모터스', paymentType: '착불', packaging: '박스1', shippingCost: '6000' }])));
    await page.goto('http://127.0.0.1:5188/pos-calculator-web/design-preview.html?shippingGridCheck=1');
    const cards = page.locator('.shipping-recipient-card');
    await cards.first().waitFor();
    assert.equal(await cards.count(), 9);
    await cards.first().locator('.shipping-recipient-main').click();
    const cost = cards.first().getByPlaceholder('7300');
    await cost.fill('8500');
    await page.getByRole('button', { name: '카드형' }).click();
    assert.equal(await cards.first().getAttribute('data-selected'), 'true');
    assert.equal(await cost.inputValue(), '8500');
    assert.equal(await page.locator('.shipping-recipient-grid').count(), 2);
    assert.equal(await cards.last().locator('..').getAttribute('class'), 'shipping-recipient-grid');
    const boxes = await cards.evaluateAll(nodes => nodes.slice(0, 2).map(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width }; }));
    if (viewport.width >= 1000) assert.ok(boxes[1].x > boxes[0].x, '넓은 화면에서는 카드가 나란히 표시되어야 합니다');
    else assert.equal(boxes[1].x, boxes[0].x);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('button', { name: '목록형' }).click();
    assert.equal(await cards.first().getAttribute('data-selected'), 'true');
    assert.equal(await cost.inputValue(), '8500');
    await page.getByRole('button', { name: '카드형' }).click();
    await page.reload();
    assert.equal(await page.getByRole('button', { name: '카드형' }).getAttribute('aria-pressed'), 'true');
    assert.deepEqual(errors, []);
    console.log(`${viewport.width}: 카드 배치, 보기 전환·선택·설정 유지, 보기 설정 저장 및 가로 넘침 확인`);
    await page.close();
  }
} finally { await browser.close(); }
