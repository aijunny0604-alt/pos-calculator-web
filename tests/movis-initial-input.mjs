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

const observations=[];
for(let run=0;run<3;run++){
 await page.goto('http://127.0.0.1:43127/pos-calculator-web/');
 await page.getByText('MOVIS',{exact:true}).first().click({timeout:30000});
 const input=page.getByRole('textbox',{name:'무비스에게 요청'});
 await input.waitFor({timeout:30000});
 await page.getByRole('region',{name:'무비스 시작 화면'}).waitFor({state:'hidden'});
 await input.fill('초기입력검증 '+run);
 const before=await input.inputValue();
 await page.waitForTimeout(4000);
 const after=await input.inputValue();
 const disabled=await page.getByRole('button',{name:'전송',exact:true}).isDisabled();
 observations.push({run,before,after,disabled,preserved:after==='초기입력검증 '+run});
 console.log('OBSERVATION',JSON.stringify(observations.at(-1)));
}
writeFileSync('tests/.artifacts/initial-input-results.json',JSON.stringify({observations,errors},null,2));
await browser.close();
