import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
for(const reducedMotion of ['reduce','no-preference']){
 const page=await browser.newPage({viewport:{width:1366,height:900},reducedMotion});
 await page.goto('http://127.0.0.1:5186/pos-calculator-web/design-preview.html?tools=1');
 await page.locator('.move-dashboard').waitFor();
 const pageMotion=await page.locator('.animate-page-in').evaluate(e=>({name:getComputedStyle(e).animationName,duration:getComputedStyle(e).animationDuration}));
 assert.equal(pageMotion.name,'page-fade-in');assert.equal(pageMotion.duration,'0.42s');
 await page.locator('.move-stat-card').first().hover();await page.waitForTimeout(400);
 assert.match(await page.locator('.move-stat-card').first().evaluate(e=>getComputedStyle(e).transform),/-3\)/);
 await page.getByRole('button',{name:'확인창',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();
 const modalMotion=await dialog.evaluate(e=>({name:getComputedStyle(e).animationName,duration:getComputedStyle(e).animationDuration}));
 assert.equal(modalMotion.name,'move-dialog-in');assert.equal(modalMotion.duration,'0.36s');
 await page.waitForTimeout(400);assert.equal(await dialog.evaluate(e=>getComputedStyle(e).opacity),'1');
 console.log('PASS',reducedMotion,pageMotion,modalMotion);await page.close();
}
await browser.close();
