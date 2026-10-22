import { useState } from 'react';
import CustomerList from '../pages/CustomerList';
import CustomerPickerModal from '../components/CustomerPickerModal';
import OrderPage from '../pages/OrderPage';

const customers = [
  { id: 'search-1', name: 'WP튠 김해', phone: '010-0000-1234', address: '경상남도 김해시 샘플로 1' },
  { id: 'search-2', name: 'WP튠 부산', phone: '010-0000-5678', address: '부산 사상구 샘플로 2' },
  { id: 'search-3', name: '김해 예성 모터스', phone: '010-0000-9012', address: '경상남도 김해시 샘플로 3' },
];
const noop = () => {};
export default function CustomerSearchPreview() {
  const [view, setView] = useState('list');
  const [picker, setPicker] = useState(false);
  const [selected, setSelected] = useState('');
  return <>
    <nav className="flex flex-wrap items-center gap-3 p-4 border-b">
      <span>업체 검색 검증 · 샘플 자료 · 외부 저장 차단</span>
      <button onClick={() => setPicker(true)}>업체 선택창 검증</button>
      <button onClick={() => setView('order')}>주문 입력 검증</button>
      <output>{selected && `선택: ${selected}`}</output>
    </nav>
    {view === 'list' ? <CustomerList customers={customers} orders={[]} onBack={noop} showToast={noop}/>
      : <OrderPage customers={customers} products={[]} cart={[]} totalAmount={0} priceType="wholesale"
          onBack={() => setView('list')} onSaveOrder={noop} onSaveCart={noop} showToast={noop}/>}
    <CustomerPickerModal open={picker} customers={customers} onClose={() => setPicker(false)}
      onPick={customer => setSelected(customer.name)}/>
  </>;
}
