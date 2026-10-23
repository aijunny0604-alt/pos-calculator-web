import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Trash2, Copy, Printer, Database, PackageCheck, ClipboardPaste, Minus, ChevronRight } from 'lucide-react';
import SupplierModal from './SupplierModal';
import { filterReturnRecords } from '@/lib/supplierManagement';
import { supabase } from '@/lib/supabase';
import { getTodayKST, escapeHtml } from '@/lib/utils';

// 불량품 반품(우리 → 매입처) 기록 + 교환(대체품) 회수 추적.
// items 원소: { category, spec, qty, unit('개'|'세트'), received_qty, note }

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// 붙여넣은 불량품 리스트 텍스트 → items 파싱.
// 지원: "■ NPK"(분류), "* NPK 114D-T : 4개" / "* VP KIT : 1세트", 소계/총합/[제목] 무시.
function parseDefectList(text) {
  const lines = String(text || '').split(/\r?\n/);
  const items = [];
  let meta = { date: '', supplier: '' };
  let category = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // 제목 줄에서 날짜/매입처 추출: [2026.08.19 JSR 불량품 리스트]
    if (/^\[/.test(line)) {
      const d = line.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
      if (d && !meta.date) meta.date = `${d[1]}-${String(d[2]).padStart(2, '0')}-${String(d[3]).padStart(2, '0')}`;
      const sup = line.match(/\b(JSR|MOVIS|엠파츠)\b/i);
      if (sup && !meta.supplier) meta.supplier = sup[1].toUpperCase() === 'JSR' ? 'JSR' : sup[1];
      continue;
    }
    // 분류 헤더: ■ NPK / □ 기타
    const cat = line.match(/^[■□▪◆●]\s*(.+)$/);
    if (cat) { category = cat[1].replace(/\s*소계.*$/, '').trim(); continue; }
    // 소계/총합/단위요약 줄 무시
    if (/소계|총\s*합|총합|^총\s|단위\s*제품/.test(line)) continue;
    // 품목: * NPK 114D-T : 4개   또는   - VP KIT : 1세트
    const m = line.match(/^[*\-•·]?\s*(.+?)\s*[:：]\s*(\d+)\s*(세트|세|개|ea|EA|pcs)?\.?$/);
    if (m) {
      const spec = m[1].trim();
      const qty = num(m[2]);
      if (!spec || qty <= 0) continue;
      const unit = /세트|set/i.test(m[3] || '') ? '세트' : '개';
      items.push({ category, spec, qty, unit, received_qty: 0, note: '' });
    }
  }
  return { items, meta };
}

// 품목 합계 — 단위별로 (개 / 세트)
function summarize(items = []) {
  let gae = 0, set = 0, recGae = 0, recSet = 0;
  for (const it of items) {
    const q = num(it.qty), r = Math.min(num(it.received_qty), q);
    if (it.unit === '세트') { set += q; recSet += r; } else { gae += q; recGae += r; }
  }
  const totalQty = items.reduce((s, it) => s + num(it.qty), 0);
  const totalRec = items.reduce((s, it) => s + Math.min(num(it.received_qty), num(it.qty)), 0);
  return { gae, set, recGae, recSet, totalQty, totalRec, allBack: totalQty > 0 && totalRec >= totalQty };
}

const summaryLabel = (s) => {
  const parts = [];
  if (s.gae) parts.push(`${s.gae}개`);
  if (s.set) parts.push(`${s.set}세트`);
  return parts.join(' + ') || '0';
};

function buildKakaoText(row) {
  const s = summarize(row.items);
  const byCat = {};
  for (const it of row.items) { (byCat[it.category || '기타'] = byCat[it.category || '기타'] || []).push(it); }
  const lines = [`[${row.return_date} ${row.supplier} 불량품 리스트]`, ''];
  for (const [cat, arr] of Object.entries(byCat)) {
    lines.push(`■ ${cat}`);
    for (const it of arr) lines.push(`* ${it.spec} : ${num(it.qty)}${it.unit}`);
    lines.push('');
  }
  lines.push(`[총합] ${summaryLabel(s)}`);
  if (row.memo) lines.push('', row.memo);
  return lines.join('\n');
}

