import { isStoreAwaitingDispatch } from '../lib/storeOrderView';
import {storeShippingDetails,shippingDate} from '../lib/storeShippingDetails';
export default function StoreShippingDetails({order,items=[]}) {
  const rows=storeShippingDetails(order,items);
  return <section className="rounded-xl border p-3 space-y-3 min-w-0" style={{borderColor:'var(--border)',background:'var(--muted)',color:'var(--foreground)'}} aria-label="상품별 발송 상세">
    <div className="flex flex-wrap items-center gap-2"><h4 className="font-bold text-sm">상품별 발송 상세</h4><span className="text-xs" style={{color:'var(--muted-foreground)'}}>마지막 동기화 자료 기준</span></div>
    {rows.map(row=><div key={row.id} className="rounded-lg p-3 min-w-0 space-y-2" style={{background:'var(--card)'}}>
      <div className="flex flex-wrap items-center gap-2"><b className="text-sm break-words min-w-0 flex-1">{row.name}</b><span className="text-xs font-semibold">{row.status}</span></div>
      <div className="flex flex-wrap gap-2 text-xs font-bold">
        {row.delayed&&<span className="px-2 py-1 rounded-md" style={{background:'rgba(245,158,11,.15)',color:'var(--foreground)'}}>{row.done?'발송 지연 이력':'발송 지연 처리됨'}</span>}
        {row.overdue&&<span className="px-2 py-1 rounded-md" style={{background:'rgba(239,68,68,.12)',color:'var(--destructive)'}}>발송 기한 초과</span>}
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        {[['발송 기한',shippingDate(row.due)],['발주 상태',row.placeStatus],['발주확인 일시',shippingDate(row.confirmed)],...(row.dispatched?[['발송 일시',shippingDate(row.dispatched)]]:[]),...(row.delayed?[['지연 사유',row.reason]]:[]),...(row.claim?[['클레임 상태',row.claim]]:[])].filter(([,value])=>value && !String(value).startsWith('미제공')).map(([label,value])=><div key={label} className="min-w-0"><dt className="text-xs" style={{color:'var(--muted-foreground)'}}>{label}</dt><dd className="mt-0.5 break-words">{value}</dd></div>)}
      </dl>
      {row.detail&&<p className="text-sm whitespace-pre-wrap break-words rounded-lg p-2" style={{background:'var(--muted)'}}>{row.detail}</p>}
    </div>)}
    {isStoreAwaitingDispatch(order,items)&&(order.needs_naver_dispatch||order.needs_naver_confirm)&&<p className="text-xs">POS 처리 요청 대기 · 네이버 반영 전{order.naver_dispatch_next_retry_at?` · 다음 재시도 ${shippingDate(order.naver_dispatch_next_retry_at)}`:''}</p>}
  </section>;
}
