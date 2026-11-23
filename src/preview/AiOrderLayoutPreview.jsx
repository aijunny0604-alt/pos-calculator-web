import { useState } from 'react';
import AppLayout from '../components/layout/AppLayout';
import ReservationAlertBar from '../components/ReservationAlertBar';
import TextAnalyze from '../pages/TextAnalyze';
import MainPOS from '../pages/MainPOS';
import { supabase } from '../lib/supabase';
import { formatPrice, getTodayKST } from '../lib/utils';

const products = [{ id:1, name:'플랜지 FL 63', category:'플랜지', wholesale:5280, stock:10 }];
if (import.meta.env.DEV && new URLSearchParams(location.search).has('aiOrderLayoutCheck')) {
  supabase.getSavedCarts = async () => Array.from({length:5},(_,i) => ({id:`reservation-${i}`,name:`예약 거래처 ${i+1} · 출고 전 확인이 필요한 긴 업체명`,delivery_date:getTodayKST(),status:'scheduled'}));
}
export default function AiOrderLayoutPreview() {
  const [added, setAdded] = useState(0);
  const [cart, setCart] = useState(()=>new URLSearchParams(location.search).has('embedded') ? [{...products[0],quantity:1,price:5280}] : []);
  const embedded = new URLSearchParams(location.search).has('embedded');
  return <AppLayout currentPage={embedded ? 'pos' : 'ai-order'} isOnline onNavigate={()=>{}}>
    <ReservationAlertBar reserveRightGutter={embedded} onGoToCarts={()=>{}} />
    <div className="flex-1 min-h-0 flex flex-col">
      {embedded ? <MainPOS products={products} cart={cart} setCart={setCart} priceType="wholesale" setPriceType={()=>{}} customers={[]} />
        : <TextAnalyze products={products} formatPrice={formatPrice} onBack={()=>{}} onAddToCart={items=>setAdded(items.length)} />}
      <output aria-label="장바구니 담기 결과" className="sr-only">{embedded ? cart.reduce((sum,item)=>sum+item.quantity,0) : added}</output>
    </div>
  </AppLayout>;
}
