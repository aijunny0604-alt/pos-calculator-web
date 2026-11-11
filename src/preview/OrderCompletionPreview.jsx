import { useState } from 'react';
import MainPOS from '../pages/MainPOS';

const sampleProduct = { id: 1, name: '샘플 제품', category: '기타', wholesale: 10000, retail: 12000, stock: 10, quantity: 1 };
export default function OrderCompletionPreview() {
  const [cart, setCart] = useState([sampleProduct]);
  const [saving, setSaving] = useState(false);
  const saveOrder = async () => {
    setSaving(true);
    await new Promise(resolve => setTimeout(resolve, 100));
    if (new URLSearchParams(location.search).has('orderSaveFailure')) { setSaving(false); return null; }
    setCart([]);
    setSaving(false);
    return { id: 'SAMPLE-ORDER' };
  };
  return <div style={{ height: '100dvh' }}><MainPOS products={[sampleProduct]} cart={cart} setCart={setCart} priceType="wholesale" setPriceType={() => {}} saveOrder={saveOrder} isSaving={saving} autoOpenOrderConfirmNonce={1} customers={[]} /></div>;
}
