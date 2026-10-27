// 실시간 중계와 가짜 네이버 API를 조합한다. 실제 상품 데이터는 바꾸지 않는다.
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {mobileKeys,sealMobile,openMobile} from '../src/lib/storeMobileCrypto.mjs';
const source=await readFile(new URL('../src/lib/supabase.js',import.meta.url),'utf8');
const url=source.match(/SUPABASE_URL = '([^']+)'/)[1],key=source.match(/SUPABASE_ANON_KEY = '([^']+)'/)[1];
const child=spawn(process.execPath,['--import','./tests/store-product-mock-fetch.mjs','bridge/store-care.mjs'],{env:{...process.env,MOVIS_CARE_PORT:'43131',NAVER_CLIENT_ID:'sample',NAVER_CLIENT_SECRET:'$2a$10$abcdefghijklmnopqrstuu'},stdio:'ignore',windowsHide:true});
let client,room;
try {
 const base='http://127.0.0.1:43131',headers={Origin:'https://aijunny0604-alt.github.io'};
 let session;for(let i=0;i<40;i++){try{session=await fetch(`${base}/session`,{headers});break;}catch{await new Promise(r=>setTimeout(r,100));}}
 if(!session?.ok)throw new Error('샘플 브리지 시작 실패');
 headers.Authorization=`Bearer ${(await session.json()).token}`;headers['Content-Type']='application/json';
 const pair=await fetch(`${base}/mobile-pair/start`,{method:'POST',headers,body:'{}'});
 if(!pair.ok)throw new Error('샘플 연결 코드 생성 실패');
 const {code}=await pair.json(),keys=await mobileKeys(code);
 client=createClient(url,key);room=client.channel(keys.topic,{config:{broadcast:{ack:true}}});
 const waits=new Map();room.on('broadcast',{event:'response'},async({payload})=>{try{const result=await openMobile(keys.key,'response',payload);waits.get(result.id)?.(result);}catch{}});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('샘플 구독 시간 초과')),10000);room.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}else if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)){clearTimeout(timer);reject(new Error(status));}});});
 async function request(path,extra={}){
  const id=crypto.randomUUID(),message={id,sentAt:Date.now(),path,...extra};
  const result=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waits.delete(id);reject(new Error('샘플 응답 시간 초과'));},15000);waits.set(id,value=>{clearTimeout(timer);waits.delete(id);resolve(value);});});
  const payload=await sealMobile(keys.key,'request',message);
  if(await room.send({type:'broadcast',event:'request',payload})!=='ok')throw new Error('샘플 전송 실패');
  const response=await result;if(!response.ok)throw new Error(response.body?.error||'샘플 요청 실패');return response.body;
 }
 await request('ping');
 const snapshot=await request('product-snapshot',{params:{channel:'10',origin:'20'}});
 const change={channel:'10',origin:'20',fingerprint:JSON.stringify(snapshot),change:{kind:'option',optionId:'30',optionType:'combination',stock:5}};
 const preview=await request('product-change/prepare',{data:change});
 const result=await request('product-change/confirm',{data:{preview:preview.preview}});
 if(result.snapshot.options[0].stock!==5)throw new Error('샘플 변경 확인 실패');
 console.log('실제 실시간 중계 + 가짜 네이버: 연결, 조회, 확인, 변경, 재조회 통과');
}finally{if(room&&client){await client.removeChannel(room);client.realtime.disconnect();}child.kill();}
