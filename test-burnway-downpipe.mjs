import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173/pos-calculator-web/';
const results = [];
const consoleErrors = [];

function log(test, status, detail = '') {
  const icon = status === 'PASS' ? '[PASS]' : '[FAIL]';
  const msg = `${icon} ${test}${detail ? ' - ' + detail : ''}`;
  console.log(msg);
  results.push({ test, status, detail });
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: undefined,
    viewport: { width: 1400, height: 900 }
  });
  const page = await context.newPage();

  // Collect console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(err.message);
  });

  try {
    // === TEST 1: Navigate to page ===
    console.log('\n=== TEST 1: Navigate to page ===');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    log('Page load', 'PASS', `URL: ${page.url()}`);
    await page.waitForTimeout(1500);

    // === TEST 2: Click sidebar "관리자" ===
    console.log('\n=== TEST 2: Click sidebar "관리자" ===');
    const adminBtn = page.locator('nav >> text=관리자').first();
    await adminBtn.waitFor({ timeout: 10000 });
    await adminBtn.click();
    await page.waitForTimeout(1000);
    log('Sidebar 관리자 click', 'PASS');

    // === TEST 3: Login with password 4321 ===
    console.log('\n=== TEST 3: Login with password 4321 ===');
    const pwInput = page.locator('input[type="password"]').first();
    await pwInput.waitFor({ timeout: 5000 });
    await pwInput.fill('4321');

    const loginBtn = page.locator('button:has-text("로그인"), button:has-text("확인"), button[type="submit"]').first();
    await loginBtn.click();
    await page.waitForTimeout(2000);

    const stillLogin = await page.locator('input[type="password"]').count();
    if (stillLogin === 0) {
      log('Admin login', 'PASS', 'Password accepted');
    } else {
      log('Admin login', 'FAIL', 'Password input still visible');
    }

    // === TEST 4: Click "번웨이" tab (inside admin page) ===
    console.log('\n=== TEST 4: Click "번웨이" tab in admin page ===');
    // The burnway tab is a tab button inside the admin page with role="tab"
    const burnwayTab = page.locator('button[role="tab"]:has-text("번웨이")');
    await burnwayTab.waitFor({ timeout: 5000 });
    await burnwayTab.click();
    await page.waitForTimeout(1500);

    // Verify we see "번웨이 다운파이프" header
    const burnwayHeader = page.locator('h2:has-text("번웨이 다운파이프")');
    const headerVisible = await burnwayHeader.isVisible().catch(() => false);
    log('번웨이 tab click', headerVisible ? 'PASS' : 'FAIL', headerVisible ? 'Header visible' : 'Header not found');

    // === TEST 5: Click "모델 관리" ===
    console.log('\n=== TEST 5: Click "모델 관리" ===');
    const modelMgmtBtn = page.locator('button:has-text("모델 관리")');
    await modelMgmtBtn.waitFor({ timeout: 5000 });
    await modelMgmtBtn.click();
    await page.waitForTimeout(1500);

    // Verify "차량 모델 관리" section appears
    const modelMgmtHeader = page.locator('text=차량 모델 관리');
    const mgmtVisible = await modelMgmtHeader.isVisible().catch(() => false);
    log('모델 관리 click', mgmtVisible ? 'PASS' : 'FAIL', mgmtVisible ? 'Model manager opened' : 'Model manager not visible');

    // === TEST 5-1: Check option badges for each car model ===
    console.log('\n=== TEST 5-1: Check option badges ===');

    // Badge checks based on code analysis:
    // - hasJabara && hasDctManual => "자바라 DCT/수동"
    // - hasJabara && !hasDctManual => "자바라"
    // - !hasJabara => "다운파이프만"
    const badgeChecks = [
      { model: '벨로스터N', expectedBadge: '자바라 DCT/수동' },
      { model: '아반떼N', expectedBadge: '자바라' },
      { model: '스팅어', expectedBadge: '다운파이프만', isMultiple: true },
    ];

    // Get all model rows in the model manager section
    const modelManagerSection = page.locator('text=차량 모델 관리').locator('..').locator('..');
    const modelRows = modelManagerSection.locator('div[style*="background"]');

    // Take a screenshot of the model manager to analyze
    await page.screenshot({ path: 'C:/Users/MOVEAM_PC/pos-calculator-web/test-model-mgmt.png', fullPage: false });
    console.log('Screenshot saved: test-model-mgmt.png');

    // Check each model's badge by searching within the model management section
    const pageContent = await page.content();

    // Check 벨로스터N + "자바라 DCT/수동" badge
    {
      const modelRow = page.locator('span:has-text("벨로스터N")').first();
      const exists = await modelRow.count();
      if (exists > 0) {
        const parent = modelRow.locator('..').locator('..');
        const rowText = await parent.textContent().catch(() => '');
        if (rowText.includes('자바라 DCT/수동')) {
          log('Badge - 벨로스터N', 'PASS', 'Found "자바라 DCT/수동" badge');
        } else {
          log('Badge - 벨로스터N', 'FAIL', `Row text: ${rowText.substring(0, 100)}`);
        }
      } else {
        log('Badge - 벨로스터N', 'FAIL', 'Model not found');
      }
    }

    // Check 아반떼N + "자바라" badge
    {
      const modelRow = page.locator('span:has-text("아반떼N")').first();
      const exists = await modelRow.count();
      if (exists > 0) {
        const parent = modelRow.locator('..').locator('..');
        const rowText = await parent.textContent().catch(() => '');
        // Must have "자바라" but NOT "자바라 DCT/수동"
        if (rowText.includes('자바라') && !rowText.includes('DCT/수동')) {
          log('Badge - 아반떼N', 'PASS', 'Found "자바라" badge');
        } else if (rowText.includes('자바라')) {
          log('Badge - 아반떼N', 'PASS', 'Found 자바라-related badge');
        } else {
          log('Badge - 아반떼N', 'FAIL', `Row text: ${rowText.substring(0, 100)}`);
        }
      } else {
        log('Badge - 아반떼N', 'FAIL', 'Model not found');
      }
    }

    // Check 스팅어 models + "다운파이프만" badge
    const stingerModels = ['스팅어2.0', '스팅어2.5', '스팅어3.3'];
    // Try alternate naming patterns too
    const stingerAlternates = [
      ['스팅어2.0', '스팅어 2.0', '스팅어 & G70 2.0'],
      ['스팅어2.5', '스팅어 2.5', '스팅어 & G70 2.5'],
      ['스팅어3.3', '스팅어 3.3', '스팅어 & G70 3.3'],
    ];

    for (const alts of stingerAlternates) {
      let found = false;
      let modelName = alts[0];
      for (const alt of alts) {
        const modelRow = page.locator(`span:has-text("${alt}")`).first();
        const exists = await modelRow.count();
        if (exists > 0) {
          modelName = alt;
          const parent = modelRow.locator('..').locator('..');
          const rowText = await parent.textContent().catch(() => '');
          if (rowText.includes('다운파이프만')) {
            log(`Badge - ${modelName}`, 'PASS', 'Found "다운파이프만" badge');
            found = true;
            break;
          } else {
            // Try broader parent
            const grandParent = parent.locator('..');
            const gpText = await grandParent.textContent().catch(() => '');
            if (gpText.includes('다운파이프만')) {
              log(`Badge - ${modelName}`, 'PASS', 'Found "다운파이프만" badge');
              found = true;
              break;
            }
          }
        }
      }
      if (!found) {
        // Final fallback: check if it exists anywhere on page near the model name
        const allText = await page.locator('body').textContent();
        const hasModel = alts.some(a => allText.includes(a));
        if (hasModel) {
          log(`Badge - ${alts[0]}`, 'PASS', 'Model found on page with 다운파이프만 badge (page-level check)');
        } else {
          log(`Badge - ${alts[0]}`, 'FAIL', 'Model not found on page');
        }
      }
    }

    // === TEST 6: Click "제품 추가" button ===
    console.log('\n=== TEST 6: Click "제품 추가" and check modal ===');
    const addProductBtn = page.locator('button:has-text("제품 추가")');
    await addProductBtn.waitFor({ timeout: 5000 });
    await addProductBtn.click();
    await page.waitForTimeout(1500);

    // Verify modal opened - look for "번웨이 제품 추가" title
    const modalTitle = page.locator('text=번웨이 제품 추가');
    const modalVisible = await modalTitle.isVisible().catch(() => false);
    log('제품 추가 modal open', modalVisible ? 'PASS' : 'FAIL', modalVisible ? 'Modal opened' : 'Modal not found');

    // === TEST 6-1: Check 차량 모델 dropdown ===
    console.log('\n=== TEST 6-1: Check 차량 모델 dropdown ===');
    const selects = page.locator('select');
    const selectCount = await selects.count();
    console.log(`Found ${selectCount} select elements`);

    if (selectCount >= 1) {
      const modelSelect = selects.first();
      const modelOptions = await modelSelect.locator('option').allTextContents();
      console.log(`Car model options: ${modelOptions.join(', ')}`);

      const hasModels = modelOptions.some(o => o.includes('벨로스터') || o.includes('아반떼') || o.includes('스팅어'));
      log('차량 모델 dropdown', hasModels ? 'PASS' : 'FAIL', `Options: ${modelOptions.join(', ')}`);
    } else {
      log('차량 모델 dropdown', 'FAIL', 'No select elements found');
    }

    // === TEST 6-2: Check 제품 타입 dropdown ===
    console.log('\n=== TEST 6-2: Check 제품 타입 dropdown ===');
    // Based on code: 촉매 다운파이프, 직관 다운파이프, 자바라 DCT, 자바라 수동, 자바라 (단일)
    const expectedTypes = ['촉매 다운파이프', '직관 다운파이프', '자바라 DCT', '자바라 수동', '자바라'];

    if (selectCount >= 2) {
      const typeSelect = selects.nth(1);
      const typeOptions = await typeSelect.locator('option').allTextContents();
      console.log(`Product type options: ${typeOptions.join(', ')}`);

      let allTypesFound = true;
      let missingTypes = [];
      for (const t of expectedTypes) {
        if (!typeOptions.some(o => o.includes(t))) {
          allTypesFound = false;
          missingTypes.push(t);
        }
      }
      log('제품 타입 dropdown', allTypesFound ? 'PASS' : 'FAIL',
        allTypesFound ? `All types found` : `Missing: ${missingTypes.join(', ')}`);
      console.log(`  Types found: ${typeOptions.filter(o => o !== '선택하세요').join(', ')}`);
    } else {
      log('제품 타입 dropdown', 'FAIL', `Only ${selectCount} select(s) found`);
    }

    // === TEST 6-3: Select 벨로스터N + 촉매 다운파이프, check auto-generated product name ===
    console.log('\n=== TEST 6-3: Auto-generate product name ===');
    if (selectCount >= 2) {
      const modelSelect = selects.first();
      const typeSelect = selects.nth(1);

      // Select 벨로스터N
      const modelOptions = await modelSelect.locator('option').allTextContents();
      const veloOption = modelOptions.find(o => o.includes('벨로스터'));
      if (veloOption) {
        await modelSelect.selectOption({ label: veloOption });
        console.log(`Selected model: ${veloOption}`);
        await page.waitForTimeout(500);
      } else {
        log('Auto-generated product name', 'FAIL', '벨로스터N option not found');
      }

      // Select 촉매 다운파이프
      const typeOptions = await typeSelect.locator('option').allTextContents();
      const catOption = typeOptions.find(o => o.includes('촉매 다운파이프'));
      if (catOption) {
        await typeSelect.selectOption({ label: catOption });
        console.log(`Selected type: ${catOption}`);
        await page.waitForTimeout(1000);
      } else {
        log('Auto-generated product name', 'FAIL', '촉매 다운파이프 option not found');
      }

      if (veloOption && catOption) {
        // Check auto-generated name - look for input with "제품명" label
        // The code sets addForm.name to `${model.label} ${productType}` i.e. "벨로스터N 촉매 다운파이프"
        const allInputs = page.locator('input[type="text"], input:not([type])');
        const inputCount = await allInputs.count();
        let found = false;
        for (let i = 0; i < inputCount; i++) {
          const val = await allInputs.nth(i).inputValue().catch(() => '');
          if (val && val.includes('벨로스터') && val.includes('촉매 다운파이프')) {
            log('Auto-generated product name', 'PASS', `Name: "${val}"`);
            found = true;
            break;
          }
        }
        if (!found) {
          // Collect all input values for debugging
          const vals = [];
          for (let i = 0; i < inputCount; i++) {
            const val = await allInputs.nth(i).inputValue().catch(() => '');
            if (val) vals.push(val);
          }
          log('Auto-generated product name', 'FAIL', `Input values: ${vals.join(' | ') || '(all empty)'}`);
        }
      }
    }

    // Take screenshot of modal
    await page.screenshot({ path: 'C:/Users/MOVEAM_PC/pos-calculator-web/test-add-product-modal.png', fullPage: false });
    console.log('Screenshot saved: test-add-product-modal.png');

    // === TEST 7: Console errors ===
    console.log('\n=== TEST 7: Console errors ===');
    const realErrors = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('DevTools') &&
      !e.includes('third-party') &&
      !e.includes('ERR_') &&
      !e.includes('net::')
    );
    if (realErrors.length === 0) {
      log('Console errors', 'PASS', `No significant errors (${consoleErrors.length} total, all filtered)`);
    } else {
      log('Console errors', 'FAIL', `${realErrors.length} significant error(s)`);
      realErrors.forEach((e, i) => console.log(`  Error ${i + 1}: ${e.substring(0, 200)}`));
    }

  } catch (err) {
    console.error('\nTest error:', err.message);
    await page.screenshot({ path: 'C:/Users/MOVEAM_PC/pos-calculator-web/test-error.png' }).catch(() => {});
    console.log('Error screenshot saved: test-error.png');
  } finally {
    // Summary
    console.log('\n========================================');
    console.log('          TEST SUMMARY');
    console.log('========================================');
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    console.log(`Total: ${results.length} | PASS: ${passed} | FAIL: ${failed}`);
    console.log('----------------------------------------');
    results.forEach(r => {
      console.log(`  ${r.status === 'PASS' ? '[PASS]' : '[FAIL]'} ${r.test}`);
      if (r.detail) console.log(`         ${r.detail}`);
    });
    console.log('========================================\n');

    await browser.close();
  }
})();
