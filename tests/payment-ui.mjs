import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1366,height:900},timezoneId:'Asia/Seoul'});
await page.goto('http://127.0.0.1:5186/pos-calculator-web/design-preview.html?tools=1&paymentChecks=1');
await page.locator('.move-dashboard-heading').waitFor();
// 외부 네트워크 대신 응답만 주입해 API와 화면 실패 처리를 검증한다.
const api=await page.evaluate(async()=>{
 const {supabase}=await import('/pos-calculator-web/src/lib/supabase.js');
 window.paymentAPI=supabase; window.originalPreviewFetch=window.fetch;
 const original=window.fetch;const calls=[];
 try {
  window.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({message:'denied'}),{status:403});};
  const denied=await supabase.deletePaymentHistory(701);
  window.fetch=async()=>new Response('[]',{status:200});
  const missing=await supabase.deletePaymentHistory(701);
  window.fetch=async()=>new Response('[{"id":701}]',{status:200});
  const deleted=await supabase.deletePaymentHistory(701);
  window.fetch=async(url,options)=>{calls.push({url,options});return new Response('[{"id":1},{"id":2}]',{status:201});};
  await supabase.addPaymentHistoryBatch([{payment_record_id:901,amount:100},{payment_record_id:902,amount:200}]);
  return {denied,missing,deleted,batch:JSON.parse(calls.at(-1).options.body)};
 } finally {window.fetch=original;}
});
assert.equal(api.denied,false);assert.equal(api.missing,false);assert.equal(api.deleted,true);assert.equal(api.batch.length,2);
await page.getByRole('button',{name:'입금 수정 검증',exact:true}).click();
assert.equal(await page.locator('input[type=datetime-local]').inputValue(),'2026-10-15T08:15');
await page.evaluate(()=>{window.fetch=async(url,opts={})=>opts.method==='DELETE'?new Response('{}',{status:403}):window.originalPreviewFetch(url,opts);});
await page.locator('.move-dialog').getByRole('button',{name:/삭제/}).click();
await page.getByRole('dialog').getByRole('button',{name:/삭제/}).click();
await page.getByText('삭제하지 못했습니다.',{exact:false}).waitFor();
assert.ok(await page.locator('input[type=datetime-local]').isVisible());
await page.getByRole('button',{name:'닫기',exact:true}).last().click();
await page.getByRole('button',{name:'일괄 입금 검증',exact:true}).click();
let panel=page.locator('.move-dialog:visible');
await panel.locator('input[inputmode=numeric]').fill('31000');
assert.ok(await panel.getByRole('button',{name:/건에 일괄 저장/}).isDisabled());
await panel.locator('input[inputmode=numeric]').fill('30000');
await page.evaluate(()=>{window.batchCalls=0;window.fetch=async(url,opts={})=>{if(opts.method==='POST'){window.batchCalls++;return new Response('null',{status:200});}return window.originalPreviewFetch(url,opts);};});
await panel.getByRole('button',{name:/건에 일괄 저장/}).click();
await panel.getByText(/저장 결과를 확인하지 못했습니다/).waitFor();
assert.ok(await panel.getByRole('button',{name:/건에 일괄 저장/}).isDisabled());
assert.equal(await page.evaluate(()=>window.batchCalls),1);
await panel.getByRole('button',{name:'취소',exact:true}).click();
await page.getByRole('button',{name:'일괄 입금 검증',exact:true}).click();
await panel.locator('input[inputmode=numeric]').fill('30000');
await page.evaluate(()=>{window.batchCalls=0;window.fetch=async(url,opts={})=>{if(opts.method==='POST'){window.batchCalls++;await new Promise(r=>setTimeout(r,200));return new Response(JSON.stringify(JSON.parse(opts.body).map((r,i)=>({...r,id:i+1}))),{status:201});}return window.originalPreviewFetch(url,opts);};});
await panel.getByRole('button',{name:/건에 일괄 저장/}).evaluate(button=>{button.click();button.click();});
await panel.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.batchCalls),1);
await page.evaluate(()=>{
 window.fetch=async(url,opts={})=>{
  const u=new URL(String(url),location.href);
  if(u.pathname.endsWith('/payment_records')) {
   const id=u.searchParams.get('customer_id')?.slice(3);
   await new Promise(r=>setTimeout(r,id==='1'?400:20));
   return new Response(JSON.stringify([{id:Number(id)*100,customer_id:Number(id),balance:10000,total_amount:10000,invoice_number:'CUSTOMER-'+id}]),{status:200});
  }
  return window.originalPreviewFetch(url,opts);
 };
});
await page.getByRole('button',{name:'입금 등록',exact:true}).click();
panel=page.locator('.move-dialog:visible');
await panel.locator('select').first().selectOption('1');
await panel.locator('select').first().selectOption('2');
await page.waitForTimeout(600);
assert.match(await panel.locator('select').nth(1).innerText(),/CUSTOMER-2/);
assert.doesNotMatch(await panel.locator('select').nth(1).innerText(),/CUSTOMER-1/);
console.log('PASS: 삭제 403/빈 결과/성공, 일괄 단일 요청·초과 금액·실패·중복 클릭, 한국 시간 표시');
await browser.close();

