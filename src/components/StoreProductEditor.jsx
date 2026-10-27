import { useEffect, useState } from 'react';
import { productRequest } from '@/lib/storeProduct';
import StoreMobilePair from '@/components/StoreMobilePair';

const labels = { SALE: '판매중', OUTOFSTOCK: '품절', SUSPENSION: '판매중지', WAIT: '판매 대기' };
const button = 'min-h-11 rounded-xl border px-3 text-sm font-semibold disabled:opacity-40';
export default function StoreProductEditor({ product, onChanged, onBusyChange }) {
  const [snapshot, setSnapshot] = useState(null), [pending, setPending] = useState(null);
  const [selected, setSelected] = useState(''), [stock, setStock] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  const origin = String(product.origin_product_no || ''), channel = String(product.channel_product_no || '');
  const read = async () => {
    setBusy(true); setError(''); setPending(null);
    try { const value = await productRequest('product-snapshot', { params: { origin, channel } }); setSnapshot(value); setSelected(''); setStock(''); }
    catch (e) { setSnapshot(null); setError(e.message); }
    finally { setBusy(false); }
  };
  const prepare = async change => {
    setBusy(true); setError(''); setPending(null);
    try { setPending(await productRequest('product-change/prepare', { data: { origin, channel, fingerprint: JSON.stringify(snapshot), change } })); }
    catch (e) { setError(e.message); setSnapshot(null); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true); setError('');
    try { const result = await productRequest('product-change/confirm', { data: { preview: pending.preview } }); setSnapshot(result.snapshot); setSelected(''); setStock(''); onChanged?.(); }
    catch (e) { setError(e.message); setSnapshot(null); }
    finally { setBusy(false); setPending(null); }
  };
  const option = snapshot?.options.find(o => `${o.type}:${o.id}` === selected);
  const valid = /^\d+$/.test(stock) && Number(stock) <= 99999999;
  return <section className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
    <div className="flex flex-wrap justify-between items-center gap-2"><div><h3 className="font-bold">네이버 실시간 변경</h3><p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>변경 전 네이버 원본을 조회하고 확인 후 적용합니다.</p></div><button disabled={busy || !origin} onClick={read} className={button} style={{ color: 'var(--primary)' }}>{busy ? '처리 중…' : '현재 상태 조회'}</button></div>
    <StoreMobilePair />
    {!origin && <p className="text-sm" style={{ color: 'var(--warning)' }}>원상품 번호가 없습니다. 상품 동기화 후 다시 확인해주세요.</p>}
    {error && <p role="alert" className="text-sm" style={{ color: 'var(--destructive)' }}>{error}</p>}
    {snapshot && <>
      <p className="text-sm break-words">네이버 현재 상품: <strong>{snapshot.name || '이름 미확인'}</strong> · {labels[snapshot.status] || snapshot.status} · 상품 재고 {snapshot.stock.toLocaleString('ko-KR')}개</p>
      <div className="flex flex-wrap gap-2"><button disabled={busy || !['SALE', 'OUTOFSTOCK', 'WAIT'].includes(snapshot.status)} onClick={() => prepare({ kind: 'status', status: 'SUSPENSION' })} className={button}>판매 중지</button><button disabled={busy || !['SUSPENSION', 'OUTOFSTOCK'].includes(snapshot.status) || snapshot.stock <= 0} onClick={() => prepare({ kind: 'status', status: 'SALE' })} className={button}>판매 재개</button></div>
      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>재고가 0이면 판매 재개할 수 없습니다. 옵션 재고 변경 후 현재 상태를 다시 조회하거나 네이버 관리자에서 재고를 확인해주세요.</p>
      {!!snapshot.options.length && <div className="flex flex-wrap gap-2 items-end"><label className="text-xs font-semibold flex-1 min-w-[180px]">옵션<select aria-label="변경할 옵션" value={selected} onChange={e => { setSelected(e.target.value); setStock(''); setPending(null); }} className="block w-full min-h-11 border rounded-xl px-3 mt-1 text-sm"><option value="">옵션 선택</option>{snapshot.options.map(o => <option key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`}>{o.name || '이름 미확인'} · {Number.isInteger(o.stock) ? `${o.stock}개` : '재고 미확인'}</option>)}</select></label><label className="text-xs font-semibold">변경 재고<input aria-label="변경할 재고 수량" type="number" min="0" max="99999999" step="1" value={stock} onChange={e => { setStock(e.target.value); setPending(null); }} className="block min-h-11 w-28 border rounded-xl px-3 mt-1 text-base" /></label><button disabled={busy || !option || !valid} onClick={() => prepare({ kind: 'option', optionId: option.id, optionType: option.type, stock: Number(stock) })} className={button} style={{ color: 'var(--primary)' }}>변경 확인</button></div>}
      {option && <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>현재 {option.stock}개 · {option.usable === false ? '사용 안 함' : option.usable === true ? '사용 중' : '사용 여부 미확인'}{option.type === 'combination' ? ` · 옵션가 ${option.price ?? '미확인'}원` : ''}. 옵션가와 사용 여부는 유지합니다.</p>}
    </>}
    {pending && <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--warning)', background: 'color-mix(in srgb, var(--warning) 8%, var(--card))' }}><p className="font-bold">네이버에 적용할까요?</p><p className="text-sm break-words">{snapshot?.name || '이름 미확인'} · {pending.description.replaceAll('SUSPENSION', '판매중지').replaceAll('OUTOFSTOCK', '품절').replaceAll('SALE', '판매중').replaceAll('WAIT', '판매 대기')}</p><p className="text-xs">확인 유효시간 60초 · 적용 전 상태가 바뀌면 중단됩니다. 옵션 재고에 따라 상품의 품절 상태가 달라질 수 있습니다.</p><div className="flex gap-2"><button disabled={busy} onClick={() => setPending(null)} className={button}>취소</button><button disabled={busy} onClick={confirm} className={`${button} text-white`} style={{ background: 'var(--primary)' }}>{busy ? '적용 중…' : '네이버에 적용'}</button></div></div>}
  </section>;
}
