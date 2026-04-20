import { chromium } from 'playwright';

const BASE_URL = 'https://aijunny0604-alt.github.io/pos-calculator-web/';

const TEST_CASES = [
  { id: 1, input: '듀얼 NPK 89 턴다운 좌,우', expectedProduct: '듀얼 NPK 89D-T', expectedQty: 2, category: '좌우 수량' },
  { id: 2, input: '싱글 NPK 100 좌우 1세트', expectedProduct: '싱글 NPK 100S-S', expectedQty: 2, category: '좌우 수량' },
  { id: 3, input: '카본 싱글 SCF 103 좌 우 2세트', expectedProduct: '카본 싱글 SCF 103S-G', expectedQty: 4, category: '좌우 수량' },
  { id: 4, input: 'NPK 114 싱글 턴다운 양쪽', expectedProduct: '싱글 NPK 114S-T', expectedQty: 2, category: '좌우 수량' },
  { id: 5, input: '듀얼 NPK 89 3개', expectedProduct: '듀얼 NPK 89D-S', expectedQty: 3, category: '기본 수량' },
  { id: 6, input: '카본 듀얼 SCF 93 1개', expectedProduct: '카본 듀얼 SCF 93D-G', expectedQty: 1, category: '기본 수량' },
  { id: 7, input: 'SNPK 89 듀얼 좌우 1세트', expectedProduct: '슬롯 듀얼 SNPK 89D-S', expectedQty: 2, category: '복합' },
  { id: 8, input: '54 밴딩 45도 10개', expectedProduct: '스덴 밴딩 54-45', expectedQty: 10, category: '복합' },
];

function normalizeProductName(name) {
  return name
    .replace(/머플러팁/g, '')
    .replace(/슬롯팁/g, '')
    .replace(/파이프/g, '')
    .replace(/[\s\-_]/g, '')
    .toLowerCase();
}

function productMatches(actual, expected) {
  if (!actual || actual === 'N/A') return false;
  const normActual = normalizeProductName(actual);
  const normExpected = normalizeProductName(expected);
  return normActual === normExpected || normActual.includes(normExpected) || normExpected.includes(normActual);
}

async function ensureTextareaVisible(page) {
  // Check if textarea is already visible
  const textarea = page.locator('textarea').first();
  const isVisible = await textarea.isVisible().catch(() => false);
  if (isVisible) return;

  // Try clicking the "메모 입력 영역" collapse/expand button
  // The button contains a span with text "메모 입력 영역"
  const collapseBtn = page.locator('span:has-text("메모 입력 영역")').first();
  const btnVisible = await collapseBtn.isVisible().catch(() => false);
  if (btnVisible) {
    // Click the parent button element
    await collapseBtn.click();
    await page.waitForTimeout(500);
  }

  // Verify textarea is now visible
  await textarea.waitFor({ state: 'visible', timeout: 3000 });
}

