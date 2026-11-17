import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, PackageSearch } from 'lucide-react';
import { supabase, supabaseClient } from '@/lib/supabase';
import SupplierModal from '@/components/purchase/SupplierModal';
import { SOLD_OUT_ALERT_KEY, readSoldOutState, updateSoldOutState, writeSoldOutState } from '@/lib/storeSoldOutAlerts';

// 스토어 화면을 떠나도 같은 브라우저에서 마지막 확인 상태와 미확인 알림을 보존한다.
export function useStoreSoldOutAlerts() {
  const stateRef = useRef(null);
  if (!stateRef.current) stateRef.current = readSoldOutState();
  const [pending, setPending] = useState(() => stateRef.current.pending);
  const [failed, setFailed] = useState(false);
  const [checkedAt, setCheckedAt] = useState(null);
  const alive = useRef(false), running = useRef(false);
  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const rows = await supabase.getStoreCatalog();
      if (!Array.isArray(rows)) throw new Error('상품 목록 조회 실패');
      if (!alive.current) return;
      const next = updateSoldOutState(stateRef.current, rows);
      stateRef.current = next;
      writeSoldOutState(next);
      setPending(next.pending);
      setCheckedAt(new Date());
      setFailed(false);
    } catch { if (alive.current) setFailed(true); }
    finally { running.current = false; }
  }, []);
  useEffect(() => {
    alive.current = true;
    refresh();
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 30000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    let realtimeTimer;
    const onCatalogChanged = () => { clearTimeout(realtimeTimer); realtimeTimer = setTimeout(refresh, 1200); };
    const channel = supabaseClient.channel('store-sold-out-alerts')
      .on('postgres_changes', { event:'*', schema:'public', table:'external_products' }, onCatalogChanged)
      .subscribe();
    const onStorage = event => {
      if (event.key !== SOLD_OUT_ALERT_KEY && event.key !== null) return;
      stateRef.current = readSoldOutState();
      setPending(stateRef.current.pending);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('storage', onStorage);
    window.addEventListener('store-catalog-changed', onCatalogChanged);
    return () => { alive.current = false; clearInterval(timer); clearTimeout(realtimeTimer); supabaseClient.removeChannel(channel); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('storage', onStorage); window.removeEventListener('store-catalog-changed', onCatalogChanged); };
  }, [refresh]);
  const acknowledge = useCallback(() => {
    const next = { ...stateRef.current, pending: [] };
    stateRef.current = next;
    writeSoldOutState(next);
    setPending([]);
  }, []);
  return { pending, failed, checkedAt, refresh, acknowledge };
}

export default function StoreSoldOutAlerts({ monitor, onOpenCatalog }) {
  const [open, setOpen] = useState(false);
  const count = monitor.pending.length;
  useEffect(() => {
    if (!count) { setOpen(false); return; }
    if (open) return;
    const showWhenClear = () => {
      if (!document.querySelector('[role="dialog"], .motion-modal-backdrop, .move-dialog-backdrop')) setOpen(true);
    };
    showWhenClear();
    const observer = new MutationObserver(showWhenClear);
    observer.observe(document.body, { childList:true, subtree:true });
    return () => observer.disconnect();
  }, [count, open]);
  const close = () => { setOpen(false); monitor.acknowledge(); };
  return <>
    <div role={monitor.failed ? 'alert' : 'status'} className="mx-3 sm:mx-4 my-2 rounded-xl border px-3 py-2 flex items-center gap-2 flex-wrap text-sm" style={{ background:'var(--card)', borderColor:(count > 0 || monitor.failed) ? 'var(--warning)' : 'var(--border)' }}>
      <AlertTriangle className="w-4 h-4 shrink-0" style={{ color:(count > 0 || monitor.failed) ? 'var(--warning)' : 'var(--primary)' }} aria-hidden="true" />
      <span className="flex-1 min-w-0">{monitor.failed ? '품절 감시 자료를 새로 확인하지 못했습니다.' : count > 0 ? `새 품절 ${count}건을 확인해주세요.` : monitor.checkedAt ? `품절 감시 중 · 마지막 확인 ${monitor.checkedAt.toLocaleTimeString('ko-KR')} · 네이버 동기화 자료 기준` : '품절 감시 자료 확인 중'}</span>
      {count > 0 && <button type="button" className="min-h-11 px-3 font-semibold" style={{ color:'var(--primary)' }} onClick={() => setOpen(true)}>확인하기</button>}
      <button type="button" className="min-h-11 px-3 font-semibold" style={{ color:'var(--primary)' }} onClick={monitor.refresh}>{monitor.failed ? '다시 확인' : '지금 확인'}</button>
    </div>
    {open && count > 0 && <SupplierModal title="새로 품절된 상품" subtitle="마지막 확인 이후 동기화된 네이버 상품·옵션" onClose={close} compact closeOnBackdrop={false} footer={<>
      <button type="button" onClick={close} className="min-h-11 px-4 rounded-xl border font-semibold" style={{ borderColor:'var(--border)' }}>확인</button>
      <button type="button" onClick={() => { close(); onOpenCatalog(); }} className="min-h-11 px-4 rounded-xl font-semibold text-white inline-flex items-center gap-2" style={{ background:'var(--primary)' }}><PackageSearch size={17} />품절 상품 보기</button>
    </>}>
      <p className="text-sm mb-4" style={{ color:'var(--muted-foreground)' }}>네이버 동기화 자료 기준입니다. 재고 변경 전 상품의 현재 상태를 확인해주세요.</p>
      <ul className="space-y-2" aria-label="새 품절 목록">{monitor.pending.map(item => <li key={item.key} className="rounded-xl border p-3" style={{ borderColor:'var(--border)', background:'var(--muted)' }}>
        <span className="text-xs font-bold" style={{ color:'var(--warning)' }}>{item.kind === 'option' ? '옵션 품절' : '상품 품절'}</span>
        <p className="mt-1 font-semibold break-words">{item.name}</p>
        {item.option && <p className="mt-1 text-sm break-words" style={{ color:'var(--muted-foreground)' }}>{item.option}</p>}
      </li>)}</ul>
    </SupplierModal>}
  </>;
}
