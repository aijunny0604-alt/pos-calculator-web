import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const baseUrl = process.env.POS_PREVIEW_URL || 'http://127.0.0.1:5174/pos-calculator-web';
const browser = await chromium.launch({ headless: true });
const tableRows = Array.from({ length: 35 }, (_, index) =>
  `| 레조 샘플 ${index + 1} | 6개 | **6개** | 33,440원 | 납기 확인과 긴 발주 메모 전체 표시 |`);
const bullets = Array.from({ length: 12 }, (_, index) => `- **보충 검토 항목 ${index + 1}**\n  납기를 확인합니다.\n`);
const ordered = Array.from({ length: 9 }, (_, index) => `${index + 1}. 확인 순서 ${index + 1}`);
const content = ['매입 추천입니다.', '', '| 품목 | 월간 판매 | 추천 발주량 | 매입 단가 | 참고 사항 |',
  '| --- | --- | --- | --- | --- |', ...tableRows, '', '### 소량 보충 검토', ...bullets,
  '', '### 납기 확인', ...ordered, '', '답변 끝'].join('\n');

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 900 }, { width: 390, height: 740 }, { width: 360, height: 600 }]) {
    const mobile = viewport.width < 768;
    const page = await browser.newPage({ viewport, hasTouch: mobile, isMobile: mobile, reducedMotion: mobile ? 'reduce' : 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${baseUrl}/tests/movis-chat-motion.html`);
    await page.waitForFunction(() => typeof window.setMovisFixture === 'function');
    await page.evaluate(text => window.setMovisFixture({ messages: [{ id: 'list-demo', role: 'assistant', content: text }] }), content);
    const previews = page.locator('.movis-message-card .movis-result-preview');
    await previews.last().waitFor();
    assert.equal(await previews.count(), 3);
    assert.equal(await previews.nth(0).locator('tbody tr').count(), 3);
    for (const index of [1, 2]) assert.equal(await previews.nth(index).getByRole('listitem').count(), 3);
    await page.getByText('답변 끝', { exact: true }).waitFor();
    const tableTrigger = previews.nth(0).getByRole('button', { name: /표 전체 보기/ });
    assert.match(await tableTrigger.innerText(), /총 35개/);
    const tableDialog = page.getByRole('dialog', { name: '표 전체 보기' });
    await previews.nth(0).getByText('레조 샘플 1', { exact: true }).click();
    await tableDialog.waitFor();
    assert.equal(await tableDialog.locator('tbody tr').count(), 35);
    assert.equal(await tableDialog.locator('tbody tr').first().locator('strong').innerText(), '6개');
    const tableBody = tableDialog.getByRole('region', { name: '표 내용' });
    const close = tableDialog.getByRole('button', { name: '닫기', exact: true });
    await tableDialog.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
    assert.equal(await tableDialog.evaluate(el => getComputedStyle(el).animationName), 'move-dialog-in');
    const bounds = await tableDialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1);
    assert.ok(await tableBody.evaluate(el => el.scrollHeight > el.clientHeight));
    if (mobile) assert.ok(await tableBody.evaluate(el => el.scrollWidth > el.clientWidth));
    await tableBody.evaluate(el => { el.scrollTop = el.scrollHeight; el.scrollLeft = el.scrollWidth; });
    assert.ok(await tableBody.evaluate(el => el.scrollTop > 0));
    assert.ok(await close.evaluate(el => document.activeElement === el && el.getBoundingClientRect().height >= 44));
    await page.keyboard.press('Tab');
    assert.ok(await tableBody.evaluate(el => document.activeElement === el));
    await page.keyboard.press('Tab');
    assert.ok(await close.evaluate(el => document.activeElement === el));
    await page.keyboard.press('Escape');
    await tableDialog.waitFor({ state: 'hidden' });
    assert.ok(await tableTrigger.evaluate(el => document.activeElement === el));
    await page.getByRole('button', { name: /목록 전체 보기/ }).first().click();
    const listDialog = page.getByRole('dialog', { name: '목록 전체 보기' });
    await listDialog.waitFor();
    assert.equal(await listDialog.getByRole('listitem').count(), 12);
    assert.match(await listDialog.getByRole('listitem').last().innerText(), /12 납기를 확인합니다/);
    await listDialog.getByRole('button', { name: '닫기', exact: true }).click();
    await listDialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: /목록 전체 보기/ }).last().click();
    await listDialog.waitFor();
    assert.equal(await listDialog.getByRole('listitem').count(), 9);
    await listDialog.getByText('확인 순서 9', { exact: true }).waitFor();
    await page.evaluate(() => window.setMovisFixture({ active: false }));
    await listDialog.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${viewport.width}×${viewport.height} · 미리보기 3개, 전체 표·목록, 스크롤, 키보드와 닫기 통과`);
  }
} finally {
  await browser.close();
}
