import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/movis/session',r=>r.fulfill({json:{token:'fixture'}}));
 await page.route('**/api/movis/status',r=>r.fulfill({json:{connected:true,plan:'plus',models:[{model:'first',displayName:'First'},{model:'recommended',displayName:'Recommended',isDefault:true}]}}));
 await page.goto('http://127.0.0.1:5174/pos-calculator-web/tests/movis-attachments.html?connection');
 const picker=page.getByLabel('GPT 모델 선택');
 await page.getByText('ChatGPT plus',{exact:true}).waitFor();
 assert.equal(await picker.inputValue(),'auto');
 assert.match(await picker.innerText(),/자동 선택 · Recommended/);
 await picker.selectOption('first');await page.reload();
 await page.getByText('ChatGPT plus',{exact:true}).waitFor();
 assert.equal(await picker.inputValue(),'first');
 await picker.selectOption('auto');
 assert.equal(await page.evaluate(()=>localStorage.getItem('movis_model_v2')),'auto');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByLabel('Codex 연결 설정').click();
 const download=page.getByRole('link',{name:'Windows 설치 파일 다운로드 ↗'});
 assert.match(await download.getAttribute('href'),/releases\/download\/movis-windows-2026.10.13\/MOVIS-Intelligence.zip$/);
 await page.getByText('설치 방법 · 다른 PC에서 사용하기',{exact:true}).click();
 await page.getByText(/기본값은 사용 안 함입니다/).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'tests/.artifacts/movis-model-picker.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: 요금제 표시, 자동 추천, 수동 선택 유지, 자동 복귀, 모바일 폭');
} finally {await browser.close()}
