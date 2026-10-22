import { useState, useEffect } from 'react';
import CustomerList from '../pages/CustomerList';
import OrderHistory from '../pages/OrderHistory';
import OrderDetail from '../pages/OrderDetail';
import { discountOrders } from './discountFixture';
const customers = discountOrders.map((o,i)=>({id:`discount-customer-${i}`,name:o.customerName}));
const noop = () => {};
export default function DiscountPreview() {
 const [view,setView]=useState('customer');
 const [order,setOrder]=useState(null);
 const [copied,setCopied]=useState('');
 useEffect(()=>{
   const descriptor=Object.getOwnPropertyDescriptor(navigator.clipboard,'writeText');
   Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async text=>setCopied(text)});
   return ()=>{if(descriptor)Object.defineProperty(navigator.clipboard,'writeText',descriptor);else delete navigator.clipboard.writeText;};
 },[]);
 return <>
  <nav className="p-3 flex flex-wrap gap-3 border-b"><span>할인 검증 · 샘플 자료 · 외부 저장 차단</span><button onClick={()=>setView('customer')}>거래처 상세 검증</button><button onClick={()=>setView('history')}>주문 카드 검증</button></nav>
  {view==='customer' ? <CustomerList customers={customers} orders={discountOrders} onBack={noop} onSaveCustomerReturn={noop} showToast={noop}/> : <OrderHistory orders={discountOrders} customers={customers} onViewOrder={setOrder} onBack={noop} isDetailModalOpen={!!order}/>}
  {copied && <pre aria-label="복사된 샘플 주문서" className="p-4 whitespace-pre-wrap">{copied}</pre>}
  {order && <OrderDetail isOpen order={order} customers={customers} onClose={()=>setOrder(null)} onUpdateOrder={noop}/>}
 </>;
}
