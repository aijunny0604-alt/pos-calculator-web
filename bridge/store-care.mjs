// 매장 PC 전용 읽기 연결. 주문 동기화 프로세스와 독립적으로 실행한다.
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {financeQuery, financeResult} from './store-finance.mjs';
import {productSnapshot, prepareProductChange, productFingerprint} from './store-product.mjs';
import {createMobileRelay} from './store-mobile.mjs';
const source=process.env.NAVER_SYNC_DIR||path.join(os.homedir(),'naver-sync-bridge');
const require=createRequire(path.join(source,'package.json'));
require('dotenv').config({path:path.join(source,'.env'),quiet:true});
const bcrypt=require('bcryptjs');
const session=randomBytes(32).toString('hex');
const port=Number(process.env.MOVIS_CARE_PORT||43128);
const mobile=createMobileRelay({port,session,url:'https://jubzppndcclhnvgbvrxr.supabase.co',anonKey:'sb_publishable_td4p48nPHKjXByMngvyjZQ_AJttp5KU'});
const origins=new Set(['https://aijunny0604-alt.github.io','http://127.0.0.1:5186','http://127.0.0.1:43127']);
let token=null,expires=0;
const previews=new Map(), changing=new Set();
async function bodyJSON(req){let data='';for await(const chunk of req){data+=chunk;if(data.length>8192)throw new Error('요청이 너무 큽니다.');}return JSON.parse(data);}
async function readProduct(channel,origin){
 if(!/^\d{1,15}$/.test(String(channel||''))||!/^\d{1,15}$/.test(String(origin||'')))throw new Error('상품 번호를 확인해주세요.');
 const listing=await fetch('https://api.commerce.naver.com/external/v1/products/search',{method:'POST',headers:{Authorization:`Bearer ${await accessToken()}`,'Content-Type':'application/json'},body:JSON.stringify({searchKeywordType:'CHANNEL_PRODUCT_NO',channelProductNos:[Number(channel)],productStatusTypes:['WAIT','SALE','OUTOFSTOCK','SUSPENSION','CLOSE','UNADMISSION','REJECTION','PROHIBITION'],page:1,size:50}),signal:AbortSignal.timeout(20000),redirect:'error'});
 if(!listing.ok)throw new Error(`네이버 상품 번호 확인 실패 (${listing.status}).`);
 const results=await listing.json(),matches=[];
 for(const row of results.contents||[])for(const item of row.channelProducts||[])if(String(item.channelProductNo)===String(channel))matches.push(String(row.originProductNo??item.originProductNo??''));
 if(matches.length!==1||matches[0]!==String(origin))throw new Error(matches.length===1?'원상품 번호가 현재 네이버 자료와 다릅니다. 상품 동기화 후 다시 시도해주세요.':`네이버 원상품 연결을 확인할 수 없습니다 (일치 ${matches.length}건). 상품 동기화 후 다시 시도해주세요.`);
 const response=await fetch(`https://api.commerce.naver.com/external/v2/products/channel-products/${channel}`,{headers:{Authorization:`Bearer ${await accessToken()}`},signal:AbortSignal.timeout(20000),redirect:'error'});
 if(!response.ok)throw new Error(`네이버 상품 조회 실패 (${response.status}). 권한과 상품 번호를 확인해주세요.`);
 return productSnapshot(await response.json(),origin,matches[0]);
}
async function accessToken(){
 if(token&&Date.now()<expires)return token;
 const id=process.env.NAVER_CLIENT_ID,secret=process.env.NAVER_CLIENT_SECRET;
 if(!id||!secret)throw new Error('매장 네이버 연결 설정이 없습니다.');
 const timestamp=Date.now();
 const sign=Buffer.from(bcrypt.hashSync(`${id}_${timestamp}`,secret)).toString('base64');
 const response=await fetch('https://api.commerce.naver.com/external/v1/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:id,timestamp:String(timestamp),grant_type:'client_credentials',client_secret_sign:sign,type:'SELF'}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`네이버 인증 실패 (${response.status})`);
 const result=await response.json();token=result.access_token;expires=Date.now()+Math.max(0,Number(result.expires_in)-300)*1000;return token;
}
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(!origins.has(origin)||req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);return res.end();}
 res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Cache-Control','no-store');
 res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Private-Network','true');
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
 const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
 const url=new URL(req.url,`http://127.0.0.1:${port}`);
 if(url.pathname==='/session' && req.method==='GET')return send(200,{token:session});
 if(req.headers.authorization!==`Bearer ${session}`)return send(401,{error:'연결을 새로고침해주세요.'});
 if(url.pathname==='/mobile-pair/start' && req.method==='POST'){
  try{return send(200,await mobile.start());}catch(error){return send(503,{error:error.message||'휴대폰 연결을 시작하지 못했습니다.'});}
 }
 if(url.pathname==='/mobile-pair/stop' && req.method==='POST'){
  try{await mobile.stop();return send(200,{ok:true});}catch{return send(503,{error:'연결을 종료하지 못했습니다.'});}
 }
 if(url.pathname==='/product-snapshot' && req.method==='GET'){
  try{return send(200,await readProduct(url.searchParams.get('channel'),url.searchParams.get('origin')));}catch(error){return send(400,{error:error.message});}
 }
 if(url.pathname==='/product-change/prepare' && req.method==='POST'){
  try{
   const input=await bodyJSON(req),current=await readProduct(input.channel,input.origin);
   if(productFingerprint(current)!==input.fingerprint)return send(409,{error:'상품 정보가 변경됐습니다. 다시 조회하고 확인해주세요.'});
   const change=prepareProductChange(current,input.change),key=randomBytes(32).toString('hex');
   for(const [id,entry] of previews)if(entry.expiry<Date.now())previews.delete(id);
   if(previews.size>=100)return send(429,{error:'변경 확인이 너무 많습니다. 잠시 후 다시 시도해주세요.'});
   previews.set(key,{channel:String(input.channel),origin:String(input.origin),fingerprint:productFingerprint(current),change,expiry:Date.now()+60000});
   return send(200,{preview:key,description:change.description,expiresIn:60});
  }catch(error){return send(400,{error:error.message||'변경 내용을 확인할 수 없습니다.'});}
 }
 if(url.pathname==='/product-change/confirm' && req.method==='POST'){
  let entry,locked=false;
  try{
   const input=await bodyJSON(req);entry=previews.get(input.preview);previews.delete(input.preview);
   if(!entry||entry.expiry<Date.now())return send(409,{error:'확인 시간이 지났거나 이미 사용된 요청입니다. 다시 확인해주세요.'});
   if(changing.has(entry.origin))return send(409,{error:'같은 상품을 변경 중입니다. 잠시 후 다시 조회해주세요.'});
   changing.add(entry.origin);locked=true;
   const current=await readProduct(entry.channel,entry.origin);
   if(productFingerprint(current)!==entry.fingerprint)return send(409,{error:'확인 후 상품 정보가 바뀌어 변경을 중단했습니다. 다시 조회해주세요.'});
   let response;
   try{response=await fetch(`https://api.commerce.naver.com/external/v1/products/origin-products/${entry.origin}/${entry.change.path}`,{method:'PUT',headers:{Authorization:`Bearer ${await accessToken()}`,'Content-Type':'application/json'},body:JSON.stringify(entry.change.body),signal:AbortSignal.timeout(20000),redirect:'error'});}catch{return send(502,{error:'변경 요청의 결과를 확인하지 못했습니다. 다시 전송하지 말고 네이버 현재 상태를 확인해주세요.',unknown:true});}
   if(!response.ok)return send(response.status,{error:response.status>=500?'네이버 응답 오류로 변경 결과를 확인하지 못했습니다. 다시 전송하지 말고 현재 상태를 확인해주세요.':`네이버가 변경을 승인하지 않았습니다 (${response.status}). 현재 상태를 다시 확인해주세요.`,unknown:response.status>=500});
   try{
    const result=await readProduct(entry.channel,entry.origin);
    const body=entry.change.body;let matches;
    if(entry.change.path==='change-status')matches=result.status===body.statusType;
    else {const [kind,items]=Object.entries(body.optionInfo).find(([,v])=>Array.isArray(v));const expected=items[0];const actual=result.options.find(o=>o.id===String(expected.id)&&o.type===(kind==='optionCombinations'?'combination':'standard'));matches=actual&&actual.stock===expected.stockQuantity&&actual.usable===expected.usable&&(kind!=='optionCombinations'||actual.price===expected.price);}
    if(!matches)return send(502,{error:'변경 후 네이버 상태가 요청과 다릅니다. 관리자에서 확인해주세요.',unknown:true});
    return send(200,{snapshot:result});
   }catch{return send(502,{error:'변경 후 네이버 상태를 확인하지 못했습니다. 다시 전송하지 말고 현재 상태를 확인해주세요.',unknown:true});}
  }catch(error){return send(400,{error:error.message||'변경을 처리할 수 없습니다.'});}finally{if(locked)changing.delete(entry.origin);}
 }
 if(req.method!=='GET')return send(405,{error:'지원하지 않는 요청입니다.'});
 if(!['/qnas','/settlements','/settlement-case','/commission-details','/vat-case'].includes(url.pathname))return send(404,{error:'지원하지 않는 경로입니다.'});
 try{
  if(['/settlement-case','/commission-details','/vat-case'].includes(url.pathname)){
   const type=url.pathname.slice(1);let request;
   try { request=financeQuery(type,Object.fromEntries(url.searchParams)); } catch(error) { return send(400,{error:error.message}); }
   const response=await fetch(request.url,{headers:{Authorization:`Bearer ${await accessToken()}`},signal:AbortSignal.timeout(20000)});
   if(response.status===401){token=null;return send(401,{error:'네이버 인증이 만료됐습니다. 다시 조회해주세요.'});}
   if(!response.ok)return send(response.status,{error:response.status===403?'네이버 정산·부가세 API 권한 또는 등록 IP를 확인해주세요.':`네이버 조회 실패 (${response.status})`});
   const data=await response.json();
   try { return send(200,financeResult(type,data,request.page)); } catch { return send(502,{error:'네이버 정산·부가세 응답 형식을 확인할 수 없습니다.'}); }
  }
  if(url.pathname==='/settlements'){
   const start=url.searchParams.get('start')||'',end=url.searchParams.get('end')||'',page=Number(url.searchParams.get('page')||1);
   const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
   if(!validDate(start)||!validDate(end)||start>end||Date.parse(end)-Date.parse(start)>93*86400000||!Number.isInteger(page)||page<1||page>1000)return send(400,{error:'정산 날짜와 페이지를 확인해주세요. 조회 기간은 최대 94일입니다.'});
   const params=new URLSearchParams({startDate:start,endDate:end,pageNumber:String(page),pageSize:'50'});
   const response=await fetch(`https://api.commerce.naver.com/external/v1/pay-settle/settle/daily?${params}`,{headers:{Authorization:`Bearer ${await accessToken()}`},signal:AbortSignal.timeout(20000)});
   if(response.status===401){token=null;return send(401,{error:'네이버 인증이 만료됐습니다. 다시 조회해주세요.'});}
   if(!response.ok)return send(response.status,{error:response.status===403?'네이버 정산 API 권한 또는 등록 IP를 확인해주세요.':`네이버 정산 조회 실패 (${response.status})`});
   const data=await response.json();
   if(!Array.isArray(data.elements))return send(502,{error:'정산 응답 형식을 확인할 수 없습니다.'});
   const fields=['settleBasisStartDate','settleBasisEndDate','settleExpectDate','settleCompleteDate','settleAmount','paySettleAmount','commissionSettleAmount','benefitSettleAmount','deductionRestoreSettleAmount','payHoldbackAmount','minusChargeAmount','differenceSettleAmount','returnCareSettleAmount','normalSettleAmount','quickSettleAmount'];
   const elements=data.elements.map(row=>Object.fromEntries(fields.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]])));
   return send(200,{elements,page,last:elements.length<50,fetchedAt:new Date().toISOString()});
  }
  const days=Number(url.searchParams.get('days')||30),page=Number(url.searchParams.get('page')||1);
  if(!Number.isInteger(days)||days<1||days>90||!Number.isInteger(page)||page<1||page>1000)return send(400,{error:'조회 범위를 확인해주세요.'});
  const now=new Date(),params=new URLSearchParams({fromDate:new Date(now.getTime()-days*86400000).toISOString(),toDate:now.toISOString(),page:String(page),size:'50'});
  const answered=url.searchParams.get('answered');if(answered==='true'||answered==='false')params.set('answered',answered);
  const response=await fetch(`https://api.commerce.naver.com/external/v1/contents/qnas?${params}`,{headers:{Authorization:`Bearer ${await accessToken()}`},signal:AbortSignal.timeout(20000)});
  if(response.status===401){token=null;return send(401,{error:'네이버 인증이 만료됐습니다. 다시 조회해주세요.'});}
  if(!response.ok)return send(response.status,{error:response.status===403?'네이버 문의 API 권한 또는 등록 IP를 확인해주세요.':`네이버 조회 실패 (${response.status})`});
  const data=await response.json();
  if(!Array.isArray(data.contents))return send(502,{error:'문의 응답 형식을 확인할 수 없습니다.'});
  return send(200,{...data,fetchedAt:new Date().toISOString()});
 }catch{return send(503,{error:'네이버 연결에 실패했습니다. 매장 연결 설정과 네트워크를 확인해주세요.'});}
});
server.listen(port,'127.0.0.1',()=>console.log(`스토어 문의 읽기 연결: 127.0.0.1:${port}`));
