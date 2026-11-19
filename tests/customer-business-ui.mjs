import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless:true });
try {
  for (const width of [1440,768,390,360]) {
    const page = await browser.newPage({ viewport:{width,height:900} });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:5191/pos-calculator-web/design-preview.html?businessHistoryCheck=1');
    await page.getByText('사업자 이력 샘플 업체',{exact:true}).click();
    const panel = page.getByRole('region',{name:'거래처 사업자 정보와 변경 이력'});
    await panel.getByText('123-45-67890',{exact:true}).waitFor();
    await panel.getByRole('button',{name:'사업자 변경',exact:true}).click();
    await panel.getByLabel('상호 *',{exact:true}).fill('새 상호');
    await panel.getByLabel('사업자등록번호 *',{exact:true}).fill('987-65-43210');
    await panel.getByRole('button',{name:'이전 정보 보존 후 저장'}).click();
    await panel.getByText('987-65-43210',{exact:true}).waitFor();
    await panel.getByRole('button',{name:/이전 사업자·등록증/}).click();
    await panel.getByText('123-45-67890',{exact:true}).waitFor();
    assert.equal(await panel.getByRole('link',{name:'이전 사업자등록증 열기 ↗'}).getAttribute('href'),'https://example.test/old.png');
    await panel.getByRole('button',{name:'사업자 변경',exact:true}).click();
    await panel.getByLabel('상호 *',{exact:true}).fill('저장하지 않은 초안');
    await page.getByRole('button',{name:'다른 기기 변경 모사'}).click();
    await panel.getByRole('button',{name:'이전 정보 보존 후 저장'}).click();
    await panel.getByText(/다른 화면에서 사업자 정보가 변경/).waitFor();
    assert.equal(await panel.getByLabel('상호 *',{exact:true}).inputValue(),'저장하지 않은 초안');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors,[]); await page.close();
    console.log(`${width}: 이전·현재 정보, 등록증 보존 표시, 충돌 거부·초안 보존 확인`);
    for (const scenario of ['empty','photoOnly']) {
      const sample = await browser.newPage({ viewport:{width,height:900} });
      const sampleErrors = []; sample.on('pageerror', error => sampleErrors.push(error.message));
      await sample.route('**/business-test/previous.webp', route => route.fulfill({ contentType:'image/svg+xml', body:'<svg xmlns="http://www.w3.org/2000/svg" width="128" height="160"><rect width="128" height="160" fill="white"/><text x="8" y="40">등록증 샘플</text></svg>' }));
      await sample.goto(`http://127.0.0.1:5191/pos-calculator-web/design-preview.html?businessHistoryCheck=1&businessScenario=${scenario}`);
      await sample.getByText('사업자 이력 샘플 업체',{exact:true}).click();
      const region = sample.getByRole('region',{name:'거래처 사업자 정보와 변경 이력'});
      await region.getByRole('button',{name:'사업자 정보 등록',exact:true}).waitFor();
      assert.equal(await region.getByText('미등록',{exact:true}).count(),0);
      assert.equal(await region.getByText('기존 기록 · 변경일 미등록',{exact:true}).count(),0);
      if (scenario === 'empty') {
        await region.getByText('사업자 정보가 아직 등록되지 않았습니다.',{exact:true}).waitFor();
        assert.ok((await region.boundingBox()).height < 280,'빈 정보 영역이 불필요하게 커지면 안 됨');
        await region.getByText(/보존된 이전 사업자·등록증이 없습니다/).waitFor();
      } else {
        await region.getByRole('link',{name:'현재 사업자등록증 열기 ↗'}).waitFor();
        await region.getByRole('button',{name:/이전 사업자·등록증 1건 보기/}).click();
        const previousLink = region.getByRole('link',{name:/이전 사업자등록증 열기/});
        assert.equal(await previousLink.getAttribute('href'),'http://127.0.0.1:5191/pos-calculator-web/business-test/previous.webp');
        await region.getByAltText('이전 사업자등록증 미리보기').scrollIntoViewIfNeeded();
        assert.ok(await region.getByAltText('이전 사업자등록증 미리보기').evaluate(async image => { await image.decode(); return image.naturalWidth > 0; }));
        assert.equal(await region.getByText('미등록',{exact:true}).count(),0);
        await region.getByRole('button',{name:/이전 사업자·등록증 1건 접기/}).click();
        assert.equal(await region.getByAltText('이전 사업자등록증 미리보기').count(),0);
      }
      assert.ok(await sample.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(sampleErrors,[]);
      await sample.close();
      console.log(`${width}: ${scenario} 빈 항목 축소·등록증 접근·이력 접기 확인`);
    }
  }
} finally { await browser.close(); }
