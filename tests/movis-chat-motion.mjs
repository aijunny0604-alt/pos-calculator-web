import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
try {
 for (const config of [{width:1366,height:768,reduce:false,touch:false},{width:390,height:844,reduce:true,touch:true}]) {
  const page=await browser.newPage({viewport:{width:config.width,height:config.height},hasTouch:config.touch,isMobile:config.touch,reducedMotion:config.reduce?'reduce':'no-preference'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5174/pos-calculator-web/tests/movis-chat-motion.html');
  await page.getByText('필요한 업무를 편하게 말씀해주세요. 함께 확인하겠습니다.').waitFor();
  assert.equal(await page.locator('.movis-message-row.is-entering').count(),0);
  await page.getByLabel('무비스에게 요청').fill('오늘 챙겨야 할 일을 차분하게 정리해줘.');
  await page.getByLabel('전송',{exact:true}).click();
  await page.getByText('생각 정리 중',{exact:true}).waitFor();
  assert.equal(await page.locator('.is-user.is-entering').evaluate(e=>getComputedStyle(e).animationName),'movis-user-arrive');
  assert.equal(await page.locator('.movis-thinking-bars i').first().evaluate(e=>getComputedStyle(e).animationName),'movis-signal-wave');
  await page.evaluate(()=>window.setMovisFixture({streamingText:'먼저 확인할 업무를 정리하고 있습니다.\n\n**차근차근 확인하겠습니다.**'}));
  await page.getByText('답변 작성 중',{exact:true}).first().waitFor();
  assert.equal(await page.locator('.movis-stream-cursor').evaluate(e=>getComputedStyle(e).animationName),'movis-answer-glow');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.movis-live-answer')).opacity==='1');
  await page.screenshot({path:`tests/.artifacts/movis-chat-${config.width}.png`});
  await page.evaluate(()=>window.setMovisFixture({messages:[{id:'history',role:'assistant',content:'필요한 업무를 편하게 말씀해주세요. 함께 확인하겠습니다.'},{id:'new-user',role:'user',content:'오늘 챙겨야 할 일을 차분하게 정리해줘.'},{id:'done',role:'assistant',content:'확인할 업무를 정리했습니다.\n- 첫 번째 확인 항목\n- 두 번째 확인 항목',ts:Date.now()}],isLoading:false,streamingText:''}));
  await page.getByText('확인할 업무를 정리했습니다.').waitFor();
  assert.equal(await page.locator('.movis-live-answer').count(),0);
  assert.equal(await page.locator('.is-assistant.is-entering').count(),1);
  if(!config.touch){
   const card=page.locator('.movis-message-card').last();await card.hover();
   await page.waitForTimeout(350);
   assert.equal(await card.evaluate(e=>getComputedStyle(e,'::before').opacity),'1');
   assert.match(await card.evaluate(e=>getComputedStyle(e).transform),/-2\)/);
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: 신규 메시지만 등장, 대기·스트리밍·완료 전환, 호버, 모바일 터치/폭, reduced-motion 환경에서도 요청한 모션 유지');
} finally {await browser.close()}
