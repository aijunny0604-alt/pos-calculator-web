import { supabaseClient } from '@/lib/supabase';
import { mobileKeys, sealMobile, openMobile, newMobileRequestId } from '@/lib/storeMobileCrypto.mjs';

const storageKey='move-store-mobile-session-v1';
let connection=null;
export const mobileCode=()=>{try{return sessionStorage.getItem(storageKey)||'';}catch{return '';}};
export function forgetMobile(){try{sessionStorage.removeItem(storageKey);}catch{} if(connection){supabaseClient.removeChannel(connection.channel);connection=null;}}
async function connect(code){
 if(connection?.code===code && connection.ready)return connection;
 if(connection){await supabaseClient.removeChannel(connection.channel);connection=null;}
 const keys=await mobileKeys(code), channel=supabaseClient.channel(keys.topic,{config:{broadcast:{ack:true}}}), pending=new Map(),state={code,keys,channel,pending,ready:false};
 channel.on('broadcast',{event:'response'},async({payload})=>{try{const result=await openMobile(keys.key,'response',payload),waiting=pending.get(result.id);if(waiting){pending.delete(result.id);clearTimeout(waiting.timer);waiting.resolve(result);}}catch{/* 다른 키 또는 변조 메시지 무시 */}});
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('휴대폰 중계 연결 시간이 초과됐습니다.')),12000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){state.ready=true;clearTimeout(timer);resolve();}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){state.ready=false;clearTimeout(timer);reject(new Error('휴대폰 중계에 연결하지 못했습니다.'));}});});}
 catch(error){await supabaseClient.removeChannel(channel);throw error;}
 connection=state;return connection;
}
export async function mobileRequest(path,{data,params}={},code=mobileCode()){
 if(!code)throw new Error('매장 PC에서 연결 코드를 만든 후 휴대폰에 입력해주세요.');
 const current=await connect(code),id=newMobileRequestId();
 const payload=await sealMobile(current.keys.key,'request',{id,sentAt:Date.now(),path,data,params});
 const response=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{current.pending.delete(id);reject(new Error(path.endsWith('/confirm')?'요청 결과를 확인하지 못했습니다. 다시 전송하지 말고 현재 상태를 조회해주세요.':'매장 PC 응답이 없습니다. PC 연결 상태와 연결 코드를 확인해주세요.'));},path==='ping'?10000:70000);current.pending.set(id,{resolve,reject,timer});});
 let sent;try{sent=await current.channel.send({type:'broadcast',event:'request',payload});}catch{sent='error';}
 if(sent!=='ok'){const waiting=current.pending.get(id);if(waiting){clearTimeout(waiting.timer);current.pending.delete(id);}throw new Error(path.endsWith('/confirm')?'전송 결과를 확인하지 못했습니다. 다시 전송하지 말고 네이버 현재 상태를 확인해주세요.':'매장 PC에 요청을 전달하지 못했습니다.');}
 const result=await response;
 if(!result.ok)throw new Error(result.body?.error||'매장 PC 요청을 처리하지 못했습니다.');
 return path==='ping'?result:result.body;
}
export async function pairMobile(code){
 const normalized=String(code||'').replace(/[\s-]/g,'').toLowerCase();await mobileKeys(normalized);
 await mobileRequest('ping',{},normalized);
 try{sessionStorage.setItem(storageKey,normalized);}catch{forgetMobile();throw new Error('이 브라우저에 연결 상태를 저장하지 못했습니다.');}
}
