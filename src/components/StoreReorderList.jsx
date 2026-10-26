import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { downloadCSV } from '@/lib/purchaseExport';

import { validReorderQuantity } from '@/lib/storeReorder';

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
    </li>)}</ul>
    {!shown.length && <p className="py-10 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>표시할 재주문 항목이 없습니다. 상품 상세에서 필요한 상품·옵션을 담아주세요.</p>}
  </section>;
}
