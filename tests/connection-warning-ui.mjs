import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let fail = false;
  await context.route('https://**/*', route => {
    const url = route.request().url();
    const core = /\/rest\/v1\/(orders|products|customers|saved_carts)(?:\?|$)/.test(url);
    return route.fulfill({ status: fail && core ? 503 : 200, contentType:'application/json', headers: { 'access-control-allow-origin':'*' }, body: fail && core ? '{}' : '[]' });
  });
  await context.routeWebSocket('**/*', ws => ws.close());
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5191/pos-calculator-web/');
  await page.waitForLoadState('domcontentloaded');
  await context.setOffline(true);
  await page.getByText('인터넷 연결이 끊겼습니다').waitFor({ timeout: 15000 });
  await context.setOffline(false);
  await page.getByText('데이터 연결을 확인하고 있습니다').waitFor({ timeout: 15000 });
  fail = true;
  await page.reload();
  await page.getByText('서버 연결이 원활하지 않습니다').waitFor({ timeout: 20000 });
  assert.equal(await page.getByText('저장 결과가 불확실한 작업은 중복 처리하기 전에 내역을 확인해 주세요.').count(), 1);
  fail = false;
  await page.getByText('서버 연결이 원활하지 않습니다').waitFor({ state:'hidden', timeout:45000 });
  console.log('모바일 오프라인·재연결·서버 장애와 자동 복구 안내 확인');
} finally { await browser.close(); }
