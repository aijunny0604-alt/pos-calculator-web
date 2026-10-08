import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader']
});
const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 900
    }
  }),
  errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/pos-calculator-web/');
await page.getByText('MOVIS', {
  exact: true
}).first().click({
  timeout: 30000
});
await page.getByRole('textbox', {
  name: '무비스에게 요청'
}).waitFor({
  timeout: 30000
});
await page.waitForTimeout(1800);
await page.screenshot({
  path: 'tests/.artifacts/movis-real-app.png'
});
await page.getByRole('button', {
  name: 'AI 설정',
  exact: true
}).click();
await page.getByText('데이터 관리', {
  exact: true
}).waitFor();
console.log(JSON.stringify({
  mounted: true,
  settings: true,
  errors
}));
await browser.close();
if (errors.length) process.exitCode = 1;
