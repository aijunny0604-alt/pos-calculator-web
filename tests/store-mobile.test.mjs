import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileKeys,sealMobile,openMobile,newMobileRequestId} from '../src/lib/storeMobileCrypto.mjs';
import {createMobileRelay} from '../bridge/store-mobile.mjs';

test('연결 코드는 암호화 키이며 변조·다른 방향·잘못된 코드를 거부한다',async()=>{
 const a=await mobileKeys('0123456789abcdef0123456789abcdef'),b=await mobileKeys('1123456789abcdef0123456789abcdef');
 const encrypted=await sealMobile(a.key,'request',{value:'재고'});
 assert.deepEqual(await openMobile(a.key,'request',encrypted),{value:'재고'});
 await assert.rejects(openMobile(b.key,'request',encrypted));
 await assert.rejects(openMobile(a.key,'response',encrypted));
 await assert.rejects(openMobile(a.key,'request',{...encrypted,ciphertext:encrypted.ciphertext.slice(0,-2)+'00'}));
 await assert.rejects(mobileKeys('1234'));
 assert.match(newMobileRequestId(),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('중계는 인증된 현재 요청만 허용하며 동일 요청을 재실행하지 않는다',async()=>{
 let handler,topic,received=[],calls=0;
 const room={on(_type,_filter,cb){handler=cb;return this;},subscribe(cb){cb('SUBSCRIBED');return this;},async send(message){received.push(message);return 'ok';}};
 const fakeClient={channel(t){topic=t;return room;},async removeChannel(){},realtime:{disconnect(){}}};
 const relay=createMobileRelay({port:43128,session:'fake',url:'https://example.invalid',anonKey:'fake',clientFactory:()=>fakeClient});
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{calls++;assert.match(String(url),/^http:\/\/127\.0\.0\.1:43128\/product-change\/confirm$/);assert.equal(opts.method,'POST');return Response.json({snapshot:{ok:true}});};
 try{
  const {code}=await relay.start(),keys=await mobileKeys(code);assert.ok(!topic.includes(code));
  const request={id:crypto.randomUUID(),sentAt:Date.now(),path:'product-change/confirm',data:{preview:'sample'}};
  const encrypted=await sealMobile(keys.key,'request',request);
  await handler({payload:encrypted});assert.equal(calls,1);assert.equal(received.length,1);
  assert.deepEqual(await openMobile(keys.key,'response',received[0].payload),{id:request.id,ok:true,status:200,body:{snapshot:{ok:true}}});
  await handler({payload:encrypted});assert.equal(calls,1);
  await handler({payload:await sealMobile(keys.key,'request',{...request,id:crypto.randomUUID(),sentAt:Date.now()-50000})});assert.equal(calls,1);
  await handler({payload:await sealMobile(keys.key,'request',{...request,id:crypto.randomUUID(),path:'unsupported'})});assert.equal(calls,1);
  await relay.stop();await handler({payload:await sealMobile(keys.key,'request',{...request,id:crypto.randomUUID()})});assert.equal(calls,1);
 }finally{globalThis.fetch=originalFetch;await relay.stop();}
});
