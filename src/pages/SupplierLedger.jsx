import { useState, useEffect, useMemo, useCallback } from 'react';
import { HandCoins, Search, ArrowLeft, Database, Plus, Trash2, AlertTriangle, Copy, FileDown, X } from 'lucide-react';
import { getTodayKST } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import DefectReturns from '@/components/purchase/DefectReturns';
import { quantityLabel } from '@/lib/supplierManagement';
import { copyText, downloadCSV, daysSince } from '@/lib/purchaseExport';

// 매입처 수불 장부 — 빌려준 것 / 예전 미입고 / 불량품.
// ⚠️ 발주서 기반 미입고([매입 발주] 페이지)와 별개다.
//    거긴 "발주서에 있는 건의 입고 잔량", 여긴 "발주서와 무관하게 오간 것들".
// 사장님이 구글시트 "JSR 퍼포먼스 미입고 현황 체크 리스트"로 관리하던 것.

const KIND = {
  lent:    { label: '대여·회수', color: 'var(--warning)',     desc: '돌려받아야 할 것' },
  pending: { label: '미입고', color: 'var(--destructive)', desc: '아직 안 들어온 것' },
  done:    { label: '정리 이력',   color: 'var(--success)',     desc: '정리된 건' },
  defect:  { label: '불량 보관', color: '#a855f7',            desc: '아직 발송하지 않은 매장 보관 불량품' },
};
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function KindBadge({ kind }) {
  const k = KIND[kind] || KIND.pending;
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap text-white" style={{ background: k.color }}>
      {k.label}
    </span>
  );
}

const emptyRow = () => ({ kind: 'lent', occurred_on: getTodayKST(), item_name: '', spec: '', qty: 1, unit: '개', note: '' });

