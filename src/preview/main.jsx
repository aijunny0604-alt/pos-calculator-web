import './network';
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../index.css';
import '../styles/move-design.css';
import './preview.css';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import CustomerPickerModal from '../components/CustomerPickerModal';
import PaymentRegisterModal from '../components/PaymentRegisterModal';
import BulkPaymentModal from '../components/BulkPaymentModal';
import PaymentEditModal from '../components/PaymentEditModal';
import {sample} from './network';
function Controls(){
 const [modal,setModal]=useState('');const close=()=>setModal('');
 return <><div className="design-preview-bar"><span><b>DESIGN PREVIEW</b><small>샘플 자료 · 저장 및 외부 연결 차단</small></span><div><button onClick={()=>setModal('confirm')}>확인창</button><button onClick={()=>setModal('long')}>긴 내용</button><button onClick={()=>setModal('customer')}>거래처 선택</button><button onClick={()=>setModal('payment')}>입금 등록</button>{new URLSearchParams(location.search).has('paymentChecks') && <><button onClick={()=>setModal('bulk')}>일괄 입금 검증</button><button onClick={()=>setModal('edit')}>입금 수정 검증</button></>}</div></div>
 <ConfirmDialog isOpen={modal==='confirm'||modal==='long'} title="변경 내용을 저장할까요?" message={modal==='long'?Array.from({length:18},(_,i)=>`${i+1}. 긴 업체명·주소·주문 내용을 작은 화면에서도 확인할 수 있도록 본문만 스크롤됩니다. 하단 버튼은 항상 보입니다.`).join('\n\n'):'샘플 주문의 연락처와 배송지를 변경합니다.\n이 화면은 디자인 검토용이며 실제 정보는 저장되지 않습니다.'} onCancel={close} onConfirm={close} confirmText="확인"/>
 <CustomerPickerModal open={modal==='customer'} customers={sample.customers} onPick={close} onClose={close}/>
 <PaymentRegisterModal open={modal==='payment'} onClose={close} onSaved={close}/>
 <BulkPaymentModal open={modal==='bulk'} customer={sample.customers[0]} records={[{id:901,customer_id:1,balance:10000,invoice_date:'2026-10-01'},{id:902,customer_id:1,balance:20000,invoice_date:'2026-10-02'}]} onClose={close} onSaved={close}/>
 <PaymentEditModal open={modal==='edit'} history={{id:701,amount:10000,paid_at:'2026-10-14T23:15:37.000Z',method:'현금'}} onClose={close} onSaved={close}/></>;
}
// 별도 검증 URL에서만 테스트 도구를 표시한다. 기본 미리보기에는 표시하지 않는다.
if (new URLSearchParams(location.search).get('tools') === '1') {
 document.documentElement.classList.add('preview-with-tools');
 createRoot(document.getElementById('preview-controls')).render(<Controls/>);
}
if(import.meta.env.DEV){const {default:App}=await import('../App');createRoot(document.getElementById('root')).render(<App/>)}
