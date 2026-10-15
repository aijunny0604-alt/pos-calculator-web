import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const results=[];
for(const width of [1366,360]){
 const page=await browser.newPage({viewport:{width,height:width===1366?768:844},hasTouch:width<800,isMobile:width<600,reducedMotion:width<600?'reduce':'no-preference'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5186/pos-calculator-web/design-preview.html?tools=1');await page.locator('.move-dashboard-heading').waitFor();await page.waitForTimeout(1200);
 const labels=width===1366||width===360?['대시보드','제품 주문','주문 내역','메모 모아보기','저장된 장바구니','택배 송장','거래처 관리','명세서','재고 현황','번웨이 다운파이프','매입 발주','매입 단가표','JSR 대여·불량 관리','AI 주문 인식','스마트스토어 주문','관리자','MOVIS']:['대시보드'];
 for(const label of labels){
  if(width<768)await page.evaluate(()=>window.dispatchEvent(new Event('open-sidebar')));
  const nav=page.locator('.move-sidebar:visible nav');
  try{await nav.getByRole('button',{name:new RegExp('^'+label)}).first().click({timeout:5000});await page.waitForTimeout(label==='MOVIS'?3000:700);
  const state=await page.evaluate(()=>{
   const out=[];
   for(const el of document.querySelectorAll('main button,main input,main select,main h1,main h2')){
    const r=el.getBoundingClientRect();if(!r.width||!r.height||r.bottom<0||r.top>innerHeight)continue;
    if(r.right>innerWidth+2||r.left< -2){let parent=el.parentElement,scroll=false;while(parent&&parent.tagName!=='MAIN'){if(['auto','scroll'].includes(getComputedStyle(parent).overflowX)){scroll=true;break}parent=parent.parentElement}if(!scroll)out.push({text:(el.textContent||el.getAttribute('placeholder')||el.tagName).slice(0,45),x:Math.round(r.x),right:Math.round(r.right)});}
   }
   return {pageOverflow:document.documentElement.scrollWidth>innerWidth,clipped:out};
  });results.push({width,label,...state});console.log(JSON.stringify(results.at(-1)));
  if(['대시보드','제품 주문','주문 내역','거래처 관리','스마트스토어 주문'].includes(label))await page.screenshot({path:`tests/.artifacts/design-${width}-${labels.indexOf(label)}.png`});
  }catch(e){results.push({width,label,error:e.message.slice(0,200)});console.log('FAIL',width,label,e.message.slice(0,100));}
 }
 for(const label of ['확인창','긴 내용','거래처 선택','입금 등록']){
  await page.getByRole('button',{name:label,exact:true}).first().click();await page.waitForTimeout(500);
  await page.screenshot({path:`tests/.artifacts/design-modal-${width}-${label}.png`});
  const panel=page.locator('.move-dialog:visible').last();
  if(await panel.count())results.push({width,modal:label,box:await panel.boundingBox()});
  const close=page.getByRole('button',{name:'닫기',exact:true}).last();
  if(await close.isVisible())await close.click();else await page.keyboard.press('Escape');
 }
 console.log('PAGE_ERRORS',width,JSON.stringify(errors));results.push({width,errors});await page.close();
}
writeFileSync('tests/.artifacts/design-audit.json',JSON.stringify(results,null,2));await browser.close();
if(results.some(r=>r.error||r.pageOverflow||r.clipped?.length||r.errors?.length))process.exitCode=1;
