import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
  for(const viewport of [{width:1366,height:768},{width:390,height:844},{width:360,height:800}]) {
    const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:5186/pos-calculator-web/design-preview.html?financeCheck=1');
    await page.getByRole('heading',{name:'스토어 정산·부가세'}).waitFor();
    for(const tab of ['일별 정산','건별 정산','수수료 상세','부가세 자료']) {
      await page.getByRole('button',{name:tab,exact:true}).click();
      await page.getByRole('button',{name:'조회',exact:true}).click();
      await page.getByText('전체 1건 · 1페이지',{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${viewport.width} ${tab} 가로 넘침`);
      if(tab==='부가세 자료') { assert.equal(await page.getByText('과세 매출',{exact:true}).count(),1);assert.equal(await page.getByText('납부할 부가세 금액과 다릅니다.',{exact:false}).count(),1);await page.getByText('결제 수단별 내역').click();assert.equal(await page.getByText('현금영수증 소득공제').isVisible(),true); }
    }
    await page.screenshot({path:`tests/.artifacts/store-finance-${viewport.width}.png`});
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: 1366·390·360 각 조회, 부가세 안내, 가로 넘침 및 화면 오류');
} finally {await browser.close();}
