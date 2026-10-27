// 매장 PC 전용 읽기 연결. 주문 동기화 프로세스와 독립적으로 실행한다.
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {financeQuery, financeResult} from './store-finance.mjs';
const source=process.env.NAVER_SYNC_DIR||path.join(os.homedir(),'naver-sync-bridge');
const require=createRequire(path.join(source,'package.json'));
require('dotenv').config({path:path.join(source,'.env'),quiet:true});
const bcrypt=require('bcryptjs');
const session=randomBytes(32).toString('hex');
const port=Number(process.env.MOVIS_CARE_PORT||43128);
const origins=new Set(['https://aijunny0604-alt.github.io','http://127.0.0.1:5186','http://127.0.0.1:43127']);
let token=null,expires=0;
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
 res.setHeader('Access-Control-Allow-Headers','Authorization');res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');res.setHeader('Access-Control-Allow-Private-Network','true');
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
 const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
 if(req.method!=='GET')return send(405,{error:'조회만 지원합니다.'});
 const url=new URL(req.url,`http://127.0.0.1:${port}`);
 if(url.pathname==='/session')return send(200,{token:session});
 if(req.headers.authorization!==`Bearer ${session}`)return send(401,{error:'연결을 새로고침해주세요.'});
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
