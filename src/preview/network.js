// 개발 전용 미리보기: 외부 통신 없이 샘플 응답만 제공한다.
const now = new Date().toISOString();
const names = ['스텐 밴딩 54-30','브레이크 호스 세트','퍼포먼스 배기 팁','실리콘 엘보 호스','알루미늄 플랜지','스테인리스 클램프','레이싱 흡기 필터','티타늄 볼트 세트'];
const products = names.map((name,i)=>({id:i+1,name,category:['배기 부품','브레이크','소모품'][i%3],stock:i===0?3:12+i*4,min_stock:5,wholesale:12000+i*18000,retail:18000+i*24000,note:i===1?'길이 확인 후 출고':''}));
const customers = ['샘플 모터스','테스트 퍼포먼스','무브 디자인 검토용 긴 이름의 자동차 정비업체'].map((name,i)=>({id:i+1,name,phone:'010-0000-0000',address:'서울시 샘플구 디자인로 123 (미리보기용 주소)',category:'도매',created_at:now}));
const orders=Array.from({length:8},(_,i)=>({id:'DEMO-'+(100+i),order_number:'DEMO-'+(100+i),customer_name:customers[i%3].name,customer_id:i%3+1,customer_phone:'010-0000-0000',customer_address:customers[0].address,items:[{...products[i],quantity:2}],total_amount:(i%2?products[i].retail:products[i].wholesale)*2,total_quantity:2,price_type:i%2?'retail':'wholesale',created_at:now,status:'completed',memo:i===0?'샘플 주문입니다. 실제 출고하지 않습니다.':''}));
export const sample = {products,customers,orders};
const tables={products,customers,orders,saved_carts:[],payment_records:[],payment_history:[],purchase_orders:[],supplier_prices:[],external_orders:[{id:'DEMO-STORE-1',provider:'naver',provider_order_id:'DEMO-20261020',buyer_name:'발송 검증용 고객',status:'paid',total_amount:164000,created_at:now,ordered_at:now}],external_order_items:[{id:'DEMO-ITEM-1',external_order_id:'DEMO-STORE-1',product_name:'모바일 발송 모달 검증용 상품',quantity:1,unit_price:164000}],external_products:[],app_settings:[]};
const realFetch=window.fetch.bind(window);
window.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 const method=(options.method||(input instanceof Request?input.method:'GET')).toUpperCase();
 if(url.origin===location.origin&&!url.pathname.includes('/api/'))return realFetch(input,options);
 if(method!=='GET'&&method!=='HEAD')return new Response(JSON.stringify({message:'디자인 미리보기에서는 저장·외부 실행을 하지 않습니다.'}),{status:403,headers:{'Content-Type':'application/json'}});
 let data=[];
 if(url.pathname.includes('/rest/v1/')){
  const table=url.pathname.split('/').at(-1);data=structuredClone(tables[table]||[]);
  const id=url.searchParams.get('id');if(id?.startsWith('eq.'))data=data.filter(row=>String(row.id)===id.slice(3));
 }else if(url.pathname.endsWith('/status'))data={connected:false,needsLogin:false,models:[]};
 else if(url.pathname.endsWith('/session'))data={token:'design-preview'};
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json','Content-Range':`0-${Math.max(0,data.length-1)}/${data.length||0}`}});
};
const RealWebSocket=window.WebSocket;
window.WebSocket=class extends EventTarget {static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;readyState=3;constructor(url,protocols){super();if(new URL(url,location.href).host===location.host)return new RealWebSocket(url,protocols)}send(){}close(){}};
navigator.sendBeacon=()=>false;
