import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader']
});
const page = await browser.newPage({
    viewport: {
      width: 1366,
      height: 768
    }
  }),
  errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/pos-calculator-web/tests/movis.html');
await page.getByRole('textbox', {
  name: '무비스에게 요청'
}).fill('스텐 밴딩 54-30 재고만 짧게 알려줘.');
await page.getByRole('button', {
  name: '전송',
  exact: true
}).click();
await page.getByRole('button', {
  name: '응답 중지'
}).waitFor();
await page.getByRole('button', {
  name: '응답 중지'
}).waitFor({
  state: 'hidden',
  timeout: 120000
});
assert.match(await page.locator('.movis-conversation').innerText(), /4개/);
await page.screenshot({
  path: 'tests/.artifacts/movis-conversation.png'
});
// Long content and HTML-like product names must remain inert and horizontally scroll within the table.
await page.evaluate(() => {
  localStorage.setItem('movis_history_v2', JSON.stringify([{
    id: 'xss',
    role: 'assistant',
    content: '<img src=x onerror="window.__xss=true">\n\n| 상품 | 수량 | 금액 |\n| --- | --- | --- |\n| 아주긴상품규격품목명ABCDEFGHIJKLMNOPQRSTUVWXYZ | 30 | 100,000원 |',
    ts: Date.now()
  }]));
});
await page.reload();
await page.getByText('<img src=x onerror="window.__xss=true">', {
  exact: true
}).waitFor();
assert.equal(await page.evaluate(() => !!window.__xss), false);
await page.setViewportSize({
  width: 360,
  height: 800
});
await page.screenshot({
  path: 'tests/.artifacts/movis-table-mobile.png'
});
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
await page.getByRole('button', {
  name: 'Codex 연결 설정'
}).click();
await page.keyboard.press('Escape');
await page.getByRole('dialog', {
  name: 'Codex 연결 설정'
}).waitFor({
  state: 'hidden'
});
await page.getByRole('textbox', {
  name: '무비스에게 요청'
}).fill('샘플 자료에서 제품과 재고를 조회하고 분석해줘.');
await page.getByRole('button', {
  name: '전송',
  exact: true
}).click();
await page.getByRole('button', {
  name: '응답 중지'
}).click();
await page.getByRole('button', {
  name: '응답 중지'
}).waitFor({
  state: 'hidden',
  timeout: 15000
});
assert.match(await page.locator('.movis-conversation').innerText(), /중지했습니다/);
console.log(JSON.stringify({
  streaming: true,
  realAnswer: true,
  xssSafe: true,
  mobileTable: true,
  escape: true,
  cancellation: true,
  errors
}));
writeFileSync('tests/.artifacts/interactions.json', JSON.stringify({
  streaming: true,
  realAnswer: true,
  xssSafe: true,
  mobileTable: true,
  escape: true,
  cancellation: true,
  errors
}, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;