export default function SupplierLedger({ showToast, setCurrentPage, tab = 'lent', onTabChange }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const setTab = (next) => { onTabChange?.(next); setQ(''); };
  const [returnCount, setReturnCount] = useState(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await supabase.getSupplierLedger();
    if (r === null) { setLoadFailed(true); setRows([]); }
    else { setLoadFailed(false); setRows(r); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!editing && !confirmDelete) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (confirmDelete) { setConfirmDelete(null); return; }
      if (!saving) setEditing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, confirmDelete, saving]);

  const byKind = useMemo(() => {
    const m = { lent: [], pending: [], done: [], defect: [] };
    for (const r of rows) {
      (m[r.kind] || m.pending).push(r);
      if (r.resolved && r.kind !== 'done') m.done.push(r);
    }
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    let list = byKind[tab] || [];
    // 빌려줌/미입고/불량품은 정리 안 된 것부터, 완료된 건 뒤로
    if (tab === 'lent' || tab === 'pending' || tab === 'defect') list = [...list].sort((a, b) => Number(a.resolved) - Number(b.resolved) || String(a.occurred_on || '').localeCompare(String(b.occurred_on || '')));
    const ql = q.trim().toLowerCase();
    if (ql) list = list.filter((r) => `${r.item_name} ${r.spec || ''} ${r.note || ''}`.toLowerCase().includes(ql));
    return list;
  }, [byKind, tab, q]);

  const summary = useMemo(() => {
    const openLent = byKind.lent.filter((r) => !r.resolved);
    const openPending = byKind.pending.filter((r) => !r.resolved);
    const oldest = [...openLent, ...openPending].reduce((a, r) => (r.occurred_on && (!a || String(r.occurred_on) < String(a.occurred_on)) ? r : a), null);
    return {
      lentQty: quantityLabel(openLent),
      lentCount: openLent.length,
      pendingQty: openPending.reduce((s, r) => s + num(r.qty), 0),
      pendingCount: openPending.length,
      defectQty: quantityLabel(byKind.defect.filter((r) => !r.resolved)),
      defectCount: byKind.defect.filter((r) => !r.resolved).length,
      oldestDays: oldest?.occurred_on ? daysSince(oldest.occurred_on) : 0,
      oldest,
    };
  }, [byKind]);

  const save = async () => {
    if (!editing) return;
    if (!(editing.item_name || '').trim()) { showToast?.('품목을 입력해주세요', 'error'); return; }
    setSaving(true);
    const payload = {
      supplier_name: 'JSR',
      kind: editing.kind,
      occurred_on: editing.kind === 'defect' ? null : (editing.occurred_on || null),
      item_name: (editing.item_name || '').trim(),
      spec: (editing.spec || '').trim() || null,
      qty: num(editing.qty),
      unit: (editing.unit || '개').trim(),
      note: (editing.note || '').trim() || null,
      resolved: !!editing.resolved,
    };
    const res = editing.id ? await supabase.updateSupplierLedger(editing.id, payload) : await supabase.addSupplierLedger(payload);
    setSaving(false);
    if (!res) { showToast?.('저장 실패 — 마이그레이션 010 적용 여부를 확인해주세요', 'error'); return; }
    showToast?.(editing.id ? '수정했습니다' : '추가했습니다', 'success');
    setEditing(null);
    load();
  };

  // 돌려받음/입고됨 처리 — 기록은 남기고 resolved만 켠다(삭제하면 이력이 사라짐)
  const toggleResolved = async (r) => {
    const next = !r.resolved;
    const res = await supabase.updateSupplierLedger(r.id, { resolved: next, resolved_at: next ? new Date().toISOString() : null });
    if (!res) { showToast?.('처리 실패', 'error'); return; }
    showToast?.(next ? `${r.item_name} 정리 완료 ✅` : '되돌렸습니다', 'success');
    load();
  };

  const del = async () => {
    if (!confirmDelete) return;
    const ok = await supabase.deleteSupplierLedger(confirmDelete.id);
    setConfirmDelete(null);
    if (!ok) { showToast?.('삭제 실패', 'error'); return; }
    showToast?.('삭제했습니다', 'success');
    load();
  };

  // JSR에 그대로 붙여넣는 용도
  const onCopy = async () => {
    if (!filtered.length) { showToast?.('복사할 내역이 없습니다', 'error'); return; }
    const k = KIND[tab];
    const lines = [`[JSR ${k.label} 현황]`, `(${new Date().toLocaleDateString('ko-KR')} 기준)`, ''];
    for (const r of filtered) {
      if (r.resolved && tab !== 'done') continue;
      const d = r.occurred_on ? ` — ${r.occurred_on} (${daysSince(r.occurred_on)}일 경과)` : '';
      lines.push(`· ${r.item_name}${r.spec ? ` ${r.spec}` : ''} ${num(r.qty)}${r.unit}${d}`);
      if (r.note) lines.push(`  ${String(r.note).replace(/\n/g, ' / ')}`);
    }
    const open = tab === 'done' ? filtered : filtered.filter((r) => !r.resolved);
    lines.push('', `합계 ${open.length}건 / ${quantityLabel(open)}`);
    const ok = await copyText(lines.join('\n'));
    if (!ok) { showToast?.('복사 실패', 'error'); return; }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
    showToast?.(`${k.label} 현황을 복사했습니다 📋`, 'success');
  };

  const onCSV = () => {
    if (!filtered.length) { showToast?.('내보낼 내역이 없습니다', 'error'); return; }
    const head = ['구분', '발생일', '품목', '규격', '수량', '단위', '비고', '정리됨'];
    const body = filtered.map((r) => [KIND[r.kind]?.label || r.kind, r.occurred_on || '', r.item_name, r.spec || '', num(r.qty), r.unit, (r.note || '').replace(/\n/g, ' / '), r.resolved ? 'O' : '']);
    const csv = '﻿' + [head, ...body]
      .map((row) => row.map((v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''))).join(','))
      .join('\r\n');
    downloadCSV(csv, `JSR_${KIND[tab].label}_${getTodayKST()}.csv`);
    showToast?.('CSV를 저장했습니다', 'success');
  };

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="shrink-0 px-4 sm:px-6 pt-5 pb-4 border-b" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <div className="hidden sm:flex items-center gap-3">
          <button aria-label="대시보드로" onClick={() => setCurrentPage?.('dashboard')} className="p-3 rounded-xl md:hidden"><ArrowLeft className="w-5 h-5" /></button>
          <div className="p-3 rounded-2xl hidden sm:block" style={{ background: 'var(--accent)', color: 'var(--primary)' }}><HandCoins className="w-6 h-6" /></div>
          <div><h1 className="text-xl sm:text-2xl font-black">JSR 관리</h1><p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>대여부터 불량 보관, 반품과 교환까지</p></div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:mt-5" aria-label="JSR 업무 선택">
          {[
            { id: 'lent', label: '대여·회수', sub: '빌려준 제품', value: summary.lentQty },
            { id: 'defect', label: '불량 보관', sub: '발송 전 보관', value: summary.defectQty },
            { id: 'returns', label: '반품·교환', sub: '발송 후 확인', value: returnCount === null ? '발송 이력' : `${returnCount}건` },
          ].map((t) => <button key={t.id} onClick={() => setTab(t.id)} aria-pressed={tab === t.id}
            className="text-left p-3 sm:p-4 rounded-2xl border transition-colors min-w-0"
            style={{ background: tab === t.id ? 'var(--accent)' : 'var(--card)', borderColor: tab === t.id ? 'var(--primary)' : 'var(--border)', color: tab === t.id ? 'var(--primary)' : 'var(--foreground)' }}>
            <div className="text-sm sm:text-base font-bold">{t.label}</div>
            <div className="text-[11px] sm:text-xs mt-1 leading-relaxed break-keep" style={{ color: 'var(--muted-foreground)' }}>{t.sub}</div>
            <div className="text-base sm:text-xl font-black mt-2 tabular-nums">{t.id !== 'returns' && loadFailed ? '확인 필요' : loading && t.id !== 'returns' ? '…' : t.value}</div>
          </button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button onClick={() => setTab('done')} aria-pressed={tab === 'done'} className="min-h-11 px-3 rounded-xl text-xs font-bold" style={{ background: tab === 'done' ? 'var(--accent)' : 'transparent', color: 'var(--muted-foreground)' }}>정리 이력 · {byKind.done.length}건</button>
          {byKind.pending.length > 0 && <button onClick={() => setTab('pending')} aria-pressed={tab === 'pending'} className="min-h-11 px-3 rounded-xl text-xs font-bold" style={{ background: tab === 'pending' ? 'var(--accent)' : 'transparent' }}>기존 미입고 · {byKind.pending.length}건</button>}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4">
        {tab === 'returns' ? <DefectReturns showToast={showToast} onCount={setReturnCount} onOpenStorage={() => setTab('defect')} /> : <>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div><h2 className="font-bold text-lg">{KIND[tab].label}</h2><p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>{KIND[tab].desc}</p></div>
          <button onClick={() => setEditing({ ...emptyRow(), kind: tab })} className="min-h-11 px-4 rounded-xl text-sm font-bold flex items-center gap-1 text-white shrink-0" style={{ background: 'var(--primary)' }}><Plus className="w-4 h-4" /> 기록 추가</button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
            <input aria-label="JSR 품목 검색" value={q} onChange={(e) => setQ(e.target.value)} placeholder="품목, 규격, 비고 검색" className="w-full pl-9 pr-3 min-h-11 rounded-xl text-sm border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }} />
          </div>
          <button onClick={onCopy} className="min-h-11 px-3 rounded-xl text-sm border flex items-center gap-1" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}><Copy className="w-4 h-4" />{copied ? '복사됨' : '내역 복사'}</button>
          <button onClick={onCSV} className="min-h-11 px-3 rounded-xl text-sm border flex items-center gap-1" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}><FileDown className="w-4 h-4" />CSV</button>
        </div>
        {loadFailed && (
          <div className="mb-4 p-4 rounded-xl border flex items-start gap-3" style={{ background: 'var(--card)', borderColor: 'var(--destructive)' }}>
            <Database className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--destructive)' }} />
            <div className="text-sm" style={{ color: 'var(--foreground)' }}>
              <div className="font-bold mb-1">대여·불량 관리 테이블을 찾을 수 없습니다</div>
              <div style={{ color: 'var(--muted-foreground)' }}>
                Supabase 대시보드 &gt; SQL Editor 에서 <b>migrations/010_supplier_ledger.sql</b> 을 실행해주세요.
                (실행하면 시트의 체크리스트 18건 + 불량품 12종이 함께 들어옵니다)
              </div>
            </div>
          </div>
        )}

        {tab === 'defect' && (
          <div className="mb-3 p-3 rounded-xl border flex items-start gap-2.5 text-xs" style={{ background: 'color-mix(in srgb, #a855f7 8%, transparent)', borderColor: '#a855f7' }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#a855f7' }} />
            <div style={{ color: 'var(--foreground)' }}>
              <b>여기는 누적 불량품 목록</b>입니다 — 발생할 때마다 품목별로 쌓아두는 곳(우리가 보유 중인 불량 재고).
              <br />이미 보낸 제품은 <button className="underline font-bold min-h-11 px-1" onClick={() => setTab('returns')}>반품·교환</button>에서 발송일과 교환품 수령량을 기록하세요. 보관 기록과 발송 기록은 자동으로 이동하지 않습니다.
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>{q ? '검색 결과가 없습니다' : `${KIND[tab].label} 내역이 없습니다`}</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {filtered.map((r) => {
              const days = r.occurred_on ? daysSince(r.occurred_on) : 0;
              return <article key={r.id} className="p-4 sm:p-5 rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <div className="flex items-start gap-3 justify-between">
                  <div className="min-w-0"><KindBadge kind={r.kind} /><h3 className="font-bold text-base sm:text-lg mt-2 break-words">{r.item_name}</h3>{r.spec && <p className="text-sm mt-1 break-words" style={{ color: 'var(--muted-foreground)' }}>{r.spec}</p>}</div>
                  <div className="text-xl font-black tabular-nums shrink-0" style={{ color: 'var(--primary)' }}>{num(r.qty)}<span className="text-sm ml-1">{r.unit}</span></div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs mt-3" style={{ color: 'var(--muted-foreground)' }}>
                  {r.occurred_on && <span>{r.occurred_on}</span>}
                  {r.occurred_on && !r.resolved && <span style={{ color: days >= 90 ? 'var(--warning)' : undefined }}>{days}일 경과</span>}
                  <span className="font-bold" style={{ color: r.resolved ? 'var(--success)' : 'var(--primary)' }}>{r.resolved ? '정리 완료' : r.kind === 'lent' ? '회수 대기' : r.kind === 'defect' ? '발송 전 · 보관 중' : '입고 대기'}</span>
                </div>
                {r.note && <p className="text-sm whitespace-pre-line break-words rounded-xl p-3 mt-3" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>{r.note}</p>}
                <div className="border-t mt-4 pt-3 flex flex-wrap gap-2" style={{ borderColor: 'var(--border)' }}>
                  <button onClick={() => toggleResolved(r)} className="min-h-11 px-3 rounded-xl text-sm font-bold border" style={{ borderColor: 'var(--border)', color: 'var(--primary)' }}>{r.resolved ? '완료 되돌리기' : r.kind === 'lent' ? '회수 완료' : '정리 완료'}</button>
                  <button onClick={() => setEditing({ ...r })} className="min-h-11 px-3 rounded-xl text-sm border ml-auto" style={{ borderColor: 'var(--border)' }}>수정</button>
                  <button aria-label={`${r.item_name} 삭제`} onClick={() => setConfirmDelete(r)} className="min-h-11 min-w-11 flex items-center justify-center rounded-xl" style={{ color: 'var(--destructive)' }}><Trash2 className="w-4 h-4" /></button>
                </div>
              </article>;
            })}
          </div>
        )}

        <p className="mt-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>
          여기는 <b>발주서와 무관하게</b> 오간 것들입니다. 발주서에 있는 건의 입고 잔량은 <b>[매입 발주] → 미입고 현황</b>에서 봅니다.
        </p>
        </>}
      </div>

      {/* 추가/수정 */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={() => !saving && setEditing(null)}>
          <div className="w-full max-w-2xl max-h-[90dvh] rounded-2xl border overflow-hidden flex flex-col" style={{ background: 'var(--card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b flex items-center gap-3" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
              <HandCoins className="w-6 h-6" style={{ color: 'var(--primary)' }} />
              <h2 className="text-2xl font-black" style={{ color: 'var(--foreground)' }}>{editing.id ? '수정' : '추가'}</h2>
              <button onClick={() => setEditing(null)} className="ml-auto p-2 rounded-lg hover:bg-[var(--accent)]" style={{ color: 'var(--muted-foreground)' }}><X className="w-5 h-5" /></button>
            </div>
            <div className="px-4 sm:px-6 py-5 space-y-4 overflow-y-auto min-h-0">
              <div>
                <span className="text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>구분</span>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {Object.entries(KIND).filter(([k]) => k !== 'pending').map(([k, v]) => (
                    <button key={k} onClick={() => setEditing({ ...editing, kind: k })}
                      className="px-3.5 py-2 rounded-xl text-sm font-bold border"
                      style={editing.kind === k ? { background: v.color, color: 'white', borderColor: v.color } : { background: 'var(--background)', color: 'var(--muted-foreground)', borderColor: 'var(--border)' }}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>품목</span>
                  <input value={editing.item_name} onChange={(e) => setEditing({ ...editing, item_name: e.target.value })} autoFocus
                    className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl text-base border outline-none" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                </label>
                <label className="block">
                  <span className="text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>규격 (선택)</span>
                  <input value={editing.spec || ''} onChange={(e) => setEditing({ ...editing, spec: e.target.value })}
                    className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl text-base border outline-none" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>수량</span>
                  <input type="number" value={editing.qty} onChange={(e) => setEditing({ ...editing, qty: e.target.value })}
                    className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl text-base border outline-none text-right tabular-nums" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                </label>
                <label className="block">
                  <span className="text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>단위</span>
                  <select value={editing.unit} onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
                    className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl text-base border outline-none" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                    <option value="개">개</option>
                    <option value="세트">세트</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>발생일</span>
                  <input type="date" value={editing.occurred_on || ''} onChange={(e) => setEditing({ ...editing, occurred_on: e.target.value })}
                    disabled={editing.kind === 'defect'}
                    className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl text-base border outline-none disabled:opacity-40" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                </label>
              </div>
              <label className="block">
                <span className="text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>비고</span>
                <textarea value={editing.note || ''} onChange={(e) => setEditing({ ...editing, note: e.target.value })} rows={3}
                  placeholder="예) 팀 본즈 / 본사 입고 후 물건 받기로함 / 택배 선불 6000"
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl text-base border outline-none resize-y" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
              </label>
            </div>
            <div className="shrink-0 px-4 sm:px-6 py-4 border-t flex items-center gap-2" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
              <button onClick={() => setEditing(null)} className="ml-auto px-5 py-2.5 rounded-xl text-base font-bold border" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>취소</button>
              <button onClick={save} disabled={saving} className="px-7 py-2.5 rounded-xl text-base font-bold text-white disabled:opacity-60" style={{ background: 'var(--primary)' }}>{saving ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-md rounded-2xl border p-6" style={{ background: 'var(--card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-6 h-6" style={{ color: 'var(--destructive)' }} />
              <h3 className="text-xl font-black" style={{ color: 'var(--foreground)' }}>삭제</h3>
            </div>
            <div className="text-base mb-5" style={{ color: 'var(--foreground)' }}>
              <b>{confirmDelete.item_name}</b> {num(confirmDelete.qty)}{confirmDelete.unit}
              <br />
              <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                정리된 건이면 삭제 말고 <b>완료 스위치</b>를 켜세요 — 이력이 남습니다.
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-5 py-2.5 rounded-xl text-base font-bold border" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>취소</button>
              <button onClick={del} className="px-5 py-2.5 rounded-xl text-base font-bold text-white" style={{ background: 'var(--destructive)' }}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
