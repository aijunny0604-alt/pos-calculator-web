import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ssDir = path.join(__dirname, 'screenshots');

const BASE = 'http://localhost:5173/pos-calculator-web/';
let consoleErrors = [];

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  // 헬퍼: 관리자 로그인
  async function loginAdmin() {
    const pw = page.locator('input[type="password"]');
    if (await pw.isVisible().catch(() => false)) {
      await pw.fill('4321');
      await pw.press('Enter');
      await page.waitForTimeout(1500);
    }
  }

  // 헬퍼: 관리자 번웨이탭 → 모델관리 열기
  async function openBurnwayModelManager() {
    const burnwayTab = page.locator('button[role="tab"]').filter({ hasText: '번웨이' });
    await burnwayTab.click();
    await page.waitForTimeout(1000);
    const modelBtn = page.locator('button').filter({ hasText: /모델 관리|닫기/ }).first();
    const btnText = await modelBtn.textContent();
    if (btnText.includes('모델 관리')) {
      await modelBtn.click();
      await page.waitForTimeout(1000);
    }
  }

  // 헬퍼: 특정 모델의 수정 버튼 클릭 (title="수정")
  async function clickModelEditBtn(modelText) {
    const editBtns = page.locator('button[title="수정"]');
    const count = await editBtns.count();
    for (let i = 0; i < count; i++) {
      const parentTxt = await editBtns.nth(i).evaluate(el => {
        const row = el.closest('div[style]') || el.parentElement?.parentElement;
        return row ? row.textContent : '';
      });
      if (parentTxt.includes(modelText)) {
        await editBtns.nth(i).click();
        await page.waitForTimeout(1000);
        return true;
      }
    }
    console.log(`  경고: "${modelText}" 수정 버튼을 찾지 못했습니다`);
    return false;
  }

  // 헬퍼: 편집 영역 locator (input[placeholder="모델명"]이 있는 div.space-y-2)
  function getEditArea() {
    return page.locator('div.space-y-2').filter({ has: page.locator('input[placeholder="모델명"]') });
  }

  // 헬퍼: 편집 영역의 체크박스만 가져오기
  function getEditAreaCheckboxes() {
    return getEditArea().locator('input[type="checkbox"]');
  }

  // 헬퍼: 편집 저장 (편집 영역 내 div.justify-end의 첫 번째 버튼 = Save)
  async function clickSaveEditBtn() {
    const saveBtn = getEditArea().locator('div.justify-end button').first();
    await saveBtn.click();
    await page.waitForTimeout(1500);
  }

  // 헬퍼: 편집 취소 (div.justify-end의 마지막 버튼 = X)
  async function clickCancelEditBtn() {
    const cancelBtn = getEditArea().locator('div.justify-end button').last();
    await cancelBtn.click();
    await page.waitForTimeout(500);
  }

  // 헬퍼: 모달 확실히 닫기
  async function ensureModalClosed() {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await page.locator('.fixed.inset-0').count() === 0) break;
      await page.locator('.fixed.inset-0 .absolute.inset-0').first().click({ position: { x: 10, y: 10 } });
      await page.waitForTimeout(800);
    }
    if (await page.locator('.fixed.inset-0').count() > 0) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
    }
  }

  try {
    // ===== 1단계: 번웨이 재고 페이지 현재 상태 확인 =====
    console.log('\n====== 1단계: 번웨이 재고 페이지 현재 상태 확인 ======');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    await page.locator('text=번웨이 다운파이프').first().click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: path.join(ssDir, '01_burnway_page_initial.png'), fullPage: true });
    console.log('[스크린샷] 01_burnway_page_initial.png');

    // 벨로스터N 카드 검증
    const hasDctSet = await page.locator('text=DCT 세트').count() > 0;
    const hasManualSet = await page.locator('text=수동 세트').count() > 0;
    const hasTotalSet = await page.locator('text=총 세트').count() > 0;
    console.log(`[검증] 벨로스터N - DCT 세트: ${hasDctSet ? 'PASS' : 'FAIL'}`);
    console.log(`[검증] 벨로스터N - 수동 세트: ${hasManualSet ? 'PASS' : 'FAIL'}`);
    console.log(`[검증] 벨로스터N - 총 세트: ${hasTotalSet ? 'PASS' : 'FAIL'}`);

    // 아반떼N 완성 세트
    const hasCompleteSet = await page.locator('text=완성 세트').count() > 0;
    console.log(`[검증] 아반떼N - 완성 세트: ${hasCompleteSet ? 'PASS' : 'FAIL'}`);

    // 스팅어 3.3 카드 - 세트 없음, 촉매/직관만
    const stinger33Card = page.locator('.card-interactive, [class*="rounded-xl"]').filter({ hasText: /스팅어 & G70 3\.3/ });
    let stingerNoSet = false, stingerHasCatStraight = false;
    if (await stinger33Card.count() > 0) {
      const cardText = await stinger33Card.first().textContent();
      stingerNoSet = !cardText.includes('DCT 세트') && !cardText.includes('수동 세트');
      stingerHasCatStraight = cardText.includes('촉매 타입') && cardText.includes('직관 타입');
    }
    console.log(`[검증] 스팅어 3.3 - 세트 현황 없음: ${stingerNoSet ? 'PASS' : 'FAIL'}`);
    console.log(`[검증] 스팅어 3.3 - 촉매/직관 표시: ${stingerHasCatStraight ? 'PASS' : 'FAIL'}`);

    // 벨로스터N 클릭 → 상세 모달
    console.log('\n벨로스터N 상세 모달 확인...');
    await page.locator('text=벨로스터N').first().click();
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(ssDir, '02_veloN_modal.png'), fullPage: true });
    console.log('[스크린샷] 02_veloN_modal.png');

    const modalChecks = {
      'DCT 세트': await page.locator('text=DCT 세트').count() > 0,
      '수동 세트': await page.locator('text=수동 세트').count() > 0,
      '총 세트': await page.locator('text=총 세트').count() > 0,
      '다운파이프': await page.locator('text=다운파이프').count() > 0,
    };
    for (const [k, v] of Object.entries(modalChecks)) {
      console.log(`[검증] 모달 - ${k}: ${v ? 'PASS' : 'FAIL'}`);
    }

    // 모달 닫기
    await ensureModalClosed();

    // ===== 2단계: 관리자 페이지에서 옵션 확인 =====
    console.log('\n====== 2단계: 관리자 페이지에서 옵션 확인 ======');

    await page.locator('text=관리자').first().click({ timeout: 5000 });
    await page.waitForTimeout(1500);
    await loginAdmin();

    await page.screenshot({ path: path.join(ssDir, '03_admin_page.png'), fullPage: true });
    console.log('[스크린샷] 03_admin_page.png');

    await openBurnwayModelManager();

    await page.screenshot({ path: path.join(ssDir, '04_admin_model_mgmt.png'), fullPage: true });
    console.log('[스크린샷] 04_admin_model_mgmt.png');

    // 뱃지 확인
    console.log('\n[검증] 모델별 뱃지:');
    const badgeSpans = page.locator('span[class*="rounded-full"]');
    const badgeCount = await badgeSpans.count();
    const badgeTexts = [];
    for (let i = 0; i < badgeCount; i++) {
      const text = (await badgeSpans.nth(i).textContent()).trim();
      if (text.includes('자바라') || text.includes('다운파이프')) {
        badgeTexts.push(text);
      }
    }
    console.log(`  발견된 뱃지: ${badgeTexts.join(' | ')}`);
    const badgesCorrect =
      badgeTexts.includes('자바라 DCT/수동') &&
      badgeTexts.includes('자바라') &&
      badgeTexts.filter(t => t === '다운파이프만').length === 3;
    console.log(`[검증] 뱃지 배치 정확성: ${badgesCorrect ? 'PASS' : 'FAIL'}`);

    // 벨로스터N 수정 → 체크박스 확인
    console.log('\n벨로스터N 수정 버튼 클릭...');
    await clickModelEditBtn('벨로스터N');

    await page.screenshot({ path: path.join(ssDir, '05_veloN_edit.png'), fullPage: true });
    console.log('[스크린샷] 05_veloN_edit.png');

    // 편집 영역 검증
    const editArea = getEditArea();
    console.log(`  편집 영역 찾음: ${await editArea.count() > 0 ? 'YES' : 'NO'}`);

    const veloEditCbs = getEditAreaCheckboxes();
    const veloEditCount = await veloEditCbs.count();
    console.log(`[검증] 벨로스터N 편집 체크박스 (편집 영역 내부):`);
    for (let i = 0; i < veloEditCount; i++) {
      const checked = await veloEditCbs.nth(i).isChecked();
      const label = await veloEditCbs.nth(i).evaluate(el => el.closest('label')?.textContent?.trim() || 'no-label');
      console.log(`  "${label}": ${checked ? 'CHECKED' : 'UNCHECKED'}`);
    }

    // 편집 취소
    await clickCancelEditBtn();

    // ===== 3단계: 스팅어 3.3에 자바라+DCT/수동 옵션 켜기 =====
    console.log('\n====== 3단계: 스팅어 3.3 옵션 변경 ======');

    await clickModelEditBtn('3.3');

    await page.screenshot({ path: path.join(ssDir, '06_stinger33_edit_before.png'), fullPage: true });
    console.log('[스크린샷] 06_stinger33_edit_before.png');

    // 편집 영역 체크박스 확인
    let editCbs = getEditAreaCheckboxes();
    let editCbCount = await editCbs.count();
    console.log(`  편집 영역 체크박스 수: ${editCbCount}`);
    for (let i = 0; i < editCbCount; i++) {
      const label = await editCbs.nth(i).evaluate(el => el.closest('label')?.textContent?.trim() || '');
      const checked = await editCbs.nth(i).isChecked();
      console.log(`  체크박스 ${i}: "${label}" - ${checked ? 'CHECKED' : 'UNCHECKED'}`);
    }

    // "자바라 세트" 체크
    for (let i = 0; i < editCbCount; i++) {
      const label = await editCbs.nth(i).evaluate(el => el.closest('label')?.textContent?.trim() || '');
      const checked = await editCbs.nth(i).isChecked();
      if (label.includes('자바라') && !checked) {
        console.log('  → "자바라 세트" 체크');
        await editCbs.nth(i).check({ force: true });
        await page.waitForTimeout(500);
        break;
      }
    }

    // 자바라 체크 후 DCT/수동 구분 나타남
    editCbs = getEditAreaCheckboxes();
    editCbCount = await editCbs.count();
    console.log(`  자바라 체크 후 체크박스 수: ${editCbCount}`);
    for (let i = 0; i < editCbCount; i++) {
      const label = await editCbs.nth(i).evaluate(el => el.closest('label')?.textContent?.trim() || '');
      const checked = await editCbs.nth(i).isChecked();
      console.log(`  체크박스 ${i}: "${label}" - ${checked ? 'CHECKED' : 'UNCHECKED'}`);
      if (label.includes('DCT') && !checked) {
        console.log('  → "DCT/수동 구분" 체크');
        await editCbs.nth(i).check({ force: true });
        await page.waitForTimeout(300);
      }
    }

    await page.screenshot({ path: path.join(ssDir, '07_stinger33_checked.png'), fullPage: true });
    console.log('[스크린샷] 07_stinger33_checked.png');

    // 최종 확인: 편집 영역 체크박스 상태
    const finalCbs = getEditAreaCheckboxes();
    const finalCount = await finalCbs.count();
    console.log(`  저장 전 최종 체크박스 상태:`);
    for (let i = 0; i < finalCount; i++) {
      const label = await finalCbs.nth(i).evaluate(el => el.closest('label')?.textContent?.trim() || '');
      const checked = await finalCbs.nth(i).isChecked();
      console.log(`    ${i}: "${label}" = ${checked}`);
    }

    // 저장
    await clickSaveEditBtn();

    await page.screenshot({ path: path.join(ssDir, '08_stinger33_saved.png'), fullPage: true });
    console.log('[스크린샷] 08_stinger33_saved.png');

    // 뱃지 변경 확인
    await page.waitForTimeout(500);
    let foundDctBadge = false;
    const afterBadges = page.locator('span[class*="rounded-full"]');
    const afterBadgeCount = await afterBadges.count();
    for (let i = 0; i < afterBadgeCount; i++) {
      const t = (await afterBadges.nth(i).textContent()).trim();
      if (t === '자바라 DCT/수동') {
        const parentText = await afterBadges.nth(i).evaluate(el => {
          let node = el.parentElement;
          while (node && !node.textContent.includes('3.3')) node = node.parentElement;
          return node?.textContent?.substring(0, 100) || '';
        });
        if (parentText.includes('3.3')) {
          foundDctBadge = true;
          break;
        }
      }
    }
    console.log(`[검증] 스팅어 3.3 뱃지 "자바라 DCT/수동": ${foundDctBadge ? 'PASS' : 'FAIL'}`);

    // ===== 4단계: 재고 페이지에서 변경 반영 확인 =====
    console.log('\n====== 4단계: 재고 페이지 반영 확인 ======');

    await page.locator('text=번웨이 다운파이프').first().click({ force: true });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: path.join(ssDir, '09_burnway_after_change.png'), fullPage: true });
    console.log('[스크린샷] 09_burnway_after_change.png');

    let stinger33DctAfter = false, stinger33ManualAfter = false, stinger33TotalAfter = false;
    const stinger33CardAfter = page.locator('.card-interactive, [class*="rounded-xl"]').filter({ hasText: /스팅어 & G70 3\.3/ });
    if (await stinger33CardAfter.count() > 0) {
      const cardText = await stinger33CardAfter.first().textContent();
      stinger33DctAfter = cardText.includes('DCT 세트');
      stinger33ManualAfter = cardText.includes('수동 세트');
      stinger33TotalAfter = cardText.includes('총 세트');
      console.log(`  카드 텍스트: ${cardText.substring(0, 200)}`);
    }
    console.log(`[검증] 스팅어 3.3 변경 후 - DCT 세트: ${stinger33DctAfter ? 'PASS' : 'FAIL'}`);
    console.log(`[검증] 스팅어 3.3 변경 후 - 수동 세트: ${stinger33ManualAfter ? 'PASS' : 'FAIL'}`);
    console.log(`[검증] 스팅어 3.3 변경 후 - 총 세트: ${stinger33TotalAfter ? 'PASS' : 'FAIL'}`);

    // 스팅어 3.3 모달
    const stClickTarget = page.locator('text=스팅어 & G70 3.3').first();
    if (await stClickTarget.count() > 0) {
      await stClickTarget.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(ssDir, '10_stinger33_modal.png'), fullPage: true });
      console.log('[스크린샷] 10_stinger33_modal.png');
      await ensureModalClosed();
    }

    // ===== 5단계: 옵션 원복 =====
    console.log('\n====== 5단계: 옵션 원복 ======');

    await page.locator('text=관리자').first().click({ timeout: 5000 });
    await page.waitForTimeout(1500);
    await loginAdmin();

    await openBurnwayModelManager();

    await clickModelEditBtn('3.3');

    await page.screenshot({ path: path.join(ssDir, '11_stinger33_revert_edit.png'), fullPage: true });
    console.log('[스크린샷] 11_stinger33_revert_edit.png');

    // 자바라 세트 체크 해제 (편집 영역 내부)
    // 주의: 자바라 해제 시 DCT/수동 체크박스가 사라지므로 즉시 break
    const revertCbs = getEditAreaCheckboxes();
    const revertCount = await revertCbs.count();
    console.log(`  원복 편집 체크박스 수: ${revertCount}`);
    for (let i = 0; i < revertCount; i++) {
      const label = await revertCbs.nth(i).evaluate(el => el.closest('label')?.textContent?.trim() || '');
      const checked = await revertCbs.nth(i).isChecked();
      console.log(`  체크박스 ${i}: "${label}" - ${checked ? 'CHECKED' : 'UNCHECKED'}`);
      if (label.includes('자바라') && !label.includes('DCT') && checked) {
        console.log('  → "자바라 세트" 체크 해제 (DCT/수동도 자동 해제됨)');
        await revertCbs.nth(i).uncheck({ force: true });
        await page.waitForTimeout(500);
        break; // 자바라 해제 시 DCT 체크박스가 DOM에서 사라지므로 즉시 탈출
      }
    }

    // 저장
    await clickSaveEditBtn();

    await page.screenshot({ path: path.join(ssDir, '12_stinger33_reverted.png'), fullPage: true });
    console.log('[스크린샷] 12_stinger33_reverted.png');

    // 뱃지 복원 확인
    let foundDownpipeOnly = false;
    const revertBadges = page.locator('span[class*="rounded-full"]');
    const revertBadgeCount = await revertBadges.count();
    for (let i = 0; i < revertBadgeCount; i++) {
      const t = (await revertBadges.nth(i).textContent()).trim();
      if (t === '다운파이프만') {
        const parentText = await revertBadges.nth(i).evaluate(el => {
          let node = el.parentElement;
          while (node && !node.textContent.includes('3.3')) node = node.parentElement;
          return node?.textContent?.substring(0, 100) || '';
        });
        if (parentText.includes('3.3')) {
          foundDownpipeOnly = true;
          break;
        }
      }
    }
    console.log(`[검증] 스팅어 3.3 뱃지 "다운파이프만" 복원: ${foundDownpipeOnly ? 'PASS' : 'FAIL'}`);

    // 번웨이 재고 페이지 최종 확인
    await page.locator('text=번웨이 다운파이프').first().click({ force: true });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(ssDir, '13_burnway_final.png'), fullPage: true });
    console.log('[스크린샷] 13_burnway_final.png');

    let stingerRevertOk = false;
    const finalCard = page.locator('.card-interactive, [class*="rounded-xl"]').filter({ hasText: /스팅어 & G70 3\.3/ });
    if (await finalCard.count() > 0) {
      const txt = await finalCard.first().textContent();
      stingerRevertOk = !txt.includes('DCT 세트') && !txt.includes('수동 세트') && txt.includes('촉매 타입');
    }
    console.log(`[검증] 원복 후 스팅어 3.3 세트 없음: ${stingerRevertOk ? 'PASS' : 'FAIL'}`);

    // ===== 6단계: 콘솔 에러 확인 =====
    console.log('\n====== 6단계: 콘솔 에러 확인 ======');
    const realErrors = consoleErrors.filter(e =>
      !e.includes('Failed to fetch') &&
      !e.includes('net::ERR') &&
      !e.includes('favicon') &&
      !e.includes('the server responded with a status of')
    );
    console.log(`콘솔 에러 수: ${consoleErrors.length} (실질적 에러: ${realErrors.length})`);
    if (consoleErrors.length > 0) {
      consoleErrors.forEach((err, i) => {
        console.log(`  에러 ${i + 1}: ${err.substring(0, 150)}`);
      });
    }
    console.log(`[검증] 콘솔 에러: ${realErrors.length === 0 ? 'PASS' : `FAIL (${realErrors.length}건)`}`);

    // ===== 최종 요약 =====
    console.log('\n========================================');
    console.log('       최종 테스트 결과 요약');
    console.log('========================================');
    const results = [
      ['1단계 벨로스터N DCT/수동/총세트 표시', hasDctSet && hasManualSet && hasTotalSet],
      ['1단계 아반떼N 완성세트 표시', hasCompleteSet],
      ['1단계 스팅어3.3 세트 없음(촉매/직관만)', stingerNoSet && stingerHasCatStraight],
      ['1단계 벨로스터N 모달 4칸 그리드', Object.values(modalChecks).every(Boolean)],
      ['2단계 뱃지 배치 정확성', badgesCorrect],
      ['3단계 스팅어3.3 뱃지→자바라DCT/수동', foundDctBadge],
      ['4단계 재고페이지 DCT/수동/총세트 반영', stinger33DctAfter && stinger33ManualAfter && stinger33TotalAfter],
      ['5단계 스팅어3.3 뱃지→다운파이프만 복원', foundDownpipeOnly],
      ['5단계 원복 후 세트 없음 확인', stingerRevertOk],
      ['6단계 콘솔 에러 0건', realErrors.length === 0],
    ];
    let allPass = true;
    for (const [name, pass] of results) {
      console.log(`  ${pass ? 'PASS' : 'FAIL'} - ${name}`);
      if (!pass) allPass = false;
    }
    console.log(`\n  전체 결과: ${allPass ? 'ALL PASS' : 'SOME FAILED'}`);
    console.log('========================================');

  } catch (err) {
    console.error('테스트 에러:', err.message);
    console.error(err.stack?.split('\n').slice(0, 5).join('\n'));
    await page.screenshot({ path: path.join(ssDir, 'ERROR.png'), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    console.log('\n브라우저 종료됨.');
  }
})();
