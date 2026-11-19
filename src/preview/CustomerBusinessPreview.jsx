import { useState } from 'react';
import CustomerList from '../pages/CustomerList';
import { supabase } from '../lib/supabase';
let current = { id:'business-demo', name:'사업자 이력 샘플 업체', business_profile:{ company_name:'이전 상호', business_number:'1234567890', representative:'이전 대표' }, business_profile_changed_at:'2026-10-01T00:00:00Z', business_change_count:0, business_cert_url:'https://example.test/old.png', business_cert_path:'old.png' };
let history = [];
if (new URLSearchParams(location.search).has('businessHistoryCheck')) {
const scenario = new URLSearchParams(location.search).get('businessScenario');
if (scenario === 'empty') current = { ...current, business_profile:{}, business_profile_changed_at:null, business_cert_url:null, business_cert_path:null };
if (scenario === 'photoOnly') {
  current = { ...current, business_profile:{}, business_change_count:1 };
  history = [{ id:'photo-only', changed_at:'2026-11-18T00:00:00Z', snapshot:{ profile:{}, customer_name:current.name, cert_url:new URL('./business-test/previous.webp', location.href).href } }];
}
supabase.getCustomerBusiness = async () => structuredClone({ current, history });
supabase.saveCustomerBusiness = async (id, profile, expectedAt) => {
  if (current.business_profile_changed_at !== expectedAt) throw new Error('다른 화면에서 사업자 정보가 변경되었습니다. 다시 불러온 후 확인해주세요.');
  history.unshift({ id:String(history.length + 1), changed_at:new Date().toISOString(), snapshot:{ profile:current.business_profile, cert_url:current.business_cert_url, cert_path:current.business_cert_path } });
  current = { ...current, business_profile:profile, business_profile_changed_at:new Date().toISOString(), business_change_count:history.length };
  return structuredClone(current);
};
}
export default function CustomerBusinessPreview() {
  const [customer, setCustomer] = useState(current);
  return <><p className="p-3 text-sm">사업자 변경 샘플 · 운영 DB 저장 없음 <button type="button" onClick={() => { current = { ...current, business_profile_changed_at:new Date().toISOString() }; }} className="ml-3 border px-2">다른 기기 변경 모사</button></p><CustomerList customers={[customer]} orders={[]} onBack={() => {}} onCustomerUpdated={setCustomer} showToast={() => {}} /></>;
}
