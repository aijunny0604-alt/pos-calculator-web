import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const results=[];
for(const [width,height,dpr] of [[360,640,3],[390,844,3],[412,915,2.625],[768,1024,2],[1024,768,1.25],[1920,1080,1]]){
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:width<800,reducedMotion:width<800?'reduce':'no-preference'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5186/pos-calculator-web/design-preview.html?tools=1');await page.locator('.move-dashboard-heading').waitFor();
 await page.getByRole('button',{name:'긴 내용',exact:true}).click();const dialog=page.getByRole('dialog',{name:'변경 내용을 저장할까요?'});await dialog.waitFor();
 const body=dialog.locator('.move-confirm-body');assert.ok(await body.evaluate(e=>e.scrollHeight>e.clientHeight));
 await body.evaluate(e=>e.scrollTop=e.scrollHeight);const footer=await dialog.locator('.move-confirm-footer').boundingBox();assert.ok(footer.y+footer.height<=height);
 await page.keyboard.press('Tab');await page.keyboard.press('Tab');assert.ok(await dialog.evaluate(e=>e.contains(document.activeElement)));
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'긴 내용',exact:true}).evaluate(e=>e===document.activeElement),true);
 await page.getByRole('button',{name:'입금 등록',exact:true}).first().click();await page.getByText('어느 업체인가요?').waitFor();
 const panel=page.locator('.move-dialog:visible').last();await panel.locator('select').first().selectOption('1');await page.waitForTimeout(250);
 const rect=await panel.boundingBox();assert.ok(rect.x>=-1&&rect.x+rect.width<=width+1);assert.ok(rect.y>=-1&&rect.y+rect.height<=height+1);
 await panel.evaluate(e=>e.scrollTop=e.scrollHeight);const f=await panel.locator('.move-dialog-footer').boundingBox();assert.ok(f.y+f.height<=height+1);
 await page.screenshot({path:`tests/.artifacts/design-payment-${width}.png`});await page.getByRole('button',{name:'닫기',exact:true}).last().click();
 if(width<768)await page.evaluate(()=>window.dispatchEvent(new Event('open-sidebar')));
 await page.locator('.move-sidebar:visible nav').getByRole('button',{name:/^주문 내역/}).click();await page.getByRole('button',{name:'상세보기',exact:true}).first().click();await page.getByRole('heading',{name:'주문 상세',exact:true}).waitFor();await page.waitForTimeout(400);
 const order=page.locator('.move-dialog:visible').first();const ob=await order.boundingBox();assert.ok(ob.x>=-1&&ob.x+ob.width<=width+1);
 const clipped=await order.evaluate(e=>[...e.querySelectorAll('button,h2,input')].filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&(r.right>innerWidth+1||r.left< -1)}).map(n=>n.textContent.slice(0,35)));
 await page.screenshot({path:`tests/.artifacts/design-order-modal-${width}.png`});
 results.push({width,height,dpr,clipped,errors});console.log(JSON.stringify(results.at(-1)));await page.close();
}
writeFileSync('tests/.artifacts/design-modal-audit.json',JSON.stringify(results,null,2));await browser.close();
assert.ok(results.every(r=>!r.clipped.length&&!r.errors.length),JSON.stringify(results));
