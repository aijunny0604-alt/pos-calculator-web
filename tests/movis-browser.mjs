import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('tests/.artifacts', {
  recursive: true
});
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader']
});
const reports = [];
for (const [width, height, dpr, motion] of [[1920, 1080, 1, 'no-preference'], [1366, 768, 1.25, 'no-preference'], [768, 1024, 2, 'no-preference'], [390, 844, 3, 'no-preference'], [360, 800, 3, 'reduce']]) {
  const context = await browser.newContext({
    viewport: {
      width,
      height
    },
    deviceScaleFactor: dpr,
    reducedMotion: motion
  });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/pos-calculator-web/tests/movis.html');
  await page.getByRole('textbox', {
    name: '무비스에게 요청'
  }).waitFor();
  await page.waitForTimeout(1300);
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    canvas: [...document.querySelectorAll('canvas')].map(c => ({
      width: c.width,
      height: c.height
    })),
    send: document.querySelector('[aria-label="전송"]').getBoundingClientRect().toJSON(),
    voiceControls: document.querySelectorAll('[aria-label*="음성"],[aria-label*="마이크"]').length
  }));
  await page.screenshot({
    path: `tests/.artifacts/movis-${width}.png`,
    fullPage: true
  });
  await page.getByRole('button', {
    name: 'Codex 연결 설정'
  }).click();
  await page.getByRole('dialog', {
    name: 'Codex 연결 설정'
  }).waitFor();
  await page.screenshot({
    path: `tests/.artifacts/settings-${width}.png`
  });
  reports.push({
    width,
    height,
    dpr,
    motion,
    errors,
    ...metrics
  });
  await context.close();
}
writeFileSync('tests/.artifacts/browser-results.json', JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports, null, 2));
await browser.close();
if (reports.some(r => r.errors.length || r.scrollWidth > r.width || r.voiceControls)) process.exitCode = 1;
