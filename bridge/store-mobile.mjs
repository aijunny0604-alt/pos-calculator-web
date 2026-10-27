import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { mobileKeys, sealMobile, openMobile } from '../src/lib/storeMobileCrypto.mjs';

// 브리지가 다시 시작되거나 연결을 해제하면 키와 사용된 요청 기록은 모두 폐기된다.
export function createMobileRelay({port, session, url, anonKey, clientFactory=createClient}) {
 let channel,client,activeCode=null,generation=0;
 const seen=new Map();
 async function stop(){generation++;activeCode=null;seen.clear();const oldChannel=channel,oldClient=client;channel=null;client=null;if(oldChannel&&oldClient){await oldClient.removeChannel(oldChannel);oldClient.realtime.disconnect();}}
 async function start(){
  await stop();const myGeneration=++generation,code=randomBytes(16).toString('hex'),keys=await mobileKeys(code);
  const instance=clientFactory(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}}),room=instance.channel(keys.topic,{config:{broadcast:{ack:true}}});
  client=instance;channel=room;
  room.on('broadcast',{event:'request'},async({payload})=>{
   try {
    const message=await openMobile(keys.key,'request',payload);
    if(myGeneration!==generation||!message||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(message.id||'')||!Number.isFinite(message.sentAt)||Math.abs(Date.now()-message.sentAt)>45000)return;
    for(const [id,time] of seen)if(Date.now()-time>120000)seen.delete(id);
    if(seen.has(message.id)||seen.size>=500)return;
    seen.set(message.id,Date.now());
    let result;
    if(message.path==='ping')result={ok:true};
    else if(['product-snapshot','product-change/prepare','product-change/confirm'].includes(message.path)){
     if(message.path==='product-snapshot' && (!message.params||!/^\d{1,15}$/.test(String(message.params.channel||''))||!/^\d{1,15}$/.test(String(message.params.origin||''))))return;
     const query=message.path==='product-snapshot'?`?${new URLSearchParams({channel:message.params.channel,origin:message.params.origin})}`:'';
     const response=await fetch(`http://127.0.0.1:${port}/${message.path}${query}`,{method:message.path==='product-snapshot'?'GET':'POST',headers:{Origin:'http://127.0.0.1:5186',Authorization:`Bearer ${session}`,'Content-Type':'application/json'},body:message.path==='product-snapshot'?undefined:JSON.stringify(message.data),signal:AbortSignal.timeout(60000)});
     let body;try{body=await response.json();}catch{body={error:'연결 프로그램 응답을 확인하지 못했습니다.'};}
     result={ok:response.ok,status:response.status,body};
    }else return;
    if(myGeneration!==generation)return;
    const encrypted=await sealMobile(keys.key,'response',{id:message.id,...result});
    await room.send({type:'broadcast',event:'response',payload:encrypted});
   }catch{/* 인증 실패와 알 수 없는 요청은 무시한다. */}
  });
  try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('실시간 중계 연결 시간이 초과됐습니다.')),12000);room.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){clearTimeout(timer);reject(new Error('실시간 중계에 연결하지 못했습니다.'));}});});}
  catch(error){if(myGeneration===generation)await stop();throw error;}
  if(myGeneration!==generation)throw new Error('연결이 취소됐습니다.');
  activeCode=code;return {code};
 }
 return {start,stop,isActive:()=>!!activeCode};
}