export default function DefectReturns({ showToast, onCount, onOpenStorage }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState(null); // { id?, return_date, supplier, items, memo, status }
  const [saving, setSaving] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const selected = rows.find(row => row.id === selectedId);
  const [confirmDel, setConfirmDel] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await supabase.getDefectReturns();
    if (res === null) { setLoadFailed(true); setRows([]); }
    else { setLoadFailed(false); setRows(res || []); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  // 상위(매입 발주 탭 뱃지)로 건수 보고 — 로드/추가/삭제/완료 반영
  useEffect(() => { if (!loading && !loadFailed) onCount?.(rows.length); }, [rows, loading, loadFailed, onCount]);

  const openNew = () => {
    setPasteText('');
    setEditing({ return_date: getTodayKST(), supplier: 'JSR', items: [], memo: '', status: '진행중' });
  };
  const openEdit = (row) => {
    setSelectedId(null);
    setPasteText('');
    setEditing({ ...row, items: (row.items || []).map((it) => ({ ...it })) });
  };

  const applyPaste = () => {
    const { items, meta } = parseDefectList(pasteText);
    if (!items.length) { showToast?.('리스트에서 품목을 찾지 못했습니다', 'error'); return; }
    setEditing((e) => ({
      ...e,
      return_date: meta.date || e.return_date,
      supplier: meta.supplier || e.supplier,
      items: [...e.items, ...items],
    }));
    setPasteText('');
    showToast?.(`${items.length}개 품목을 불러왔습니다`, 'success');
  };

  const setItem = (i, patch) => setEditing((e) => ({ ...e, items: e.items.map((it, idx) => idx === i ? { ...it, ...patch } : it) }));
  const addItem = () => setEditing((e) => ({ ...e, items: [...e.items, { category: '', spec: '', qty: 1, unit: '개', received_qty: 0, note: '' }] }));
  const delItem = (i) => setEditing((e) => ({ ...e, items: e.items.filter((_, idx) => idx !== i) }));

  const save = async () => {
    const items = (editing.items || []).filter((it) => String(it.spec || '').trim() && num(it.qty) > 0)
      .map((it) => ({ category: (it.category || '').trim(), spec: it.spec.trim(), qty: num(it.qty), unit: it.unit === '세트' ? '세트' : '개', received_qty: Math.min(num(it.received_qty), num(it.qty)), note: it.note || '' }));
    if (!items.length) { showToast?.('품목을 최소 1개 입력해주세요', 'error'); return; }
    if (!editing.return_date) { showToast?.('발송일을 입력해주세요', 'error'); return; }
    setSaving(true);
    const s = summarize(items);
    const payload = {
      return_date: editing.return_date,
      supplier: (editing.supplier || 'JSR').trim(),
      items,
      memo: editing.memo || null,
      status: s.allBack ? '완료' : (editing.status || '진행중'),
      updated_at: new Date().toISOString(),
    };
    const res = editing.id
      ? await supabase.updateDefectReturn(editing.id, payload)
      : await supabase.addDefectReturn(payload);
    setSaving(false);
    if (!res) { showToast?.('저장 실패 — 마이그레이션 014 적용 여부를 확인해주세요', 'error'); return; }
    setEditing(null);
    showToast?.(editing.id ? '불량 반품을 수정했습니다' : '불량 반품을 기록했습니다', 'success');
    load();
  };

  // 카드에서 바로 회수 +/- (교환품 되받음)
  const bump = async (row, i, delta) => {
    const items = (row.items || []).map((it, idx) => {
      if (idx !== i) return it;
      const next = Math.max(0, Math.min(num(it.qty), num(it.received_qty) + delta));
      return { ...it, received_qty: next };
    });
    const s = summarize(items);
    const patch = { items, status: s.allBack ? '완료' : '진행중', updated_at: new Date().toISOString() };
    setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, ...patch } : r)); // 낙관적
    const res = await supabase.updateDefectReturn(row.id, patch);
    if (!res) { showToast?.('회수 반영 실패', 'error'); load(); }
  };

  const toggleStatus = async (row) => {
    const status = row.status === '완료' ? '진행중' : '완료';
    setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, status } : r));
    const res = await supabase.updateDefectReturn(row.id, { status, updated_at: new Date().toISOString() });
    if (!res) { showToast?.('상태 변경 실패', 'error'); load(); }
  };

  const doDelete = async () => {
    const ok = await supabase.deleteDefectReturn(confirmDel.id);
    setConfirmDel(null);
    if (!ok) { showToast?.('삭제 실패', 'error'); return; }
    showToast?.('삭제했습니다', 'success');
    load();
  };

  const copyKakao = async (row) => {
    try {
      await navigator.clipboard.writeText(buildKakaoText(row));
      setCopiedId(row.id); setTimeout(() => setCopiedId(null), 1500);
      showToast?.('발송 리스트를 복사했습니다 📋', 'success');
    } catch { showToast?.('복사 실패 — 길게 눌러 직접 복사해주세요', 'error'); }
  };

  const printRow = (row) => {
    const s = summarize(row.items);
    const byCat = {};
    for (const it of row.items) { (byCat[it.category || '기타'] = byCat[it.category || '기타'] || []).push(it); }
    const body = Object.entries(byCat).map(([cat, arr]) => `
      <h3>${escapeHtml(cat)}</h3>
      <table><thead><tr><th>규격</th><th>수량</th></tr></thead><tbody>
        ${arr.map((it) => `<tr><td>${escapeHtml(it.spec)}</td><td>${num(it.qty)}${escapeHtml(it.unit)}</td></tr>`).join('')}
      </tbody></table>`).join('');
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) { showToast?.('팝업이 차단됐습니다', 'error'); return; }
    w.document.write(`<html><head><title>불량품 반품 명세서</title><style>
      body{font-family:'Malgun Gothic',sans-serif;padding:32px;color:#111}
      h1{font-size:20px;margin:0 0 4px} .sub{color:#666;font-size:13px;margin-bottom:16px}
      h3{margin:16px 0 6px;font-size:15px} table{width:100%;border-collapse:collapse;margin-bottom:8px}
      th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:13px} th{background:#f3f3f3}
      .total{margin-top:20px;font-size:15px;font-weight:bold} .memo{margin-top:12px;color:#444;font-size:13px;white-space:pre-wrap}
    </style></head><body>
      <h1>불량품 반품 명세서</h1>
      <div class="sub">발송일 ${escapeHtml(row.return_date)} · 매입처 ${escapeHtml(row.supplier)}</div>
      ${body}
      <div class="total">총합 : ${escapeHtml(summaryLabel(s))}</div>
      ${row.memo ? `<div class="memo">${escapeHtml(row.memo)}</div>` : ''}
    </body></html>`);
    w.document.close(); w.focus(); w.print();
  };

  const openCount = useMemo(() => rows.filter((r) => r.status !== '완료').length, [rows]);

  const visibleRows = useMemo(() => filterReturnRecords(rows, query, statusFilter), [rows, query, statusFilter]);

  if (loading) return <div className="py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>불러오는 중...</div>;
  if (loadFailed) return (
    <div className="p-4 rounded-xl border flex items-start gap-3" style={{ background: 'var(--card)', borderColor: 'var(--destructive)' }}>
      <Database className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--destructive)' }} />
      <div className="text-sm" style={{ color: 'var(--foreground)' }}>
        <div className="font-bold mb-1">불량 반품 테이블을 찾을 수 없습니다</div>
        <div style={{ color: 'var(--muted-foreground)' }}>Supabase &gt; SQL Editor 에서 <b>migrations/014_defect_returns.sql</b> 을 실행해주세요.</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div><h2 className="font-bold text-lg">반품·교환</h2><p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>발송한 불량품과 교환품 수령 내역</p></div>
        <button onClick={openNew} className="min-h-11 flex items-center gap-1.5 px-4 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--primary)' }}><Plus className="w-4 h-4" /> 발송 기록 추가</button>
      </div>
      <div className="rounded-xl border px-4 py-3 flex flex-wrap items-center gap-x-3 text-sm" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
        <span>아직 매장에 있는 불량품은</span><button onClick={onOpenStorage} className="min-h-11 font-bold underline" style={{ color: 'var(--primary)' }}>불량 보관에서 관리 →</button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 rounded-xl p-1 border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          {[['all', `전체 ${rows.length}`], ['open', `교환 대기 ${openCount}`], ['done', `완료 ${rows.length - openCount}`]].map(([id, label]) => <button key={id} onClick={() => setStatusFilter(id)} aria-pressed={statusFilter === id} className="px-3 min-h-11 rounded-lg text-sm font-bold" style={{ background: statusFilter === id ? 'var(--accent)' : 'transparent', color: statusFilter === id ? 'var(--primary)' : 'var(--muted-foreground)' }}>{label}</button>)}
        </div>
        <input aria-label="반품·교환 검색" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="품목 · 발송일 · 메모 검색" className="flex-1 min-w-[180px] min-h-11 rounded-xl border px-3 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />
      </div>
      {visibleRows.length === 0 ? (
        <div className="py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
          <PackageCheck className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--success)' }} />
          {rows.length === 0 ? '발송 기록이 없습니다. 발송 기록 추가에서 등록하세요.' : '조건에 맞는 반품 기록이 없습니다.'}
        </div>
      ) : (
        <ul aria-label="반품 발송 기록 목록" className="rounded-2xl border overflow-hidden" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          {visibleRows.map(row => {
            const summary = summarize(row.items);
            const done = row.status === '완료';
            const pct = summary.totalQty ? Math.round(summary.totalRec / summary.totalQty * 100) : 0;
            return <li key={row.id} className="border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
              <button aria-label={`${row.supplier} ${row.return_date} 반품 상세 보기`} onClick={() => setSelectedId(row.id)}
                className="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_minmax(140px,1fr)_minmax(160px,1fr)_auto] gap-4 items-center p-5 sm:p-6 hover:bg-[var(--accent)] transition-colors">
                <div className="min-w-0"><div className="flex flex-wrap gap-2 items-center"><strong className="text-lg">{row.supplier}</strong><span className="text-sm font-medium" style={{ color: done ? 'var(--success)' : 'var(--warning)' }}>{done ? '교환 완료' : summary.totalRec > 0 ? '일부 수령' : '미수령'}</span></div><div className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>{row.return_date} 발송 · {row.items?.length || 0}품목</div></div>
                <div className="text-right lg:text-left"><span className="block text-xs font-normal mb-1" style={{ color: 'var(--muted-foreground)' }}>발송 수량</span><strong className="text-xl tabular-nums">{summaryLabel(summary)}</strong></div>
                <div className="min-w-0"><div className="text-sm" style={{ color: 'var(--primary)' }}>미수령 <strong>{summaryLabel({ gae: summary.gae - summary.recGae, set: summary.set - summary.recSet })}</strong></div><div className="flex items-center gap-2 mt-2"><div className="h-1.5 rounded-full flex-1 overflow-hidden" style={{ background: 'var(--muted)' }}><div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: 'var(--primary)' }} /></div><span className="text-xs tabular-nums" style={{ color: 'var(--muted-foreground)' }}>{pct}%</span></div></div>
                <span className="flex items-center gap-1 text-sm justify-end" style={{ color: 'var(--primary)' }}>상세 보기 <ChevronRight size={18} /></span>
              </button>
            </li>;
          })}
        </ul>
      )}

      {selected && <SupplierModal title="반품·교환 상세" subtitle={`${selected.supplier} · ${selected.return_date} 발송 · ${selected.items?.length || 0}품목`}
        onClose={() => setSelectedId(null)} footer={<>
          <button onClick={() => copyKakao(selected)} className="min-h-11 px-3 border rounded-xl flex items-center gap-2"><Copy size={18} />{copiedId === selected.id ? '복사됨' : '복사'}</button>
          <button onClick={() => printRow(selected)} className="min-h-11 px-3 border rounded-xl flex items-center gap-2"><Printer size={18} />명세서</button>
          <button onClick={() => openEdit(selected)} className="min-h-11 px-4 border rounded-xl">수정</button>
          <button onClick={() => { setConfirmDel(selected); setSelectedId(null); }} className="min-h-11 min-w-11 flex items-center justify-center rounded-xl" aria-label="발송 기록 삭제" style={{ color: 'var(--destructive)' }}><Trash2 size={18} /></button>
          <button onClick={() => toggleStatus(selected)} className="min-h-11 px-4 border rounded-xl" style={{ color: 'var(--primary)' }}>{selected.status === '완료' ? '진행중으로' : '완료 처리'}</button>
          <button onClick={() => setSelectedId(null)} className="min-h-11 px-5 rounded-xl text-white" style={{ background: 'var(--primary)' }}>닫기</button>
        </>}>
        {(() => {
          const s = summarize(selected.items);
          return <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5 p-4 sm:p-5 rounded-xl" style={{ background: 'var(--muted)' }}>
            {[['발송 수량', summaryLabel(s)], ['수령 수량', summaryLabel({ gae: s.recGae, set: s.recSet })], ['미수령', summaryLabel({ gae: s.gae - s.recGae, set: s.set - s.recSet })]].map(([label, value]) => <div key={label} className="flex sm:block items-center justify-between gap-2"><span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{label}</span><strong className="block text-xl sm:text-2xl sm:mt-2 tabular-nums" style={{ color: 'var(--primary)' }}>{value}</strong></div>)}
          </div>;
        })()}
        <div className="flex flex-wrap gap-2 justify-between items-center mb-3"><h3 className="text-lg font-bold">상세 품목</h3><p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>+ / − 버튼으로 실제 받은 수량을 기록하세요.</p></div>
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <div aria-hidden="true" className="hidden sm:grid grid-cols-[minmax(0,1fr)_80px_176px] gap-4 px-4 py-3 text-sm font-semibold" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}><span>품목 · 규격</span><span className="text-right">발송</span><span className="text-center">수령 수량</span></div>
          <ul aria-label="반품 상세 품목">{(selected.items || []).map((it, i) => {
            const full = num(it.received_qty) >= num(it.qty);
            return <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_80px_176px] gap-x-4 gap-y-3 items-center px-4 py-4 border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0"><span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{it.category || '기타'}</span><div className="font-semibold text-base sm:text-lg break-words mt-1">{it.spec}</div>{it.note && <p className="text-sm mt-1 break-words" style={{ color: 'var(--muted-foreground)' }}>{it.note}</p>}</div>
              <span className="text-lg font-semibold tabular-nums text-right">{num(it.qty)}<small className="ml-1 text-sm font-normal">{it.unit}</small></span>
              <div className="col-span-2 sm:col-span-1 flex items-center justify-end sm:justify-center gap-2">
                <span className="sm:hidden mr-auto text-sm" style={{ color: 'var(--muted-foreground)' }}>수령 수량</span>
                <button aria-label={`${it.spec} 수령 수량 줄이기`} onClick={() => bump(selected, i, -1)} disabled={num(it.received_qty) <= 0} className="min-w-11 min-h-11 rounded-lg border disabled:opacity-30 flex items-center justify-center" style={{ borderColor: 'var(--border)' }}><Minus size={18} /></button>
                <span className="min-w-14 text-center text-xl font-bold tabular-nums" style={{ color: full ? 'var(--success)' : 'var(--primary)' }}>{num(it.received_qty)}<small className="text-sm font-normal" style={{ color: 'var(--muted-foreground)' }}> / {num(it.qty)}</small></span>
                <button aria-label={`${it.spec} 수령 수량 늘리기`} onClick={() => bump(selected, i, 1)} disabled={num(it.received_qty) >= num(it.qty)} className="min-w-11 min-h-11 rounded-lg border disabled:opacity-30 flex items-center justify-center" style={{ borderColor: 'var(--border)' }}><Plus size={18} /></button>
              </div>
            </li>;
          })}</ul>
        </div>
        {selected.memo && <p className="text-base whitespace-pre-line mt-4" style={{ color: 'var(--muted-foreground)' }}>{selected.memo}</p>}
      </SupplierModal>}

      {/* 기록/수정 모달 */}
      {editing && <SupplierModal title={editing.id ? '발송 기록 수정' : '발송 기록 추가'} onClose={() => setEditing(null)} busy={saving}
        footer={<><button onClick={() => setEditing(null)} disabled={saving} className="min-h-11 px-5 rounded-xl border">취소</button><button onClick={save} disabled={saving} className="min-h-11 px-7 rounded-xl text-white disabled:opacity-50" style={{ background: 'var(--primary)' }}>{saving ? '저장 중...' : '저장'}</button></>}>
        <div className="space-y-5">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>발송일
                  <input type="date" value={editing.return_date} onChange={(e) => setEditing({ ...editing, return_date: e.target.value })}
                    className="mt-1 w-full px-3 min-h-11 py-2 rounded-lg border text-base" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                </label>
                <label className="text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>매입처
                  <input value={editing.supplier} onChange={(e) => setEditing({ ...editing, supplier: e.target.value })}
                    className="mt-1 w-full px-3 min-h-11 py-2 rounded-lg border text-base" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                </label>
              </div>

              {/* 리스트 붙여넣기 파서 */}
              {!editing.id && (
                <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--primary)', background: 'rgba(0,212,255,0.06)' }}>
                  <div className="flex items-center gap-1.5 text-sm font-bold mb-1.5" style={{ color: 'var(--primary)' }}>
                    <ClipboardPaste className="w-4 h-4" /> 불량품 리스트 붙여넣기 → 자동 인식
                  </div>
                  <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4}
                    placeholder={'예)\n■ NPK\n* NPK 114D-T : 4개\n* VP KIT : 1세트'}
                    className="w-full px-3 min-h-11 py-2 rounded-lg border text-base font-mono" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                  <button onClick={applyPaste} className="mt-1.5 px-3 py-1.5 rounded-lg text-sm font-bold text-white" style={{ background: 'var(--primary)' }}>품목 불러오기</button>
                </div>
              )}

              {/* 품목 편집 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>품목 {editing.items.length}종</span>
                  <button onClick={addItem} className="flex items-center gap-1 px-3 min-h-11 rounded-lg text-sm font-bold border" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}><Plus className="w-3 h-3" /> 행 추가</button>
                </div>
                <div className="space-y-2">
                  {editing.items.length === 0 ? (
                    <div className="text-sm py-6 text-center" style={{ color: 'var(--muted-foreground)' }}>위에 리스트를 붙여넣거나 행을 추가하세요</div>
                  ) : editing.items.map((it, i) => (
                    <div key={i} className="grid grid-cols-6 gap-2 p-2 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                      <input value={it.category} onChange={(e) => setItem(i, { category: e.target.value })} placeholder="분류"
                        className="col-span-2 min-w-0 min-h-11 px-2 rounded-lg border text-base" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                      <input value={it.spec} onChange={(e) => setItem(i, { spec: e.target.value })} placeholder="규격/품명"
                        className="col-span-4 min-w-0 min-h-11 px-2 rounded-lg border text-base font-mono" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                      <input aria-label={`${it.spec || '품목'} 발송 수량`} type="number" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })}
                        className="col-span-2 min-w-0 min-h-11 px-2 rounded-lg border text-base text-right" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                      <select aria-label={`${it.spec || '품목'} 단위`} value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })}
                        className="col-span-3 min-w-0 min-h-11 px-2 rounded-lg border text-base" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                        <option value="개">개</option><option value="세트">세트</option>
                      </select>
                      <button onClick={() => delItem(i)} className="p-3 min-h-11 min-w-11 rounded-lg" style={{ color: 'var(--destructive)' }}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
                {editing.items.length > 0 && (
                  <div className="text-sm font-bold mt-1.5 text-right" style={{ color: 'var(--foreground)' }}>총합 {summaryLabel(summarize(editing.items))}</div>
                )}
              </div>

              <label className="text-sm font-bold block" style={{ color: 'var(--muted-foreground)' }}>메모 (선택)
                <textarea value={editing.memo || ''} onChange={(e) => setEditing({ ...editing, memo: e.target.value })} rows={2}
                  placeholder="교환 조건, 담당자 등"
                  className="mt-1 w-full px-3 min-h-11 py-2 rounded-lg border text-base" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
              </label>
        </div>
      </SupplierModal>}

      {confirmDel && <SupplierModal compact title="발송 기록 삭제" onClose={() => setConfirmDel(null)}
        footer={<><button onClick={() => setConfirmDel(null)} className="min-h-11 px-5 border rounded-xl">취소</button><button onClick={doDelete} className="min-h-11 px-5 rounded-xl text-white" style={{ background: 'var(--destructive)' }}>삭제</button></>}>
        <p className="text-base">{confirmDel.supplier} · {confirmDel.return_date}</p><p className="text-lg font-semibold mt-2">{summaryLabel(summarize(confirmDel.items))}</p><p className="text-sm mt-4" style={{ color: 'var(--muted-foreground)' }}>이 발송 기록을 삭제할까요?</p>
      </SupplierModal>}

    </div>
  );
}
