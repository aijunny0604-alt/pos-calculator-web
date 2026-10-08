import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const errors=[];
for(const mode of ['automatic','skip','escape','reduce']){
 const page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:mode==='reduce'?'reduce':'no-preference'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.MOVIS_UI_URL||'http://127.0.0.1:5173/pos-calculator-web/');
 await page.getByText('MOVIS',{exact:true}).first().click();
 const boot=page.getByRole('region',{name:'무비스 시작 화면'});
 if(mode==='reduce'){await page.getByRole('textbox',{name:'무비스에게 요청'}).waitFor();assert.equal(await boot.count(),0);}
 else{
  await boot.waitFor();
  if(mode==='skip')await page.getByRole('button',{name:'바로 시작'}).click();
  if(mode==='escape')await page.keyboard.press('Escape');
  if(mode==='automatic'){await page.waitForTimeout(650);await page.screenshot({path:'tests/.artifacts/movis-boot.png'});}
  await boot.waitFor({state:'detached',timeout:4000});
 }
 assert.equal(await page.getByRole('textbox',{name:'무비스에게 요청'}).evaluate(el=>!!el.closest('[inert]')),false);
 await page.close();
 console.log(`${mode}: PASS`);
}
await browser.close();assert.deepEqual(errors,[]);
