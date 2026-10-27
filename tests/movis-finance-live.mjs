// 가상 부가세 응답만 사용하는 수동 GPT 도구 연결 확인.
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)}};
globalThis.localStorage=memory();globalThis.sessionStorage=memory();localStorage.setItem('movis_model_v2','gpt-6.1-sol');
const original=globalThis.fetch;
globalThis.fetch=async (input,options)=>{
  const url=String(input);
  if(url.startsWith('http://127.0.0.1:43128/session'))return new Response(JSON.stringify({token:'sample'}),{status:200});
  if(url.startsWith('http://127.0.0.1:43128/vat-case'))return new Response(JSON.stringify({elements:[{productName:'가상 샘플',totalSalesAmount:110000,taxationSalesAmount:110000,taxExemptionSalesAmount:0}],page:1,last:true,totalElements:1}),{status:200});
  return original(input,options);
};
mkdirSync('tests/.artifacts',{recursive:true});
await build({entryPoints:['src/lib/codexAnalyst.js'],bundle:true,platform:'node',format:'esm',outfile:'tests/.artifacts/finance-engine.mjs',logLevel:'silent'});
const {askCodex}=await import('./.artifacts/finance-engine.mjs');
const r=await askCodex('네이버 스토어의 2026년 9월 부가세 매출 자료를 조회하고 과세 매출을 알려줘. 납부 세액으로 단정하지 마.',{dataState:{}},{onProgress:c=>console.log('도구:',c.name),signal:AbortSignal.timeout(180000)});
console.log('모델:',r.model);console.log('답변:',r.answer);
if(!r.toolCalls.some(c=>c.name==='getStoreFinanceDetails'&&c.result?.ok&&c.result.data.items[0]?.taxationSalesAmount===110000)||r.toolCalls.some(c=>c.result?.data?.__pending))throw Error('부가세 조회 도구 연결 실패');
console.log('가상 부가세 도구 검증 통과');
