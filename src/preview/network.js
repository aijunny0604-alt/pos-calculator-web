import { mockMovisNavigation } from './movisNavigationFixture';
import { invoiceFixture } from './invoiceFixture';
import { storeWidgetFixture } from './storeWidgetFixture';
import { storeCatalogFixture } from './storeCatalogFixture';
// 개발 전용 미리보기: 외부 통신 없이 샘플 응답만 제공한다.
const now = new Date().toISOString();
const names = ['스텐 밴딩 54-30','브레이크 호스 세트','퍼포먼스 배기 팁','실리콘 엘보 호스','알루미늄 플랜지','스테인리스 클램프','레이싱 흡기 필터','티타늄 볼트 세트'];
const products = names.map((name,i)=>({id:i+1,name,category:['배기 부품','브레이크','소모품'][i%3],stock:i===0?3:12+i*4,min_stock:5,wholesale:12000+i*18000,retail:18000+i*24000,note:i===1?'길이 확인 후 출고':''}));
const customers = ['샘플 모터스','테스트 퍼포먼스','무브 디자인 검토용 긴 이름의 자동차 정비업체'].map((name,i)=>({id:i+1,name,phone:'010-0000-0000',address:'서울시 샘플구 디자인로 123 (미리보기용 주소)',category:'도매',created_at:now}));
const orders=Array.from({length:8},(_,i)=>({id:'DEMO-'+(100+i),order_number:'DEMO-'+(100+i),customer_name:customers[i%3].name,customer_id:i%3+1,customer_phone:'010-0000-0000',customer_address:customers[0].address,items:[{...products[i],quantity:2}],total_amount:(i%2?products[i].retail:products[i].wholesale)*2,total_quantity:2,price_type:i%2?'retail':'wholesale',created_at:now,status:'completed',memo:i===0?'샘플 주문입니다. 실제 출고하지 않습니다.':''}));
export const sample = {products,customers,orders};
const tables={products,customers,orders,saved_carts:[],payment_records:[],payment_history:[],purchase_orders:[],supplier_prices:[],external_orders:[{id:'DEMO-STORE-1',provider:'naver',provider_order_id:'DEMO-20261020',buyer_name:'발송 검증용 고객',order_status:'PAYED',raw_payload:{productOrder:{expectedDeliveryMethod:'VISIT_RECEIPT'}},total_amount:164000,created_at:now,ordered_at:now}],external_order_items:[{id:'DEMO-ITEM-1',external_order_id:'DEMO-STORE-1',product_name:'모바일 발송 모달 검증용 상품',quantity:1,unit_price:164000}],external_products:[],app_settings:[]};
const invoiceCheck = new URLSearchParams(location.search).get('invoiceCheck');
const stockCheck = new URLSearchParams(location.search).get('stockCheck');
if (import.meta.env.DEV && stockCheck && stockCheck !== 'empty') tables.external_products = storeCatalogFixture();
if (import.meta.env.DEV && new URLSearchParams(location.search).has('mobileTransportCheck') && tables.external_products[0]) { tables.external_products[0].channel_product_no='10';tables.external_products[0].origin_product_no='20'; }
if (import.meta.env.DEV && invoiceCheck) Object.assign(tables, invoiceFixture(invoiceCheck));
if (import.meta.env.DEV && new URLSearchParams(location.search).has('storeCheck')) Object.assign(tables, storeWidgetFixture());
if (import.meta.env.DEV && new URLSearchParams(location.search).has('catalogCheck')) tables.products = ['플랜지 FL 63','플랜지 FL 54','자바라 SF 63 S 길이 120','자바라 SF 63 S 길이 150','H64 바디','X64 바디','CH 150 64','플랜지 FL 76'].map((name,i)=>({id:i+201,name,category:name.includes('플랜지')?'플랜지':name.includes('자바라')?'자바라':'기타',stock:10+i,wholesale:5280+i*1000,retail:6600+i*1000}));
if (import.meta.env.DEV && new URLSearchParams(location.search).has('jsrCheck')) {
 tables.supplier_ledger = [
  {id: 'sample-lent', kind: 'lent', item_name: 'JSR 대여 샘플', spec: '긴 규격명 표시 확인', qty: 5, unit: '세트', occurred_on: '2026-08-19', resolved: false, note: '미리보기 전용 · 실제 기록 아님'},
  {id: 'sample-lent-2', kind: 'lent', item_name: 'X64 바디 · 표시 샘플', qty: 1, unit: '개', occurred_on: '2026-08-20', resolved: false, note: '본사 입고 후 교환 예정 · 긴 비고가 여러 줄이어도 수량과 버튼을 가리지 않는지 확인'},
  {id: 'sample-lent-done', kind: 'lent', item_name: '회수 완료 샘플', qty: 2, unit: '개', occurred_on: '2026-07-19', resolved: true},
  {id: 'sample-defect', kind: 'defect', item_name: '보관 중인 불량 샘플', spec: 'NPK89S_B', qty: 6, unit: '개', resolved: false},
 ];
 tables.defect_returns = [
  {id: 'sample-return', supplier: 'JSR', return_date: '2026-08-19', status: '진행중', items: [{category: 'NPK', spec: 'NPK 89S-B', qty: 6, unit: '개', received_qty: 0}, {category: '기타', spec: 'DSQ2_B · 긴 품명과 규격 줄바꿈 샘플', qty: 2, unit: '세트', received_qty: 0}]},
  {id: 'sample-return-part', supplier: 'JSR', return_date: '2026-08-20', status: '진행중', items: [{category: 'NPK', spec: 'NPK 89S-T', qty: 4, unit: '개', received_qty: 2}]},
  {id: 'sample-return-done', supplier: 'JSR', return_date: '2026-07-19', status: '완료', items: [{category: 'NPK', spec: 'NPK 89S-B', qty: 1, unit: '개', received_qty: 1}]},
  {id: 'sample-return-long', supplier: 'JSR', return_date: '2026-09-01', status: '진행중', memo: '스크롤 확인용 샘플 · 실제 발송 기록 아님', items: Array.from({length: 19}, (_, i) => ({category: '검증용', spec: `상세 품목 ${i + 1} · 긴 규격명 표시 샘플`, qty: i + 1, unit: i % 3 === 0 ? '세트' : '개', received_qty: 0}))},
 ];
}
const realFetch=window.fetch.bind(window);
export function simulateDispatch(state, realtime = true) {
 if (!import.meta.env.DEV || !new URLSearchParams(location.search).has('dispatchCheck')) return;
 const order = { id:'DISPATCH-DEMO', provider:'naver', provider_order_id:'SAMPLE-DISPATCH', buyer_name:'발송 반응성 샘플', received_at:now, total_amount:10000,
  order_status:state==='배송중'?'DELIVERING':'confirmed', naver_confirm_succeeded_at:now,
  needs_naver_dispatch:state==='대기', naver_dispatch_succeeded_at:['성공','배송중'].includes(state)?now:null,
  naver_dispatch_error:state==='실패'?'샘플 검증 실패':null };
 tables.external_orders=[order];
 tables.external_order_items=[{id:'DISPATCH-ITEM',external_order_id:order.id,provider_product_name:'샘플 부품',quantity:1,unit_price:10000}];
 if(realtime)window.dispatchEvent(new CustomEvent('external-orders-changed',{detail:{eventType:'UPDATE',new:order}}));
}
if (import.meta.env.DEV && new URLSearchParams(location.search).has('dispatchCheck')) simulateDispatch('대기',false);
window.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 const method=(options.method||(input instanceof Request?input.method:'GET')).toUpperCase();
 if(import.meta.env.DEV && new URLSearchParams(location.search).has('mobileTransportCheck') && url.origin==='http://127.0.0.1:43128') return realFetch(`http://127.0.0.1:43132${url.pathname}${url.search}`,options);
 if(import.meta.env.DEV && new URLSearchParams(location.search).has('productEditorCheck') && url.origin==='http://127.0.0.1:43128') {
  const snapshot={originNo:'80000000',name:'샘플',status:'SALE',stock:3,stockManagement:true,options:[{type:'combination',id:'8',name:'블랙',stock:3,price:0,usable:true}]};
  let data={};
  if(url.pathname==='/session')data={token:'sample'};
  else if(url.pathname==='/product-snapshot')data=snapshot;
  else if(url.pathname.endsWith('/prepare'))data={preview:'sample',description:'블랙: 3개 → 5개'};
  else if(url.pathname.endsWith('/confirm')) {window.previewProductConfirms=(window.previewProductConfirms||0)+1;data={snapshot:{...snapshot,stock:5,options:[{...snapshot.options[0],stock:5}]}};}
  return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 }
 if(import.meta.env.DEV && new URLSearchParams(location.search).has('movisNavigationCheck') && url.pathname.startsWith('/api/movis/')) return mockMovisNavigation(url, options);
 if(import.meta.env.DEV && new URLSearchParams(location.search).has('financeCheck') && ['/settlements','/settlement-case','/commission-details','/vat-case'].includes(url.pathname)) {
  const common={orderId:'SAMPLE-1234',productOrderId:'SAMPLE-5678',productName:'샘플 상품 · 긴 옵션명과 규격 확인',settleBasisDate:'2026-09-20',settleCompleteDate:null};
  const rows={'/settlements':{settleBasisStartDate:'2026-09-01',settleBasisEndDate:'2026-09-30',settleAmount:110000,commissionSettleAmount:-10000,settleExpectDate:'2026-10-01',settleCompleteDate:null},'/settlement-case':{...common,paySettleAmount:110000,totalPayCommissionAmount:3000,settleExpectAmount:107000,settleType:'NORMAL_SETTLE_ORIGINAL'},'/commission-details':{...common,orderNo:'SAMPLE-1234',commissionType:'PAY_COMMISSION',commissionBasisAmount:110000,commissionAmount:3000},'/vat-case':{...common,totalSalesAmount:110000,taxationSalesAmount:110000,taxExemptionSalesAmount:0,status:'VOUCH_PUBLICATION'}};
  return new Response(JSON.stringify({elements:[rows[url.pathname]],page:1,last:true,totalElements:1,fetchedAt:'2026-10-27T00:00:00Z'}),{status:200,headers:{'Content-Type':'application/json'}});
 }
 if(url.origin===location.origin&&!url.pathname.includes('/api/'))return realFetch(input,options);
 if(method!=='GET'&&method!=='HEAD')return new Response(JSON.stringify({message:'디자인 미리보기에서는 저장·외부 실행을 하지 않습니다.'}),{status:403,headers:{'Content-Type':'application/json'}});
 let data=[];
 if(url.pathname.includes('/rest/v1/')){
  const table=url.pathname.split('/').at(-1);
  if (stockCheck === 'failure' && table === 'external_products') return new Response('{}', {status:503});
  if(invoiceCheck === 'failure' && table === 'payment_records') return new Response('{}',{status:503});
  data=structuredClone(tables[table]||[]);
  const id=url.searchParams.get('id');if(id?.startsWith('eq.'))data=data.filter(row=>String(row.id)===id.slice(3));
  if(id?.startsWith('in.(')) { const ids=id.slice(4,-1).split(',').map(value=>value.replaceAll('"','')); data=data.filter(row=>ids.includes(String(row.id))); }
 }else if(url.pathname.endsWith('/status'))data={connected:false,needsLogin:false,models:[]};
 else if(url.pathname.endsWith('/session'))data={token:'design-preview'};
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json','Content-Range':`0-${Math.max(0,data.length-1)}/${data.length||0}`}});
};
const RealWebSocket=window.WebSocket;
window.WebSocket=class extends EventTarget {static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;readyState=3;constructor(url,protocols){super();const host=new URL(url,location.href).host;if(host===location.host||(import.meta.env.DEV&&new URLSearchParams(location.search).has('mobileTransportCheck')&&host==='jubzppndcclhnvgbvrxr.supabase.co'))return new RealWebSocket(url,protocols)}send(){}close(){}};
navigator.sendBeacon=()=>false;
