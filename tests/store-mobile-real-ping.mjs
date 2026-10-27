// 배포 직후에만 사용: 새 연결 코드를 만들고 폐기하며 상품은 조회·변경하지 않는다.
import {createClient} from '@supabase/supabase-js';
import {readFile} from 'node:fs/promises';
import {mobileKeys,sealMobile,openMobile,newMobileRequestId} from '../src/lib/storeMobileCrypto.mjs';
const text=await readFile(new URL('../src/lib/supabase.js',import.meta.url),'utf8');
const url=text.match(/SUPABASE_URL = '([^']+)'/)[1],key=text.match(/SUPABASE_ANON_KEY = '([^']+)'/)[1],base='http://127.0.0.1:43128';
const headers={Origin:'https://aijunny0604-alt.github.io','Content-Type':'application/json'};
const session=await fetch(`${base}/session`,{headers});if(!session.ok)throw new Error('PC 연결 인증 실패');
headers.Authorization=`Bearer ${(await session.json()).token}`;
const response=await fetch(`${base}/mobile-pair/start`,{method:'POST',headers,body:'{}'});if(!response.ok)throw new Error('PC 연결 코드 생성 실패');
let client,room;
try{
 const {code}=await response.json(),keys=await mobileKeys(code);client=createClient(url,key);room=client.channel(keys.topic,{config:{broadcast:{ack:true}}});
 const id=newMobileRequestId();let done;const receive=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('PC 연결 응답 시간 초과')),15000);done=value=>{clearTimeout(timer);resolve(value);};});
 room.on('broadcast',{event:'response'},async({payload})=>{try{const result=await openMobile(keys.key,'response',payload);if(result.id===id)done(result);}catch{}});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('휴대폰 중계 연결 시간 초과')),12000);room.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}else if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)){clearTimeout(timer);reject(new Error(status));}});});
 const payload=await sealMobile(keys.key,'request',{id,sentAt:Date.now(),path:'ping'});
 if(await room.send({type:'broadcast',event:'request',payload})!=='ok')throw new Error('PC 연결 테스트 송신 실패');
 if(!(await receive).ok)throw new Error('PC 연결 응답 실패');
 console.log('운영 매장 PC와 휴대폰 중계 암호화 연결 확인');
}finally{if(room&&client){await client.removeChannel(room);client.realtime.disconnect();}await fetch(`${base}/mobile-pair/stop`,{method:'POST',headers,body:'{}'});}
