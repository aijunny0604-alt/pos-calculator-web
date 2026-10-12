import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const errors=[];
for(const width of [1440,768,390,360]){
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:43127/pos-calculator-web/');await page.getByText('MOVIS',{exact:true}).first().click();
 const boot=page.getByRole('region',{name:'무비스 시작 화면'});await boot.waitFor();await page.getByRole('button',{name:'바로 시작'}).click();await page.setViewportSize({width,height:900});
 const select=page.getByLabel('GPT 모델 선택');await select.waitFor();await page.waitForFunction(()=>document.querySelector('[aria-label="GPT 모델 선택"]')?.options.length>1);
 assert.ok(await select.locator('option').count()>=2);await select.selectOption('gpt-6-luna');assert.equal(await page.evaluate(()=>localStorage.getItem('movis_model_v2')),'gpt-6-luna');
 await page.getByText(/% 사용/).first().waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const time1=await page.locator('.movis-live-actions>small').textContent();if(width===1440){await page.waitForTimeout(11000);assert.notEqual(await page.locator('.movis-live-actions>small').textContent(),time1)}
 await page.screenshot({path:`tests/.artifacts/movis-control-${width}.png`});await page.close();console.log(width+': PASS');
}
await browser.close();assert.deepEqual(errors,[]);
