import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Search, RefreshCw, Download, ExternalLink, PackageSearch, ChevronRight, Clock, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import SupplierModal from '@/components/purchase/SupplierModal';
import StoreReorderList from '@/components/StoreReorderList';
import { REORDER_KEY, readReorders, reorderKey, makeReorder, appendShortages } from '@/lib/storeReorder';
import { downloadCSV } from '@/lib/purchaseExport';
import { CATALOG_STATES, catalogState, catalogSourceStatus, catalogOptions, soldOutOptions, optionStock, catalogOld, catalogUrl, filterCatalog, catalogCounts, catalogCSV } from '@/lib/storeCatalog';

const date = value => {
  const parsed = new Date(value);
  return value && Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '시각 미확인';
};
const money = value => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) ? `${Number(value).toLocaleString('ko-KR')}원` : '미확인';
const panel = { background: 'var(--card)', borderColor: 'var(--border)' };
const muted = { color: 'var(--muted-foreground)' };
const button = 'min-h-11 px-3 rounded-xl border text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors hover:bg-[var(--accent)]';
function Badge({ row }) {
  const state = CATALOG_STATES[catalogState(row)];
  return <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap" style={{ color: state.color, background: `color-mix(in srgb, ${state.color} 10%, transparent)` }}>{state.label}</span>;
}

