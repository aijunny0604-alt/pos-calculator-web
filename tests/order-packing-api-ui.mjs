import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({headless:true});
try {
 for (const scenario of ['normal','failure','delayed','missing-before','quantity','replacement']) {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5191/pos-calculator-web/design-preview.html?historyCheck=1');
  const result = await page.evaluate(async scenario => {
   const {supabase} = await import('/pos-calculator-web/src/lib/supabase.js');
   const original = window.fetch;
   const events=[]; const log=[];
   const item={id:1,name:'기존 상품',quantity:1,price:100};
   let stored={id:'PACK-1',items:[item]};
   let packing={order_id:'PACK-1',checked:[0],item_count:1,done:true};
   window.addEventListener('order-packing-changed',e=>events.push(e.detail));
   window.fetch=async (input,options={}) => {
    const url=new URL(typeof input==='string'?input:input.url,location.href), method=(options.method||'GET').toUpperCase();
    if (!url.hostname.includes('supabase.co')) return original(input,options);
    const table=url.pathname.split('/').at(-1);
    const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
    if(table==='order_packing' && method==='GET') {log.push('get-packing');return json([packing]);}
    if(table==='order_packing' && method==='POST') {
     const body=JSON.parse(options.body); log.push(body.done?'write-done':'write-reset');
     if(scenario==='delayed' && body.done) await new Promise(resolve=>setTimeout(resolve,120));
     if(scenario==='failure') return json({message:'network failure'},503);
     packing=body; return new Response(null,{status:204});
    }
    if(table==='orders' && method==='GET') {log.push('get-order');return scenario==='missing-before'?json({},503):json([stored]);}
    if(table==='orders' && method==='PATCH') {log.push('patch-order');stored={...stored,...JSON.parse(options.body)};return json([stored]);}
    return json([]);
   };
   if(scenario==='normal') {
    const result=await supabase.updateOrder('PACK-1',{items:[{...item,price:90}]});
    const priceLog=[...log];log.length=0;
    const changed=await supabase.updateOrder('PACK-1',{items:[item,{id:2,name:'추가',quantity:1,price:200}]});
    window.fetch=original;
    return {result:!!result,changed:!!changed,priceLog,log,packing,events};
   }
   const pending=scenario==='delayed'?supabase.setOrderPacking('PACK-1',{checked:[0],itemCount:1,done:true}):null;
   const nextItems=scenario==='quantity'?[{...item,quantity:2}]:scenario==='replacement'?[{...item,id:2,name:'교체 상품'}]:[item,{id:2,name:'추가',quantity:1,price:200}];
   const result=await supabase.updateOrder('PACK-1',{items:nextItems});
   if(pending) await pending;
   window.fetch=original;
   return {result:!!result,log,packing,events};
  },scenario);
  if (scenario==='normal') {
   assert.equal(result.result,true); assert.equal(result.changed,true);
   assert.equal(result.priceLog.includes('write-reset'),false);
   assert.ok(result.log.indexOf('write-reset') < result.log.indexOf('patch-order'));
   assert.equal(result.packing.done,false); assert.equal(result.packing.item_count,2); assert.deepEqual(result.packing.checked,[]);
   assert.equal(result.events.at(-1).done,false);
  } else if(scenario==='failure') {
   assert.equal(result.result,false); assert.equal(result.log.includes('patch-order'),false); assert.equal(result.events.length,0);
  } else {
   assert.equal(result.result,true); assert.equal(result.packing.done,false);
   assert.ok(result.log.indexOf('write-reset') < result.log.indexOf('patch-order'));
   if(scenario==='delayed') assert.ok(result.log.indexOf('write-done') < result.log.indexOf('write-reset'));
  }
  console.log(`${scenario}: ${JSON.stringify(result.log)}`);
  await page.close();
 }
} finally {await browser.close();}
