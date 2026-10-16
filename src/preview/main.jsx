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
import { StatementResult } from '../components/StatementReconcile';
import { reconcile } from '../lib/statementReconcile';
import StoreShippingDetails from '../components/StoreShippingDetails';
import OrderDetail from '../pages/OrderDetail';
import ShippingLabel from '../pages/ShippingLabel';
import CustomerDetailModal from '../components/CustomerDetailModal';
import StoreCarePanel from '../components/StoreCarePanel';
function DetailPreview(){const [view,setView]=useState('order');const order={id:'DEMO-100',orderNumber:'DEMO-20261016-100',createdAt:new Date().toISOString(),customerName:'무브 퍼포먼스 모터스',customerPhone:'010-0000-0000',customerAddress:'서울시 샘플구 디자인로 123, 2층 정비 접수실',priceType:'wholesale',totalAmount:198000,totalQuantity:2,items:[{id:1,name:'스테인리스 브레이크 호스 세트 (길이 확인 후 출고)',quantity:2,price:99000,wholesale:99000}],memo:'출고 전 연락 부탁드립니다.',returns:[]};return <main><nav className="flex flex-wrap gap-2 p-4">{[['order','주문 상세'],['customer','고객 정보'],['shipping','택배 송장'],['care','Q&A · 리뷰']].map(([key,label])=><button className="border rounded-xl p-3" key={key} onClick={()=>setView(key)}>{label}</button>)}</nav>{view==='order'&&<OrderDetail isOpen order={order} onClose={()=>setView('shipping')} onUpdateOrder={()=>{}}/>}{view==='customer'&&<CustomerDetailModal open customer={sample.customers[0]} onClose={()=>setView('shipping')}/ >}{view==='shipping'&&<ShippingLabel orders={[order]} customers={sample.customers} onBack={()=>setView('order')}/ >}{view==='care'&&<div className="p-4"><StoreCarePanel/></div>}</main>}
function ShippingPreview(){return <main style={{maxWidth:760,margin:'24px auto',padding:16}}><h2 className="text-lg font-bold mb-4">스토어 · 발송 상세 미리보기 (샘플)</h2><StoreShippingDetails order={{order_status:'PAYED'}} items={[{provider_product_name:'스텐 밴딩 54-30 · 입고 대기 상품',raw_payload:{productOrder:{productOrderStatus:'PAYED',placeOrderStatus:'OK',placeOrderDate:'2026-10-14T10:00:00+09:00',dispatchDueDate:'2026-10-15T23:59:00+09:00',delayedDispatchReason:'PRODUCT_PREPARE',delayedDispatchDetailedReason:'공급사 입고 지연으로 준비 중입니다. 입고 후 순차 출고 예정입니다.'}}},{provider_product_name:'브레이크 호스 · 일반 발송 상품',raw_payload:{productOrder:{productOrderStatus:'PAYED',placeOrderStatus:'NOT_YET',dispatchDueDate:'2026-10-20T23:59:00+09:00'}}}]}/></main>}
const reconOrders=[{id:'DEMO-1',customerName:'샘플 모터스',createdAt:'2026-10-15T01:00:00Z',totalAmount:11000,items:[{name:'스텐 밴딩 54-30',quantity:1,price:11000}]}];
function ReconPreview(){const [stmt,setStmt]=useState({customer:'샘플 모터스',issue_date:'2026-10-15',stated_total:11000,items:[{name:'스텐 밴딩 64-30',qty:1,supply:10000,tax:1000,uncertain:false}]});return <div style={{maxWidth:1000,margin:'24px auto',padding:12}}><StatementResult r={{stmt,rec:reconcile(stmt,reconOrders)}} onEdit={setStmt} onRemove={()=>{}} onSave={()=>{}}/></div>;}
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
if(import.meta.env.DEV && new URLSearchParams(location.search).has('detailCheck')){createRoot(document.getElementById('root')).render(<DetailPreview/>)}
else if(import.meta.env.DEV && new URLSearchParams(location.search).has('shippingCheck')){createRoot(document.getElementById('root')).render(<ShippingPreview/>)}
else if(import.meta.env.DEV && new URLSearchParams(location.search).has('statementCheck')){createRoot(document.getElementById('root')).render(<ReconPreview/>)}
else if(import.meta.env.DEV){const {default:App}=await import('../App');createRoot(document.getElementById('root')).render(<App/>)}
