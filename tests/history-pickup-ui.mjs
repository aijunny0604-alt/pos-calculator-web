import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless:true });
try {
  for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
    const page = await browser.newPage({viewport});
    const errors=[]; page.on('pageerror', error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:5191/pos-calculator-web/design-preview.html?historyPickupCheck=1');
    const cards=page.locator('.order-history-card');
    const visit=cards.filter({hasText:'방문수령 샘플'});
    const stamp=visit.getByText('방문수령 상품 포함');
    await stamp.waitFor();
    const paid=visit.getByText(/통장입금 완료/);
    await paid.waitFor();
    const a=await stamp.boundingBox(), b=await paid.boundingBox();
    assert.ok(a.y + a.height <= b.y || b.y + b.height <= a.y || a.x + a.width <= b.x || b.x + b.width <= a.x, '방문수령과 입금완료 스탬프가 겹치면 안 됩니다');
    for (const name of ['택배 샘플','택배 전환 샘플','연결 없는 샘플']) assert.equal(await cards.filter({hasText:name}).getByText('방문수령 상품 포함').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    console.log(`${viewport.width}: 방문수령 표시 및 택배·미연결 주문 제외 확인`);
    await page.close();
  }
} finally { await browser.close(); }
