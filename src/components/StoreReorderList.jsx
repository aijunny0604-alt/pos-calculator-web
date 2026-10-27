import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { downloadCSV } from '@/lib/purchaseExport';

import { validReorderQuantity, recommendReorder, recentProductSales } from '@/lib/storeReorder';
import { supabase } from '@/lib/supabase';

function Recommendation({ row, apply }) {
  const [open, setOpen] = useState(false), [sales, setSales] = useState(''), [stock, setStock] = useState(''), [incoming, setIncoming] = useState(''), [days, setDays] = useState('30');
  const [dataset, setDataset] = useState(null), [productId, setProductId] = useState(''), [notice, setNotice] = useState(''), [loading, setLoading] = useState(false);
  const load = async () => { setLoading(true); setNotice(''); try { const [products, orders] = await Promise.all([supabase.getProducts(), supabase.getOrders()]); if (!Array.isArray(products) || !Array.isArray(orders)) throw new Error(); setDataset({ products, orders }); } catch { setNotice('매장 상품·주문 정보를 불러오지 못했습니다. 확인한 값을 직접 입력할 수 있습니다.'); } finally { setLoading(false); } };
  const choose = id => {
    setProductId(id); setSales(''); setStock('');
    const product = dataset?.products.find(p => String(p.id) === id);
    if (!product) { setNotice(''); return; }
    const recent = recentProductSales(dataset.orders, product.id), inventory = product.stock;
    if (recent && !recent.uncertain) setSales(String(recent.quantity));
    if (inventory !== null && inventory !== undefined && String(inventory).trim() !== '' && Number.isInteger(Number(inventory)) && Number(inventory) >= 0) setStock(String(inventory));
    setNotice(`선택한 매장 상품의 최근 30일 주문량과 재고입니다.${recent?.skippedReturns ? ` 반품이 있는 주문 ${recent.skippedReturns}건은 제외했으니 직접 확인하세요.` : ''}${recent?.uncertain ? ' 주문 수량 확인이 필요해 판매량을 자동 입력하지 않았습니다.' : ''} 네이버 옵션과 같은 품목인지 확인하세요.`);
  };
  const result = recommendReorder({ sales, stock, incoming, days });
  const field = (label, value, set) => <label className="text-xs font-semibold flex-1 min-w-[115px]">{label}<input type="number" min="0" max="999999" step="1" value={value} onChange={e => set(e.target.value)} placeholder="확인 후 입력" className="block w-full min-h-11 rounded-xl border px-3 mt-1 text-base font-normal" /></label>;
  return <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}><button aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-11 text-sm font-bold" style={{ color: 'var(--primary)' }}>{open ? '추천 계산 접기' : '재주문 수량 추천'}</button>{open && <><p className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>해당 옵션과 연결된 실제 품목 기준으로 확인해주세요. 매장과 네이버 재고는 중복 합산하지 않습니다.</p><div className="flex flex-wrap gap-2 items-end">{!dataset ? <button disabled={loading} onClick={load} className="min-h-11 px-3 border rounded-xl text-sm" style={{ background: 'var(--card)', color: 'var(--primary)' }}>{loading ? '불러오는 중…' : '매장 상품·판매량 불러오기'}</button> : <label className="text-xs font-semibold flex-1 min-w-[180px]">일치하는 매장 상품 직접 선택<select value={productId} onChange={e => choose(e.target.value)} className="block w-full min-h-11 rounded-xl border px-3 mt-1 text-sm"><option value="">상품 선택</option>{dataset.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}</div>{notice && <p className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{notice}</p>}<div className="flex flex-wrap gap-3">{field('최근 30일 판매량', sales, setSales)}{field('매장 실재고', stock, setStock)}{field('확인한 미입고 발주량', incoming, setIncoming)}<label className="text-xs font-semibold">확보 기간<select value={days} onChange={e => setDays(e.target.value)} className="block min-h-11 rounded-xl border px-3 mt-1 text-sm">{[14, 30, 60, 90].map(n => <option key={n} value={n}>{n}일</option>)}</select></label></div><div className="flex flex-wrap items-center gap-3"><p className="text-sm">추천 수량 <strong className="text-lg" style={{ color: 'var(--primary)' }}>{result === null ? '확인 필요' : `${result.toLocaleString('ko-KR')}개`}</strong></p><button disabled={result === null || result === 0 || result > 999999 || row.ordered} onClick={() => apply(String(result))} className="min-h-11 px-3 rounded-xl border text-sm font-semibold disabled:opacity-40" style={{ color: 'var(--primary)' }}>발주 수량에 적용</button></div><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>최근 30일 주문량 × 확보 기간 − 실재고 − 미입고. 반품·예정 수요·발주 단위는 별도로 확인하세요. 실제 발주되지는 않습니다.</p></>}</div>;
}