export default function StoreCatalog({ onBack, onSync, syncing, showToast }) {
  const [rows, setRows] = useState([]);
  const [view, setView] = useState('catalog');
  const [reorders, setReorders] = useState(readReorders);
  useEffect(() => {
    const onStorage = event => { if (event.key === REORDER_KEY || event.key === null) setReorders(readReorders()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const updateReorders = next => {
    try { localStorage.setItem(REORDER_KEY, JSON.stringify(next)); setReorders(next); return true; }
    catch { showToast?.('재주문 목록을 저장하지 못했습니다. 브라우저 저장 공간을 확인해주세요.', 'error'); return false; }
  };
  const addReorder = (row, option = null) => {
    const key = reorderKey(row, option);
    if (reorders.some(r => r.key === key)) { showToast?.('이미 재주문 목록에 담긴 항목입니다', 'info'); return; }
    updateReorders([...reorders, makeReorder(row, option)]);
  };
  const addVisibleShortages = () => {
    if (updateReorders(appendShortages(reorders, results))) setView('reorders');
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('attention');
  const [visible, setVisible] = useState(40);
  const [selectedId, setSelectedId] = useState(null);
  const [optionQuery, setOptionQuery] = useState('');
  const [zeroOnly, setZeroOnly] = useState(false);
  const [requestNote, setRequestNote] = useState(false);
  const alive = useRef(false);
  const fetching = useRef(false);
  const load = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    setLoading(true);
    try {
      const data = await supabase.getStoreCatalog();
      if (alive.current) { setRows(data); setError(false); }
    } catch { if (alive.current) setError(true); }
    finally { fetching.current = false; if (alive.current) setLoading(false); }
  }, []);
  useEffect(() => {
    alive.current = true;
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => { alive.current = false; clearInterval(timer); };
  }, [load]);
  useEffect(() => { setVisible(40); }, [query, filter]);
  const counts = useMemo(() => catalogCounts(rows), [rows]);
  const results = useMemo(() => filterCatalog(rows, query, filter), [rows, query, filter]);
  const selected = rows.find(row => String(row.channel_product_no) === selectedId);
  const times = rows.map(r => Date.parse(r.synced_at)).filter(Number.isFinite);
  const oldest = times.length ? Math.min(...times) : null;
  const newest = times.length ? Math.max(...times) : null;
  const stale = rows.filter(r => catalogOld(r)).length;
  const options = selected ? catalogOptions(selected).filter(o => (!zeroOnly || (o.usable !== false && optionStock(o) === 0)) && String(o.name || '').toLowerCase().includes(optionQuery.toLowerCase().trim())) : [];
  const choose = row => { setSelectedId(String(row.channel_product_no)); setOptionQuery(''); setZeroOnly(catalogState(row) === 'options'); };
  const exportCSV = () => {
    downloadCSV(catalogCSV(results), `네이버_상품관리_${new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })}.csv`);
    showToast?.(`조회 상품 ${results.length}개의 옵션 포함 목록을 저장했습니다`, 'success');
  };
  return <div className="h-full min-h-0 flex flex-col" style={{ background: 'var(--background)' }}>
    <header className="shrink-0 flex flex-wrap items-center gap-3 px-4 sm:px-6 py-4 border-b" style={panel}>
      <button onClick={onBack} className={button} style={panel}><ArrowLeft size={18} />주문 관리</button>
      <div className="flex-1 min-w-0"><h1 className="text-xl sm:text-2xl font-bold">스토어 상품·품절 관리</h1><p className="text-xs mt-1" style={muted}>네이버 재고 기준 · 매장 실물 재고와 별도</p></div>
    </header>
    <main className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">
      <div className="flex gap-2" aria-label="상품 관리 보기"><button aria-pressed={view === 'catalog'} onClick={() => setView('catalog')} className={button} style={{ ...panel, color: view === 'catalog' ? 'var(--primary)' : 'var(--muted-foreground)' }}>품절·상품 목록</button><button aria-pressed={view === 'reorders'} onClick={() => setView('reorders')} className={button} style={{ ...panel, color: view === 'reorders' ? 'var(--primary)' : 'var(--muted-foreground)' }}>재주문 목록 {reorders.filter(r => !r.ordered).length}</button></div>
      {view === 'reorders' ? <StoreReorderList rows={reorders} update={updateReorders} /> : <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs leading-relaxed" style={muted}>
          <p className="flex items-center gap-1.5"><Clock size={14} />상품별 동기화 {rows.length ? `${date(oldest)} ~ ${date(newest)} (한국시간)` : loading ? '확인 중' : '자료 없음'}</p>
          <p className="mt-1">연동 자료를 30초마다 확인합니다. 재고·판매 상태 변경은 네이버 관리자에서 진행하세요.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={load} disabled={loading} className={button} style={panel}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />{loading ? '조회 중' : '새로고침'}</button>
          <button onClick={async () => { const ok = await onSync(); if (ok) setRequestNote(true); }} disabled={syncing} className={button} style={{ ...panel, color: 'var(--primary)' }}><RefreshCw size={16} />상품 동기화 요청</button>
        </div>
      </div>
      {requestNote && <p role="status" className="text-sm rounded-xl border p-3" style={{ ...panel, color: 'var(--primary)' }}>동기화를 요청했습니다. 매장 PC에서 처리한 자료가 들어오면 목록이 갱신됩니다. 상품별 동기화 시각을 확인해주세요.</p>}
      {error && <div role="alert" className="rounded-xl border p-4 text-sm" style={{ ...panel, borderColor: 'var(--destructive)' }}>상품 정보를 불러오지 못했습니다. {rows.length ? '이전 조회 자료를 표시하고 있습니다.' : '품절 0건으로 확인된 것이 아닙니다.'} <button onClick={load} className="underline min-h-11 px-2">다시 시도</button></div>}
      {!!stale && <p className="text-xs flex items-center gap-2" style={{ color: 'var(--warning)' }}><Clock size={15} />{stale}개 상품은 동기화가 24시간 이상 지났거나 시각이 없습니다. 최신 상태를 확인해주세요.</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3" aria-label="상품 상태 요약">
        {['attention', 'soldout', 'options', 'suspended'].map(key => {
          const state = CATALOG_STATES[key] || { label: '품절 확인 필요', color: 'var(--primary)' };
          return <button key={key} aria-pressed={filter === key} onClick={() => setFilter(filter === key ? 'all' : key)} className="text-left rounded-2xl border p-3 sm:p-4 transition-colors" style={{ ...panel, borderColor: filter === key ? state.color : 'var(--border)', background: filter === key ? `color-mix(in srgb, ${state.color} 7%, var(--card))` : 'var(--card)' }}>
            <span className="text-sm font-semibold" style={muted}>{state.label}</span><div className="mt-2 text-2xl font-bold tabular-nums" style={{ color: state.color }}>{loading && !rows.length || error && !rows.length ? '—' : counts[key]}<span className="text-xs ml-1 font-medium">상품</span></div>
            <p className="text-xs mt-1" style={muted}>{key === 'options' ? `사용 중 옵션 재고 0 · ${counts.zeroOptions}개` : key === 'attention' ? '상품 품절 + 옵션 품절' : key === 'soldout' ? '네이버 품절 상태' : '품절과 별도 구분'}</p>
          </button>;
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-3.5" size={17} style={muted} /><input aria-label="스토어 상품 검색" value={query} onChange={e => setQuery(e.target.value)} placeholder="상품명 · 옵션 · 상품번호 · 관리코드 검색" className="w-full min-h-11 pl-10 pr-10 rounded-xl border text-sm" style={panel} />{query && <button aria-label="검색 지우기" onClick={() => setQuery('')} className="absolute right-0 top-0 min-h-11 min-w-11 grid place-items-center"><X size={16} /></button>}</div>
        <select aria-label="상품 상태 필터" value={filter} onChange={e => setFilter(e.target.value)} className="min-h-11 px-3 rounded-xl border text-sm" style={panel}>
          <option value="attention">품절 확인 필요 ({counts.attention})</option><option value="all">전체 ({counts.all})</option>
          {Object.entries(CATALOG_STATES).map(([key, state]) => <option key={key} value={key}>{state.label} ({counts[key]})</option>)}
        </select>
        <button disabled={!results.length || loading} onClick={exportCSV} className={button} style={panel}><Download size={16} />CSV</button>
        <button disabled={loading || !results.some(r => ['soldout', 'options'].includes(catalogState(r)))} onClick={addVisibleShortages} className={`${button} disabled:opacity-40`} style={{ ...panel, color: 'var(--primary)' }}>조회 품절 재주문 담기</button>
      </div>
      <div className="flex justify-between gap-2 text-xs" style={muted}><span>조회 {results.length}개 상품</span><span>행을 누르면 옵션별 재고 확인</span></div>
      {loading && !rows.length ? <p role="status" className="py-12 text-center" style={muted}>상품 정보를 불러오는 중입니다…</p> : !results.length ? <div className="rounded-2xl border p-10 text-center" style={panel}><PackageSearch className="mx-auto mb-3" size={30} style={muted} /><p>{error ? '조회 상태를 확인해주세요' : !rows.length ? '동기화된 상품이 없습니다' : '조건에 맞는 상품이 없습니다'}</p><button className="min-h-11 mt-2 text-sm underline" onClick={() => { setQuery(''); setFilter('all'); }}>전체 상품 보기</button></div> :
      <div className="rounded-2xl border overflow-hidden" style={panel}>
        <div aria-hidden="true" className="hidden lg:grid grid-cols-[minmax(0,1fr)_120px_130px_120px_24px] gap-4 px-5 py-3 text-xs font-semibold" style={{ background: 'var(--muted)', ...muted }}><span>상품 / 품절 옵션</span><span>상태</span><span>옵션 재고 0</span><span className="text-right">판매가</span><span /></div>
        <ul aria-label="스토어 상품 목록">{results.slice(0, visible).map(row => {
          const zeros = soldOutOptions(row);
          const state = catalogState(row);
          return <li key={row.channel_product_no} className="border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}><button onClick={() => choose(row)} aria-label={`${row.name} 옵션 상세`} className="w-full grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_120px_130px_120px_24px] gap-3 lg:gap-4 items-center text-left px-4 sm:px-5 py-4 hover:bg-[var(--accent)] transition-colors">
            <div className="col-span-2 lg:col-span-1 min-w-0"><h2 className="font-bold text-base break-words leading-relaxed">{row.name}</h2><p className="text-xs mt-1 break-words" style={muted}>#{row.channel_product_no}{row.seller_management_code ? ` · ${row.seller_management_code}` : ''}</p>
              {state === 'options' && <p className="text-sm mt-2 line-clamp-2 break-words" style={{ color: 'var(--warning)' }}>{zeros.slice(0, 2).map(o => o.name).join(' · ')}{zeros.length > 2 ? ` 외 ${zeros.length - 2}개` : ''}</p>}
              {catalogOld(row) && <p className="text-xs mt-1" style={muted}>동기화 확인 필요 · {date(row.synced_at)}</p>}
            </div>
            <div><Badge row={row} /></div><div className="text-sm text-right lg:text-left" style={muted}>{zeros.length ? <><strong style={{ color: state === 'options' ? 'var(--warning)' : 'var(--foreground)' }}>{zeros.length}</strong> / {catalogOptions(row).length} 옵션</> : '—'}</div>
            <div className="font-semibold tabular-nums lg:text-right">{money(row.sale_price)}</div><ChevronRight className="justify-self-end" size={18} style={muted} />
          </button></li>;
        })}</ul>
        {visible < results.length && <button onClick={() => setVisible(n => n + 40)} className="w-full min-h-12 border-t text-sm font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--primary)' }}>더 보기 · {visible} / {results.length}</button>}
      </div>}
      </>}
    </main>
    {selected && <SupplierModal title="스토어 상품 상세" subtitle={`#${selected.channel_product_no} · 동기화 ${date(selected.synced_at)} (한국시간)`} onClose={() => setSelectedId(null)} footer={<>
      {catalogUrl(selected) && <a href={catalogUrl(selected)} target="_blank" rel="noopener noreferrer" className={button} style={panel}><ExternalLink size={16} />네이버 상품</a>}
      <a href="https://sell.smartstore.naver.com/#/home/dashboard" target="_blank" rel="noopener noreferrer" className={button} style={panel}>네이버 관리자</a>
      <button onClick={() => setSelectedId(null)} className={`${button} text-white`} style={{ background: 'var(--primary)' }}>닫기</button></>}>
      <div className="space-y-4">
        <div className="p-4 rounded-xl" style={{ background: 'var(--muted)' }}><Badge row={selected} /><h3 className="text-lg sm:text-xl font-bold leading-relaxed mt-2 break-words">{selected.name}</h3><p className="text-sm mt-2" style={muted}>네이버 상태: {catalogSourceStatus(selected)} · 기본 판매가 {money(selected.sale_price)}</p>{selected.seller_management_code && <p className="text-sm mt-1 break-words" style={muted}>관리코드 {selected.seller_management_code}</p>}</div>
        {catalogOld(selected) && <p className="text-sm" style={{ color: 'var(--warning)' }}>오래되었거나 동기화 시각이 없는 자료입니다. 네이버에서 현재 상태를 확인해주세요.</p>}
        <div className="flex flex-wrap items-center gap-2"><input aria-label="옵션 검색" value={optionQuery} onChange={e => setOptionQuery(e.target.value)} placeholder="옵션명 검색" className="min-h-11 flex-1 min-w-[160px] border rounded-xl px-3 text-base" style={panel} /><button aria-pressed={zeroOnly} onClick={() => setZeroOnly(v => !v)} className={button} style={{ ...panel, color: zeroOnly ? 'var(--warning)' : 'var(--foreground)' }}>재고 0만 {soldOutOptions(selected).length}</button></div>
        <p className="text-xs" style={muted}>사용하지 않는 옵션은 품절 집계에서 제외합니다. 재고 미확인은 0으로 계산하지 않습니다.</p>
        <div className="flex flex-wrap items-center justify-between gap-2">{!catalogOptions(selected).length && <button onClick={() => addReorder(selected)} disabled={reorders.some(r => r.key === reorderKey(selected, null))} className={`${button} disabled:opacity-50`} style={{ ...panel, color: 'var(--primary)' }}>{reorders.some(r => r.key === reorderKey(selected, null)) ? '상품 담김' : '+ 재주문 담기'}</button>}<button onClick={() => { setSelectedId(null); setView('reorders'); }} className="min-h-11 text-sm font-semibold" style={{ color: 'var(--primary)' }}>재주문 목록 보기 · {reorders.filter(r => !r.ordered).length}</button><span className="text-xs" style={muted}>수량은 담은 후 입력</span></div>
        {Number(selected.option_count) > catalogOptions(selected).length && <p className="text-sm" style={{ color: 'var(--warning)' }}>옵션 정보 일부가 누락되어 있습니다. 상품 동기화를 요청해주세요.</p>}
        <ul aria-label="상품 옵션 목록" className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>{options.map((o, i) => <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-4 border-b last:border-0" style={{ borderColor: 'var(--border)' }}><div className="min-w-0"><p className="text-base font-semibold break-words">{o.name || '이름 없는 옵션'}</p><p className="text-xs mt-1" style={muted}>추가금액 {Number(o.price || 0).toLocaleString('ko-KR')}원{o.usable === false ? ' · 사용 안 함' : ''}</p></div><div className="text-right"><strong className="text-lg tabular-nums" style={{ color: optionStock(o) === 0 && o.usable !== false ? 'var(--destructive)' : 'var(--foreground)' }}>{optionStock(o) === null ? '미확인' : `${optionStock(o)}개`}</strong><p className="text-xs mt-1" style={muted}>{o.usable === false ? '비활성 옵션' : optionStock(o) === 0 ? '재고 없음' : '옵션 재고'}</p><button onClick={() => addReorder(selected, o)} disabled={reorders.some(r => r.key === reorderKey(selected, o))} className="min-h-11 px-2 mt-1 text-sm font-semibold disabled:opacity-50" style={{ color: 'var(--primary)' }}>{reorders.some(r => r.key === reorderKey(selected, o)) ? '담김' : '+ 재주문'}</button></div></li>)}</ul>
        {!options.length && <p className="text-center py-6 text-sm" style={muted}>{catalogOptions(selected).length ? '조건에 맞는 옵션이 없습니다' : '동기화된 옵션 정보가 없습니다'}</p>}
      </div>
    </SupplierModal>}
  </div>;
}
