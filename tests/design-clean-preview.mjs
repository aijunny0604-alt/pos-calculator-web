import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true});
for(const width of [1366,390]){
 const p=await b.newPage({viewport:{width,height:844}});
 await p.goto('http://127.0.0.1:5186/pos-calculator-web/design-preview.html');
 await p.locator('.move-dashboard-heading').waitFor();
 assert.equal(await p.locator('.design-preview-bar').count(),0);
 if(width<768)await p.getByRole('button',{name:'메뉴 열기',exact:true}).click();
 const logo=p.locator('.move-sidebar:visible .move-brand');
 const offset=await logo.evaluate(e=>{const a=e.getBoundingClientRect(),b=e.querySelector('img').getBoundingClientRect();return {x:(b.left+b.width/2)-(a.left+a.width/2),y:(b.top+b.height/2)-(a.top+a.height/2)}});
 assert.ok(Math.abs(offset.x)<=1&&Math.abs(offset.y)<=1,JSON.stringify(offset));
 await p.screenshot({path:`tests/.artifacts/design-clean-${width}.png`});console.log('PASS',width,offset);await p.close();
}
await b.close();