async function runTests() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  console.log('=== AI 주문 인식 Playwright 테스트 시작 ===\n');

  // 1. Navigate
  console.log('[1] 앱 접속 중...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // 2. Click "AI 주문 인식" in sidebar
  console.log('[2] AI 주문 인식 페이지 이동...');
  const aiMenuBtn = page.locator('nav >> text=AI 주문 인식').first();
  await aiMenuBtn.waitFor({ timeout: 10000 });
  await aiMenuBtn.click();
  await page.waitForTimeout(2000);

  await page.locator('h1:has-text("AI 주문 인식")').waitFor({ timeout: 5000 });
  console.log('   AI 주문 인식 페이지 로드 완료\n');
  await page.screenshot({ path: 'tests/screenshots/ai-order-initial.png' });

  const results = [];

  for (const tc of TEST_CASES) {
    console.log(`--- 테스트 #${tc.id} [${tc.category}] ---`);
    console.log(`   입력: "${tc.input}"`);
    console.log(`   기대: ${tc.expectedProduct}, 수량 ${tc.expectedQty}`);

    try {
      // Make sure textarea is visible (expand if collapsed)
      await ensureTextareaVisible(page);

      // Clear and type
      const textarea = page.locator('textarea').first();
      await textarea.click();
      await textarea.fill('');
      await page.waitForTimeout(200);
      await textarea.fill(tc.input);
      await page.waitForTimeout(300);

      // Click "AI 분석"
      const analyzeBtn = page.locator('button:has-text("AI 분석")').first();
      await analyzeBtn.waitFor({ timeout: 5000 });
      await analyzeBtn.click();

      console.log('   AI 분석 대기 중...');

      // Wait for analysis to complete
      await page.waitForTimeout(2000);
      // Wait up to 35s for the spinner to disappear
      const spinnerBtn = page.locator('button:has-text("분석 중")');
      let waited = 0;
      while (waited < 35000) {
        const spinning = await spinnerBtn.isVisible().catch(() => false);
        if (!spinning) break;
        await page.waitForTimeout(1000);
        waited += 1000;
      }
      await page.waitForTimeout(1500);

      // Screenshot
      const ssName = `ai-order-test-${tc.id}.png`;
      await page.screenshot({ path: `tests/screenshots/${ssName}` });
      console.log(`   스크린샷: ${ssName}`);

      // Extract results
      let actualProduct = 'N/A';
      let actualQty = 'N/A';

      // Check for "분석 결과" header
      const hasResults = await page.locator('h3:has-text("분석 결과")').isVisible().catch(() => false);

      if (hasResults) {
        // Get product name from p.font-semibold elements
        const productEls = page.locator('p.font-semibold');
        const count = await productEls.count();
        for (let i = 0; i < count; i++) {
          const text = await productEls.nth(i).textContent();
          if (text && (
            text.includes('NPK') || text.includes('SCF') || text.includes('SNPK') ||
            text.includes('밴딩') || text.includes('CFK') || text.includes('NCF') ||
            text.includes('자바라') || text.includes('플랜지') || text.includes('환봉') ||
            text.includes('DSQ')
          )) {
            actualProduct = text.trim();
            break;
          }
        }

        // Get quantity from input[type="number"] with w-7 class (result qty, not add-product qty)
        const qtyInputs = page.locator('input[type="number"]');
        const qtyCount = await qtyInputs.count();
        for (let i = 0; i < qtyCount; i++) {
          const classes = await qtyInputs.nth(i).getAttribute('class') || '';
          if (classes.includes('w-7')) {
            const val = await qtyInputs.nth(i).inputValue();
            if (val) {
              actualQty = parseInt(val);
              break;
            }
          }
        }

        // Fallback for qty
        if (actualQty === 'N/A') {
          for (let i = 0; i < qtyCount; i++) {
            const val = await qtyInputs.nth(i).inputValue();
            if (val && parseInt(val) > 0) {
              actualQty = parseInt(val);
              break;
            }
          }
        }
      }

      // Check for match failure
      const failVisible = await page.locator('text=매칭 실패').isVisible().catch(() => false);
      if (failVisible && actualProduct === 'N/A') {
        actualProduct = '(매칭 실패)';
      }

      const productPass = productMatches(actualProduct, tc.expectedProduct);
      const qtyPass = parseInt(actualQty) === tc.expectedQty;
      const pass = productPass && qtyPass;

      results.push({ ...tc, actualProduct, actualQty, pass, productPass, qtyPass });

      console.log(`   실제: ${actualProduct}, 수량 ${actualQty}`);
      console.log(`   결과: ${pass ? 'PASS' : 'FAIL'} (제품: ${productPass ? 'OK' : 'NG'}, 수량: ${qtyPass ? 'OK' : 'NG'})\n`);

    } catch (err) {
      console.log(`   ERROR: ${err.message}\n`);
      await page.screenshot({ path: `tests/screenshots/ai-order-test-${tc.id}-error.png` }).catch(() => {});
      results.push({ ...tc, actualProduct: 'ERROR', actualQty: 'ERROR', pass: false, productPass: false, qtyPass: false, error: err.message });
    }
  }

  // Summary
  console.log('\n=== 테스트 결과 요약 ===\n');
  console.log('| # | 입력 | 기대 제품 | 기대 수량 | 실제 제품 | 실제 수량 | 결과 |');
  console.log('|---|------|----------|----------|----------|----------|------|');
  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL';
    console.log(`| ${r.id} | ${r.input} | ${r.expectedProduct} | ${r.expectedQty} | ${r.actualProduct} | ${r.actualQty} | ${status} |`);
  }

  const passCount = results.filter(r => r.pass).length;
  console.log(`\n총 ${results.length}개 중 ${passCount}개 PASS, ${results.length - passCount}개 FAIL`);

  await page.screenshot({ path: 'tests/screenshots/ai-order-final.png' });
  await browser.close();
  return results;
}

runTests().catch(err => { console.error('Fatal error:', err); process.exit(1); });