export default function StoreReorderList({ rows, update }) {
  const [removed, setRemoved] = useState(null);
  const remove = row => { if (update(rows.filter(r => r.key !== row.key))) setRemoved(row); };
  const undo = () => { if (rows.some(r => r.key === removed.key) || update([...rows, removed])) setRemoved(null); };
  const [filter, setFilter] = useState('pending');
  const [query, setQuery] = useState('');
  const shown = rows.filter(r => (filter === 'all' || (r.ordered ? 'ordered' : 'pending') === filter) && `${r.name} ${r.option || ''} ${r.note || ''}`.toLowerCase().includes(query.toLowerCase().trim()));
  const change = (key, field, value) => update(rows.map(r => r.key === key ? { ...r, [field]: value } : r));
  const exportRows = () => {
    const cell = v => `"${String(v ?? '').replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""')}"`;
    const lines = [['상품번호', '상품', '옵션', '발주 수량', '처리', '메모'], ...shown.map(r => [r.productId, r.name, r.option || '상품 단위', r.quantity || '미입력', r.ordered ? '발주 완료' : '발주 준비', r.note || ''])];
    downloadCSV('\uFEFF' + lines.map(r => r.map(cell).join(',')).join('\r\n'), '네이버_재주문_목록.csv');
  };
  return <section className="space-y-4">
    <div><h2 className="text-xl font-bold">재주문 목록 <span style={{ color: 'var(--primary)' }}>{rows.filter(r => !r.ordered).length}</span></h2><p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>이 브라우저에 자동 저장됩니다. 실제 발주를 전송하지 않으며, 다른 기기와 공유할 때는 CSV를 이용하세요.</p></div>
    <div className="flex flex-wrap gap-2"><input aria-label="재주문 검색" value={query} onChange={e => setQuery(e.target.value)} placeholder="상품 · 옵션 · 메모 검색" className="min-h-11 px-3 flex-1 min-w-[160px] border rounded-xl" /><select aria-label="재주문 상태" value={filter} onChange={e => setFilter(e.target.value)} className="min-h-11 px-3 border rounded-xl"><option value="pending">발주 준비</option><option value="ordered">발주 완료</option><option value="all">전체</option></select><button disabled={!shown.length} onClick={exportRows} className="min-h-11 px-3 border rounded-xl flex items-center gap-2"><Download size={16} />CSV</button></div>
    {removed && <div role="status" className="flex items-center justify-between gap-3 rounded-xl border px-4 py-2 text-sm" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}><span>목록에서 제거했습니다.</span><button onClick={undo} className="min-h-11 font-semibold" style={{ color: 'var(--primary)' }}>실행 취소</button></div>}
    <ul className="border rounded-2xl overflow-hidden" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>{shown.map(row => <li key={row.key} className="p-4 border-b last:border-0 space-y-3" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-start gap-3"><div className="flex-1 min-w-0"><h3 className="text-base font-bold break-words">{row.name}</h3><p className="text-sm mt-1 break-words" style={{ color: 'var(--primary)' }}>{row.option || '상품 단위 · 규격 확인 필요'}</p><p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>#{row.productId}</p></div><button aria-label={`${row.name} 재주문 목록에서 제거`} onClick={() => remove(row)} className="min-w-11 min-h-11 grid place-items-center" style={{ color: 'var(--destructive)' }}><Trash2 size={17} /></button></div>
      <div className="flex flex-wrap gap-3 items-end"><label className="text-xs font-semibold">발주 수량<input aria-label={`${row.name} 발주 수량`} type="number" min="1" max="999999" step="1" value={row.quantity} placeholder="미입력" onChange={e => { const value = e.target.value; if (value === '' || validReorderQuantity(value)) change(row.key, 'quantity', value); }} className="block min-h-11 w-28 rounded-xl border px-3 mt-1 text-lg font-bold" /></label><label className="text-xs font-semibold flex-1 min-w-[150px]">메모<input aria-label={`${row.name} 발주 메모`} value={row.note || ''} maxLength={500} placeholder="매입처 · 확인할 내용" onChange={e => change(row.key, 'note', e.target.value)} className="block w-full min-h-11 rounded-xl border px-3 mt-1 text-sm font-normal" /></label><button disabled={!row.ordered && !validReorderQuantity(row.quantity)} onClick={() => change(row.key, 'ordered', !row.ordered)} className="min-h-11 px-4 border rounded-xl text-sm font-semibold disabled:opacity-40" style={{ color: 'var(--primary)' }}>{row.ordered ? '발주 완료 · 되돌리기' : '발주 완료로 표시'}</button></div>
      <Recommendation row={row} apply={value => change(row.key, 'quantity', value)} />
    </li>)}</ul>
    {!shown.length && <p className="py-10 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>표시할 재주문 항목이 없습니다. 상품 상세에서 필요한 상품·옵션을 담아주세요.</p>}
  </section>;
}
