import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.POS_PREVIEW_URL || 'http://127.0.0.1:5191/pos-calculator-web';
const browser=await chromium.launch({headless:true});
try {
 for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:360,height:640},{width:390,height:420}]) {
  for(const embedded of [false,true]) {
   const page=await browser.newPage({viewport,hasTouch:viewport.width<768});
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   const aiRequests=[];page.on('request',request=>{if(request.url().includes('generativelanguage.googleapis.com'))aiRequests.push(request.url());});
   await page.addInitScript(()=>{localStorage.setItem('useGeminiAI','false');localStorage.removeItem('pos_reservation_snooze_until');});
   await page.goto(`${base}/design-preview.html?aiOrderLayoutCheck=1${embedded?'&embedded=1':''}`);
   const alert=page.getByRole('region',{name:'예약 주문 알림'});
   await alert.getByText(/오늘 예약 5건/).waitFor();
   assert.ok((await alert.boundingBox()).height <= viewport.height*.35+1);
   if(embedded)await page.getByTitle('AI 주문 인식',{exact:true}).click();
   const body=page.getByRole('region',{name:'주문 입력과 분석 결과'});
   await body.getByPlaceholder(/주문 메모를 붙여넣으세요/).fill('플랜지 63 1개\n'.repeat(12));
   await body.getByRole('button',{name:'텍스트 분석',exact:true}).click();
   const cta=page.getByRole('button',{name:/개 제품 주문하기/});
   await cta.waitFor();
   const checkCta=async()=>{
    const bounds=await cta.boundingBox();
    const navElement=page.locator('.move-mobile-nav:visible');
    const nav=await navElement.count() ? await navElement.boundingBox() : null;
    const bottom=!embedded&&nav?nav.y:viewport.height;
    assert.ok(bounds.y>=0 && bounds.y+bounds.height<=bottom+1,`하단 버튼 잘림 ${JSON.stringify({viewport,embedded,bounds,bottom})}`);
    assert.ok(await cta.evaluate(button=>{const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'다른 레이어가 버튼을 가리면 안 됨');
   };
   await checkCta();
   await body.evaluate(element=>{element.scrollTop=element.scrollHeight;});
   assert.ok(await body.evaluate(element=>element.scrollTop>0),'결과 마지막까지 스크롤 가능');
   await checkCta();
   await page.getByTitle('AI 설정',{exact:true}).click();
   const mode=page.getByRole('button',{name:/패턴 분석 기본 텍스트 매칭/});
   await mode.waitFor();
   assert.ok(await mode.evaluate(button=>{const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'중첩 설정창 버튼 접근');
   await mode.click();
   await checkCta();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'가로 넘침');
   await cta.click();
   await page.getByRole('status',{name:'장바구니 담기 결과'}).getByText(embedded?'13':'12',{exact:true}).waitFor();
   assert.deepEqual(aiRequests,[],'테스트 중 유료 AI API 호출 없음');
   assert.deepEqual(errors,[]);
   console.log(`${viewport.width}x${viewport.height}/${embedded?'제품 주문 모달':'단독 페이지'}: 예약 5건·본문 스크롤·주문 버튼·중첩 설정·담기 통과`);
   await page.close();
  }
 }
} finally {await browser.close();}
