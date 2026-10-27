import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const text=await readFile(new URL('../src/lib/supabase.js',import.meta.url),'utf8');
const url=text.match(/SUPABASE_URL = '([^']+)'/)[1],key=text.match(/SUPABASE_ANON_KEY = '([^']+)'/)[1];
const a=createClient(url,key),b=createClient(url,key),topic=`store-test-${randomUUID()}`;
const ca=a.channel(topic,{config:{broadcast:{ack:true}}}),cb=b.channel(topic,{config:{broadcast:{ack:true}}});
const subscribe=ch=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('구독 시간 초과')),12000);ch.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timeout);resolve();}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){clearTimeout(timeout);reject(new Error(status));}});});
try {
 let received;const wait=new Promise((resolve,reject)=>{received=resolve;setTimeout(()=>reject(new Error('메시지 수신 시간 초과')),10000);});
 cb.on('broadcast',{event:'probe'},({payload})=>received(payload));
 await Promise.all([subscribe(ca),subscribe(cb)]);
 const result=await ca.send({type:'broadcast',event:'probe',payload:{message:'sample'}});
 const response=await wait;
 if(result!=='ok'||response.message!=='sample')throw new Error('중계 확인 실패');
 console.log('실시간 중계: 암호화 적용 전 가상 신호 송수신 성공');
}finally{await a.removeChannel(ca);await b.removeChannel(cb);a.realtime.disconnect();b.realtime.disconnect();}
