import { useState } from 'react';
import { ArrowLeft, CalendarDays, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { kstDay, summarizeStoreSales } from '@/lib/storeSales';

const money = value => `${value.toLocaleString('ko-KR')}원`;
const panel = {background:'var(--card)',borderColor:'var(--border)'};
const dayOffset = (day, offset) => { const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate()+offset); return date.toISOString().slice(0,10); };
const validDay = day => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T00:00:00Z`)) && new Date(`${day}T00:00:00Z`).toISOString().slice(0,10)===day;

export default function StoreSales({onBack}) {
  const today = kstDay(new Date());
  const [start,setStart] = useState(`${today.slice(0,7)}-01`), [end,setEnd] = useState(today);
  const [result,setResult] = useState(null), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const range = (a,b) => {setStart(a);setEnd(b);setResult(null);setError('');};
  const presets = [ ['오늘',today,today], ['최근 7일',dayOffset(today,-6),today], ['이번 달',`${today.slice(0,7)}-01`,today], ['지난 달',`${dayOffset(`${today.slice(0,7)}-01`,-1).slice(0,7)}-01`,dayOffset(`${today.slice(0,7)}-01`,-1)] ];
  const load = async () => {
    if (busy) return;
    if (!validDay(start) || !validDay(end) || start>end) {setError('시작일과 종료일을 확인해주세요.');setResult(null);return;}
    setBusy(true);setError('');setResult(null);
    try {
      const orders = await supabase.getStoreSalesOrders(start,end);
      const items = await supabase.getExternalOrderItemsByOrders(orders.map(order=>order.id),{strict:true});
      setResult({...summarizeStoreSales(orders,items),start,end,checkedAt:new Date()});
    } catch (e) {console.error('스토어 기간 매출 조회 실패:',e);setError('매출 자료를 모두 불러오지 못했습니다. 연결 상태를 확인하고 다시 조회해주세요.');}
    finally {setBusy(false);}
  };
  return <div className="h-full min-h-0 flex flex-col bg-[var(--background)]"><header className="shrink-0 flex items-center gap-3 border-b px-4 sm:px-6 py-4" style={panel}>
    <button onClick={onBack} className="min-h-11 px-3 rounded-xl border flex items-center gap-2" style={panel}><ArrowLeft size={18}/>주문 관리</button><div><h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2"><CalendarDays size={22}/>스토어 기간 매출</h1><p className="text-xs text-[var(--muted-foreground)] mt-1">네이버 동기화 주문 기준</p></div>
  </header><main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
    <section className="rounded-2xl border p-4 sm:p-5 space-y-4" style={panel}><div className="flex flex-wrap gap-2">{presets.map(([label,a,b])=><button key={label} disabled={busy} aria-pressed={start===a&&end===b} onClick={()=>range(a,b)} className="min-h-11 px-4 rounded-xl border text-sm font-bold transition-colors disabled:opacity-50" style={{...panel,color:start===a&&end===b?'var(--primary)':'var(--muted-foreground)',borderColor:start===a&&end===b?'var(--primary)':'var(--border)'}}>{label}</button>)}</div>
      <div className="flex flex-wrap items-end gap-3"><label className="text-xs text-[var(--muted-foreground)]">시작일<input type="date" aria-label="매출 시작일" value={start} disabled={busy} onChange={e=>range(e.target.value,end)} className="block mt-1 min-h-11 rounded-xl border px-3 text-sm bg-[var(--card)]"/></label><label className="text-xs text-[var(--muted-foreground)]">종료일<input type="date" aria-label="매출 종료일" value={end} disabled={busy} onChange={e=>range(start,e.target.value)} className="block mt-1 min-h-11 rounded-xl border px-3 text-sm bg-[var(--card)]"/></label><button disabled={busy} onClick={load} className="min-h-11 px-5 rounded-xl font-bold text-sm flex items-center gap-2 bg-[var(--primary)] text-[var(--primary-foreground)] disabled:opacity-50"><Search size={16}/>{busy?'조회 중…':'매출 조회'}</button></div>
      <p className="break-keep text-xs leading-relaxed text-[var(--muted-foreground)]">한국시간 주문 접수일 기준 · 선택 기간의 네이버 동기화 주문을 모두 조회합니다.</p></section>
    {error && <p role="alert" className="rounded-xl border p-4 text-sm text-[var(--destructive)]" style={panel}>{error}</p>}
    {!result&&!busy&&!error && <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">기간을 선택하고 매출을 조회하세요.</p>}
    {result && <><section className="rounded-2xl border p-5 sm:p-6" style={panel}><p className="text-sm text-[var(--muted-foreground)]">{result.start} ~ {result.end} · 상품주문 결제금액</p><div className="flex flex-wrap items-end gap-3 mt-2"><strong className="text-2xl sm:text-3xl font-bold text-[var(--primary)]">{money(result.total)}</strong><span className="text-sm text-[var(--muted-foreground)]">{result.missing ? `확인된 금액만 · ${result.missing}건 금액 미확인` : `${result.products}개 상품주문`}</span></div><p className="break-keep text-sm leading-relaxed mt-3 text-[var(--muted-foreground)]">네이버가 제공한 잔여 결제금액을 우선 사용합니다. 배송비·수수료·정산액은 따로 합산하지 않으며, 동기화 누락이나 반품 진행에 따라 달라질 수 있습니다.</p><div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-sm"><span>결제 주문 <b>{result.paidOrders}건</b></span><span>미결제 제외 <b>{result.unpaid}건</b></span><span>취소·반품 확인 <b>{result.claims+result.canceledCount}건</b></span></div>
      {(result.initial>0||result.missing>0) && <p className="mt-3 text-sm rounded-xl px-3 py-2 bg-amber-500/10 text-amber-700">{result.initial>0 && `잔여금액이 없어 최초 결제금액을 사용한 상품 ${result.initial}건. `}{result.missing>0 && `금액을 확인할 수 없는 ${result.missing}건은 합계에서 제외했습니다. `}정확한 정산은 네이버 정산·부가세 내역에서 확인해주세요.</p>}</section>
      <div className="flex flex-wrap justify-between gap-2 text-sm text-[var(--muted-foreground)]"><strong>일자별 내역</strong><span>조회 {result.checkedAt.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</span></div>
      {result.days.length ? <ul className="rounded-2xl border overflow-hidden" style={panel}>{result.days.map(row=><li key={row.date} className="flex flex-wrap justify-between items-center gap-2 px-4 py-4 border-b last:border-b-0" style={{borderColor:'var(--border)'}}><div><strong>{row.date}</strong><p className="text-xs mt-1 text-[var(--muted-foreground)]">결제 주문 {row.orders}건{row.missing ? ` · 금액 미확인 ${row.missing}건` : ''}</p></div><strong className="text-[var(--primary)]">{money(row.total)}</strong></li>)}</ul> : <p className="rounded-2xl border p-8 text-center text-sm" style={panel}>선택한 기간에 조회된 네이버 주문이 없습니다.</p>}
    </>}
  </main></div>;
}
