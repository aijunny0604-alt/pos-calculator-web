// 코드와 요청 내용은 중계 서버에 전달하지 않는다. 암호문만 실시간 전달한다.
const encoder=new TextEncoder(), decoder=new TextDecoder();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const unhex=value=>{if(!/^(?:[0-9a-f]{2})+$/i.test(value))throw new Error('암호문 형식 오류');return Uint8Array.from(value.match(/../g),x=>parseInt(x,16));};
const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
export function newMobileRequestId(){
 const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const value=hex(bytes);
 return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}
export async function mobileKeys(code){
 code=String(code||'').replace(/[\s-]/g,'').toLowerCase();
 if(!/^[0-9a-f]{32}$/.test(code))throw new Error('연결 코드 32자리를 확인해주세요.');
 const topic=hex(await digest(`movis-store-topic-v1:${code}`));
 const raw=await digest(`movis-store-key-v1:${code}`);
 const key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);
 return {topic:`movis-store-${topic}`,key};
}
export async function sealMobile(key,direction,value){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(`movis-store-v1:${direction}`)},key,encoder.encode(JSON.stringify(value)));
 return {iv:hex(iv),ciphertext:hex(new Uint8Array(encrypted))};
}
export async function openMobile(key,direction,payload){
 if(!payload||typeof payload.iv!=='string'||typeof payload.ciphertext!=='string'||payload.iv.length!==24||payload.ciphertext.length>240000)throw new Error('암호문 형식 오류');
 const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:unhex(payload.iv),additionalData:encoder.encode(`movis-store-v1:${direction}`)},key,unhex(payload.ciphertext));
 return JSON.parse(decoder.decode(bytes));
}
