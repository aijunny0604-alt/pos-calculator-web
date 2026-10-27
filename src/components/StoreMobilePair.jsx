import {useState} from 'react';
import {productRequest} from '@/lib/storeProduct';
import {mobileCode, pairMobile, forgetMobile} from '@/lib/storeMobile';

const button='min-h-11 rounded-xl border px-3 text-sm font-semibold disabled:opacity-40';
export default function StoreMobilePair(){
 const [open,setOpen]=useState(false),[code,setCode]=useState(''),[input,setInput]=useState(''),[connected,setConnected]=useState(()=>!!mobileCode()),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const start=async()=>{setBusy(true);setError('');try{const result=await productRequest('mobile-pair/start',{data:{}});setCode(result.code);}catch(e){setError(e.message);}finally{setBusy(false);}};
 const pair=async()=>{setBusy(true);setError('');try{await pairMobile(input);setConnected(true);setInput('');}catch(e){setError(e.message);}finally{setBusy(false);}};
 const stop=async()=>{setBusy(true);setError('');try{await productRequest('mobile-pair/stop',{data:{}});setCode('');}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <div className="rounded-xl border p-3 space-y-3" style={{borderColor:'var(--border)',background:'var(--muted)'}}>
  <button aria-expanded={open} onClick={()=>setOpen(!open)} className="min-h-11 font-semibold text-sm" style={{color:'var(--primary)'}}>{open?'휴대폰 연결 접기':'휴대폰 연결'}</button>
  {open&&<><p className="text-xs leading-relaxed" style={{color:'var(--muted-foreground)'}}>매장 PC에서 연결 코드를 만들고 휴대폰에 입력하세요. PC가 켜져 있어야 하며, 코드를 아는 기기는 네이버 재고·판매 상태를 변경할 수 있습니다.</p>
   {connected?<div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold" style={{color:'var(--primary)'}}>이 휴대폰에 연결 정보가 저장됨</span><button disabled={busy} onClick={()=>{forgetMobile();setConnected(false);}} className={button}>이 기기 연결 해제</button></div>:<div className="flex flex-wrap items-end gap-2"><label className="text-xs font-semibold flex-1 min-w-[180px]">PC 연결 코드<input aria-label="휴대폰 연결 코드" value={input} onChange={e=>setInput(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={48} placeholder="PC에서 만든 코드 입력" className="block w-full min-h-11 rounded-xl border px-3 mt-1 text-base"/></label><button disabled={busy||!input} onClick={pair} className={button} style={{color:'var(--primary)'}}>{busy?'연결 중…':'휴대폰 연결하기'}</button></div>}
   <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={start} className={button}>PC에서 연결 코드 만들기</button><button disabled={busy} onClick={stop} className={button}>PC에서 전체 연결 종료</button></div>
   {code&&<div className="rounded-xl p-3" style={{background:'var(--card)'}}><p className="text-xs">아래 코드를 본인 휴대폰에만 입력하세요. 새 코드를 만들거나 PC 연결을 종료하면 기존 연결은 해제됩니다.</p><p className="font-mono font-bold break-all text-base mt-2 select-all">{code.match(/.{1,4}/g).join(' ')}</p></div>}
   {error&&<p role="alert" className="text-sm" style={{color:'var(--destructive)'}}>{error}</p>}
  </>}
 </div>;
}
