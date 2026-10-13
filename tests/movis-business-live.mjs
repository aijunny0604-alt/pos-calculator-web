import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fixture } from './movis-fixtures.mjs';
mkdirSync('tests/.artifacts',{recursive:true});
const storage=()=>{const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
globalThis.localStorage=storage();globalThis.sessionStorage=storage();
// 실제 GPT 브리지만 허용한다. 테스트 중 POS DB·외부 서비스 쓰기는 네트워크 단계에서 차단한다.
const nativeFetch=globalThis.fetch;
globalThis.fetch=(url,opts)=>{const u=new URL(String(url));if(u.origin!=='http://127.0.0.1:43127')throw Error('테스트 외부 네트워크 차단');return nativeFetch(url,opts)};
await build({entryPoints:['src/lib/codexAnalyst.js'],bundle:true,platform:'node',format:'esm',outfile:'tests/.artifacts/scenario-engine.mjs',logLevel:'silent'});
const {askCodex,clearMovisThread}=await import('./.artifacts/scenario-engine.mjs');
const base=structuredClone(fixture);
base.orders[0]={...base.orders[0],id:'TEST-ORDER-101',orderNumber:'TEST-ORDER-101',created_at:new Date().toISOString(),createdAt:new Date().toISOString(),customer_phone:'',customer_address:'',memo:''};
base.purchaseOrders[0]={...base.purchaseOrders[0],po_number:'TEST-PO-21',supplier_name:'JSR'};
base.supplierPrices[0].supplier_name='JSR';
const pending=r=>r.toolCalls.filter(c=>c.result?.ok&&c.result?.data?.__pending).map(c=>c.result.data);
const cases=[
 {id:'stock',question:'스텐 밴딩 54-30 재고랑 JSR 미입고 몇 개야? 각각 구분해줘. 변경은 하지 마.',check:r=>pending(r).length===0&&/4/.test(r.answer)&&/10/.test(r.answer)},
 {id:'followup',follow:true,question:'그거 도매로 세 개면 얼마야? 계산만 해줘.',check:r=>pending(r).length===0&&/30,?000|3만/.test(r.answer)},
 {id:'contact',question:'검증모터스 고객 연락처는 010-0000-1111, 주소는 테스트시 테스트로 1로 바꾸고 TEST-ORDER-101 주문 배송정보에도 똑같이 넣어줘. 두 곳 모두 확인창 준비해줘.',check:r=>{const p=pending(r);return p.some(x=>x.action==='updateCustomer')&&p.some(x=>x.action==='updateOrderContact'&&x.params.phone==='010-0000-1111'&&x.params.address==='테스트시 테스트로 1')}},
 {id:'purchase',question:'JSR에 스텐 밴딩 54-30 5개 발주 등록해줘. 발주번호 TEST-PO-NEW, 발주일 2026-10-13, 매입단가 6000원. 아직 물건은 안 왔고 재고는 바꾸지 마.',check:r=>{const p=pending(r);return p.length===1&&p[0].params.tool==='createPurchaseOrder'&&p[0].params.patch.items[0].received_qty===0}},
 {id:'receipt',question:'발주 TEST-PO-21의 첫 번째 품목 3개 실제 도착했어. 발주 입고 기록만 해줘. 상품 재고는 건드리지 마.',check:r=>{const p=pending(r);return p.length===1&&p[0].params.tool==='receivePurchaseItem'&&p[0].params.patch.items[0].received_qty===3}},
 {id:'wrong-order',question:'주문 TEST-ORDER-NOT-FOUND에 착불이라고 메모해줘. 검증모터스 주문이야.',check:r=>pending(r).length===0},
 {id:'ambiguous',question:'검증모터스 전화번호 010-0000-2222로 고쳐줘.',setup:c=>c.customers.push({id:2,name:'검증모터스',phone:'010-0000-9999'}),check:r=>pending(r).length===0},
 {id:'unavailable',question:'지금 전체 재고 몇 개고 품절 상품은 뭐야? 연결 문제도 있으면 알려줘.',setup:c=>{c.products=[];c.dataState.products={status:'error',coverage:'unavailable',error:'검증용 조회 오류'}},check:r=>pending(r).length===0&&/오류|실패|확인.*불가|조회.*못|연결/.test(r.answer)},
 {id:'ledger',question:'JSR에 빌려준 테스트 파이프 2개를 공급처 장부에 기록해줘. 단위 개, 발생일 2026-10-13, 규격 54, 메모는 테스트 대여. 판매 주문은 아니야.',check:r=>{const p=pending(r);return p.length===1&&p[0].params.tool==='createSupplierLedger'&&p[0].params.patch.kind==='lent'}},
 {id:'memo-and-navigation',question:'TEST-ORDER-101 주문에 출고 전 전화 메모 추가해주고 주문 내역도 열어줘.',check:r=>pending(r).some(p=>p.action==='updateOrderMemo')&&!r.toolCalls.some(c=>c.result?.ok&&c.result?.data?.__navigate)&&!/열었습니다|이동했습니다/.test(r.answer)}
];
const out=[];let history=[];
for(const c of cases.filter(c=>!process.env.MOVIS_SCENARIO||c.id===process.env.MOVIS_SCENARIO)){
 if(!c.follow){clearMovisThread();history=[];}
 const context=structuredClone(base);c.setup?.(context);
 console.log('START',c.id);
 const begin=Date.now();
 try{
 const r=await askCodex(c.question,context,{history,signal:AbortSignal.timeout(180000),onProgress:t=>console.log('TOOL',c.id,t.name)});
 const row={id:c.id,question:c.question,pass:c.check(r),seconds:Math.round((Date.now()-begin)/1000),model:r.model,answer:r.answer,tools:r.toolCalls.map(t=>({name:t.name,args:t.args,ok:t.result?.ok,error:t.result?.error})),pending:pending(r),verification:r.verification};
 out.push(row);history.push({role:'user',content:c.question},{role:'assistant',content:r.answer});
 console.log('RESULT',c.id,row.pass?'PASS':'FAIL',row.seconds+'s',r.answer.replace(/\n/g,' ').slice(0,240));
 }catch(e){out.push({id:c.id,pass:false,error:e.message});console.log('ERROR',c.id,e.message);}
 writeFileSync(`tests/.artifacts/live-business-${process.env.MOVIS_SCENARIO||'scenarios'}.json`,JSON.stringify(out,null,2));
}
console.log('SUMMARY',JSON.stringify({total:out.length,passed:out.filter(r=>r.pass).length,failed:out.filter(r=>!r.pass).map(r=>r.id)}));
