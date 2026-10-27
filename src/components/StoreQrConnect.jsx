import {useEffect,useState} from 'react';
import SupplierModal from '@/components/purchase/SupplierModal';
import {pairMobile} from '@/lib/storeMobile';

export default function StoreQrConnect({candidate}){
 const [code,setCode]=useState(candidate||''),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const receive=()=>{const next=window.__moveStoreQrCandidate;delete window.__moveStoreQrCandidate;if(!busy&&/^[0-9a-f]{32}$/.test(next||'')){setCode(next);setDone(false);setError('');}};window.addEventListener('move-store-qr',receive);return()=>window.removeEventListener('move-store-qr',receive);},[busy]);
 if(!code&&!done)return null;
 const close=()=>{if(!busy){setCode('');setDone(false);}};
 const connect=async()=>{setBusy(true);setError('');try{await pairMobile(code);setCode('');setDone(true);}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <SupplierModal title={done?'휴대폰 연결 완료':'매장 PC에 연결'} subtitle="네이버 상품 관리" busy={busy} onClose={close} compact footer={done?<button onClick={close} className="min-h-11 px-5 rounded-xl text-white font-semibold" style={{background:'var(--primary)'}}>확인</button>:<><button disabled={busy} onClick={close} className="min-h-11 px-4 rounded-xl border text-sm font-semibold">취소</button><button disabled={busy} onClick={connect} className="min-h-11 px-5 rounded-xl text-white font-semibold disabled:opacity-50" style={{background:'var(--primary)'}}>{busy?'연결 중…':'이 휴대폰 연결'}</button></>}>
  {done?<div className="space-y-3"><p className="font-bold" style={{color:'var(--primary)'}}>매장 PC와 연결됐습니다.</p><p className="text-sm leading-relaxed">이 창에서 스마트스토어 주문 → 상품·품절 관리로 이동해 재고와 판매 상태를 변경할 수 있습니다.</p></div>:<div className="space-y-3"><p className="font-semibold">스캔한 QR코드로 이 휴대폰을 매장 PC에 연결할까요?</p><p className="text-sm leading-relaxed" style={{color:'var(--muted-foreground)'}}>연결 후 네이버 상품의 재고와 판매 상태를 변경할 수 있습니다. 매장 PC에서 직접 띄운 QR코드일 때만 연결해주세요.</p>{error&&<p role="alert" className="text-sm" style={{color:'var(--destructive)'}}>{error}</p>}</div>}
 </SupplierModal>;
}
