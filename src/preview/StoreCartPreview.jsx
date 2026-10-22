import { useState } from 'react';
import SavedCarts from '../pages/SavedCarts';
import OrderHistory from '../pages/OrderHistory';
import { confirmSavedCart, mergeOrderMemos } from '../lib/cartOrderContext';

const customers=[{id:1,name:'스토어 예약 고객',category:'엠파츠'},{id:2,name:'일반 업체',category:'도매'}];
const item={id:1,name:'샘플 BOV 블루',price:110000,retail:110000,wholesale:100000,quantity:1};
const now=new Date().toISOString();
const cart={id:'SAMPLE-CART',name:customers[0].name,created_at:new Date(Date.now()-86400000).toISOString(),status:'scheduled',date:'어제 저장',time:'12:00',price_type:'retail',total:110000,items:[item],memo:mergeOrderMemos('[엠파츠] [네이버 스마트스토어] 202610210000001','다음날 주문 예약')};
const initialOrders=[{id:'SAMPLE-LEGACY',orderNumber:'SAMPLE-LEGACY',customerName:customers[0].name,priceType:'retail',createdAt:now,totalAmount:110000,items:[item],memo:''},{id:'SAMPLE-GENERAL',orderNumber:'SAMPLE-GENERAL',customerName:customers[1].name,priceType:'wholesale',createdAt:now,totalAmount:110000,items:[item]}];
export default function StoreCartPreview(){
  const [view,setView]=useState('orders');
  const [orders,setOrders]=useState(initialOrders);
  const [carts,setCarts]=useState([cart]);
  const [fail,setFail]=useState(false);
  const [notice,setNotice]=useState('');
  return <>
    <nav className="p-3 flex flex-wrap gap-4 border-b">
      <span>스토어 장바구니 검증 · 샘플 · 운영 저장 없음</span>
      <button onClick={()=>setView('orders')}>주문 카드 보기</button>
      <button onClick={()=>setView('carts')}>어제 저장한 예약 장바구니</button>
      <label><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/> 저장 실패 재현</label>
      <output>{notice}</output>
    </nav>
    {view==='orders'?<OrderHistory orders={orders} customers={customers} onBack={()=>{}} onViewOrder={()=>{}}/>:
      <SavedCarts savedCarts={carts} customers={customers} products={[item]} onBack={()=>setView('orders')} showToast={setNotice} onLoad={()=>{}} onOrder={c=>confirmSavedCart(c,async payload=>{
        if(fail){setNotice('샘플 저장 실패 · 장바구니 유지');return null;}
        const order={...payload,id:'SAMPLE-CONVERTED',orderNumber:'SAMPLE-CONVERTED',customerName:payload.customer_name,createdAt:now,totalAmount:payload.total_amount,priceType:payload.price_type};
        setOrders(prev=>[...prev,order]);setNotice('샘플 주문 저장 완료');return order;
      },async id=>setCarts(prev=>prev.filter(c=>c.id!==id)))}/>
    }
  </>;
}
