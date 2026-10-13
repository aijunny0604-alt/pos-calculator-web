import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fixture } from './movis-fixtures.mjs';
const data=structuredClone(fixture);
data.orders[0]={...data.orders[0],id:'TEST-ORDER-101',customer_name:'검증모터스',created_at:new Date().toISOString(),customer_phone:'',customer_address:'',memo:''};
const map={products:'products',customers:'customers',orders:'orders',saved_carts:'savedCarts',ai_learning:'aiLearningData',payment_records:'paymentRecords',payment_history:'paymentHistory',customer_returns:'customerReturns',external_orders:'externalOrders',external_products:'externalProducts',purchase_orders:'purchaseOrders',supplier_prices:'supplierPrices',business_certs:'businessCerts',purchase_docs:'purchaseDocs',defect_returns:'defectReturns',supplier_ledger:'supplierLedger',statement_recon_logs:'statementReconLogs',order_audit_log:'orderAuditLog',order_packing:'orderPacking',manual_paid_orders:'manualPaidOrders',external_order_items:'externalOrderItems',app_settings:'appSettings'};
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[],blockedWrites=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.url().includes('/api/movis/')) console.log('BRIDGE',new URL(r.url()).pathname,r.status());});
page.on('requestfailed',r=>console.log('REQUEST_FAILED',new URL(r.url()).pathname,r.failure()?.errorText));
await page.routeWebSocket(/supabase/,socket=>socket.close());
await page.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url());
 if(u.hostname==='127.0.0.1'&&u.port==='43127')return route.continue();
 if(u.hostname.endsWith('.supabase.co')){
  if(req.method()!=='GET'&&req.method()!=='HEAD'){blockedWrites.push(req.method()+' '+u.pathname);return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'실제 업무 저장 차단'})});}
  const table=u.pathname.split('/').at(-1);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data[map[table]]||[])});
 }
 return route.abort();
});
await page.goto('http://127.0.0.1:43127/pos-calculator-web/');
await page.getByText('MOVIS',{exact:true}).first().click({timeout:30000});
const input=page.getByRole('textbox',{name:'무비스에게 요청'});
await input.waitFor({timeout:30000});
await page.getByText('연결됨',{exact:true}).first().waitFor({timeout:30000});
await page.waitForTimeout(3000);
await input.fill('TEST-ORDER-101 주문 연락처는 010-0000-3333, 배송지는 테스트시 테스트로 3으로 바꿔줘. 고객 기본정보는 바꾸지 말고 확인창만 준비해줘.');
await page.waitForTimeout(3000);
await page.screenshot({path:'tests/.artifacts/live-ui-before.png',fullPage:true});
console.log('INPUT',await input.inputValue());
await page.getByRole('button',{name:'전송',exact:true}).click();
await page.getByRole('heading',{name:'주문 연락처·배송지 수정 확인',exact:true}).waitFor({timeout:180000});
await page.screenshot({path:'tests/.artifacts/live-order-confirm.png',fullPage:true});
const preview=await page.locator('body').innerText();
if(!preview.includes('010-0000-3333')||!preview.includes('테스트시 테스트로 3'))throw Error('확인창에 요청한 연락처/주소 누락');
const cancel=page.getByRole('button',{name:/취소/}).last();
await cancel.click();
await page.getByRole('heading',{name:'주문 연락처·배송지 수정 확인',exact:true}).waitFor({state:'hidden'});
const result={confirmationVisible:true,requestedFieldsVisible:true,cancelledWithoutSaving:true,blockedWrites,errors};
writeFileSync('tests/.artifacts/live-ui-result.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
await browser.close();
if(blockedWrites.length||errors.length)process.exitCode=1;
