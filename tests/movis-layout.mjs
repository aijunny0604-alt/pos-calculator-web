import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
try {
for(const width of [1920,1536,1366,900,768,390,360]) {
 const page=await browser.newPage({viewport:{width,height:width<540?844:width===1366?768:1080},hasTouch:width<800,reducedMotion:width<800?'reduce':'no-preference'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/movis/**',route=>route.fulfill({json:route.request().url().endsWith('/session')?{token:'fixture'}:{connected:true,plan:'prolite',models:[{model:'gpt-6.1-sol',displayName:'GPT-6.1-Sol',isDefault:true},{model:'gpt-6-astra',displayName:'GPT-6-Astra'}],rateLimits:{rateLimitsByLimitId:{codex:{primary:{usedPercent:3,windowDurationMins:10080}}}}}}));
 await page.goto('http://127.0.0.1:5174/pos-calculator-web/tests/movis-layout.html');
 await page.getByText('ChatGPT prolite',{exact:true}).waitFor();
 await page.waitForTimeout(800);
 const geometry=await page.evaluate(()=>{
  const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,width:r.width}};
  const cards=[...document.querySelectorAll('.movis-message-row')].map(rect);
  return {overflow:document.documentElement.scrollWidth>innerWidth,panels:[...document.querySelector('.movis-live-control').children].map(rect),gap:cards[1].y-cards[0].bottom,scrollable:document.querySelector('.movis-conversation').clientHeight,header:rect(document.querySelector('.movis-header'))};
 });
 assert.equal(geometry.overflow,false,JSON.stringify({width,geometry}));
 assert.ok(geometry.gap>=24,JSON.stringify({width,geometry}));
 for(const p of geometry.panels)assert.ok(p.x>=0&&p.right<=width,JSON.stringify({width,p}));
 for(let i=0;i<geometry.panels.length;i++)for(let j=i+1;j<geometry.panels.length;j++){const a=geometry.panels[i],b=geometry.panels[j];assert.ok(a.right<=b.x+1||b.right<=a.x+1||a.bottom<=b.y+1||b.bottom<=a.y+1,`panel overlap ${width}`)}
 assert.ok(geometry.scrollable>180);
 await page.getByLabel('GPT 모델 선택').selectOption('gpt-6-astra');
 await page.getByLabel('Codex 연결 설정').click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
 await page.locator('.movis-conversation').evaluate(e=>e.scrollTop=0);
 await page.screenshot({path:`tests/.artifacts/movis-layout-${width}.png`});
 assert.deepEqual(errors,[]);console.log('PASS',width,JSON.stringify(geometry));await page.close();
}
}finally{await browser.close()}
