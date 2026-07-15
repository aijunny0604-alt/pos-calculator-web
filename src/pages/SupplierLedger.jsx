import { useState, useEffect, useMemo, useCallback } from 'react';
import { HandCoins, Search, ArrowLeft, Database, Plus, Trash2, Check, AlertTriangle, Copy, FileDown, Clock, Undo2, X } from 'lucide-react';
import { formatPrice, getTodayKST } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { copyText, downloadCSV, daysSince, ageLevel } from '@/lib/purchaseExport';

// 매입처 수불 장부 — 빌려준 것 / 예전 미입고 / 불량품.
// ⚠️ 발주서 기반 미입고([매입 발주] 페이지)와 별개다.
//    거긴 "발주서에 있는 건의 입고 잔량", 여긴 "발주서와 무관하게 오간 것들".
// 사장님이 구글시트 "JSR 퍼포먼스 미입고 현황 체크 리스트"로 관리하던 것.

const KIND = {
  lent:    { label: '빌려줌', color: 'var(--warning)',     desc: '돌려받아야 할 것' },
  pending: { label: '미입고', color: 'var(--destructive)', desc: '아직 안 들어온 것' },
  done:    { label: '완료',   color: 'var(--success)',     desc: '정리된 건' },
  defect:  { label: '불량품', color: '#a855f7',            desc: '누적된 불량품' },
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

export default function SupplierLedger({ showToast, setCurrentPage }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tab, setTab] = useState('lent'); // lent | pending | defect | done
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
    for (const r of rows) (m[r.kind] || m.pending).push(r);
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    let list = byKind[tab] || [];
    // 빌려줌/미입고는 정리 안 된 것부터, 완료된 건 뒤로
    if (tab === 'lent' || tab === 'pending') list = [...list].sort((a, b) => Number(a.resolved) - Number(b.resolved) || String(a.occurred_on).localeCompare(String(b.occurred_on)));
    const ql = q.trim().toLowerCase();
    if (ql) list = list.filter((r) => `${r.item_name} ${r.spec || ''} ${r.note || ''}`.toLowerCase().includes(ql));
    return list;
  }, [byKind, tab, q]);

  const summary = useMemo(() => {
    const openLent = byKind.lent.filter((r) => !r.resolved);
    const openPending = byKind.pending.filter((r) => !r.resolved);
    const oldest = [...openLent, ...openPending].reduce((a, r) => (r.occurred_on && (!a || String(r.occurred_on) < String(a.occurred_on)) ? r : a), null);
    return {
      lentQty: openLent.reduce((s, r) => s + num(r.qty), 0),
      lentCount: openLent.length,
      pendingQty: openPending.reduce((s, r) => s + num(r.qty), 0),
      pendingCount: openPending.length,
      defectQty: byKind.defect.reduce((s, r) => s + num(r.qty), 0),
      defectCount: byKind.defect.length,
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
      if (r.resolved) continue;
      const d = r.occurred_on ? ` — ${r.occurred_on} (${daysSince(r.occurred_on)}일 경과)` : '';
      lines.push(`· ${r.item_name}${r.spec ? ` ${r.spec}` : ''} ${num(r.qty)}${r.unit}${d}`);
      if (r.note) lines.push(`  ${String(r.note).replace(/\n/g, ' / ')}`);
    }
    const open = filtered.filter((r) => !r.resolved);
    lines.push('', `합계 ${open.length}건 / ${open.reduce((s, r) => s + num(r.qty), 0)}개`);
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
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setCurrentPage?.('dashboard')} className="p-2 -ml-2 rounded-lg hover:bg-[var(--accent)] md:hidden" style={{ color: 'var(--muted-foreground)' }}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <HandCoins className="w-6 h-6" style={{ color: 'var(--primary)' }} />
          <h1 className="text-xl sm:text-2xl font-black" style={{ color: 'var(--foreground)' }}>JSR 수불 장부</h1>
          <button onClick={() => setEditing(emptyRow())} className="ml-auto flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--primary)' }}>
            <Plus className="w-4 h-4" /> 추가
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {[
            { label: '빌려준 것', value: `${summary.lentQty}개`, sub: `${summary.lentCount}건 미회수`, alert: summary.lentCount > 0 },
            { label: '미입고', value: `${summary.pendingQty}개`, sub: `${summary.pendingCount}건`, alert: summary.pendingCount > 0 },
            { label: '불량품 누적', value: `${summary.defectQty}개`, sub: `${summary.defectCount}종`, alert: summary.defectQty > 0 },
            { label: '가장 오래된 건', value: summary.oldest ? `${summary.oldestDays}일` : '없음', sub: summary.oldest?.occurred_on || null, alert: summary.oldestDays >= 90 },
          ].map((c) => (
            <div key={c.label} className="px-3 py-2 rounded-xl border" style={{ background: 'var(--card)', borderColor: c.alert ? 'var(--destructive)' : 'var(--border)' }}>
              <div className="text-[11px] font-bold" style={{ color: 'var(--muted-foreground)' }}>{c.label}</div>
              <div className="text-lg font-black" style={{ color: c.alert ? 'var(--destructive)' : 'var(--foreground)' }}>{c.value}</div>
              {c.sub && <div className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{c.sub}</div>}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-2">
          {Object.entries(KIND).map(([k, v]) => (
            <button key={k} onClick={() => setTab(k)}
              className="px-3.5 py-2 rounded-xl text-sm font-bold border transition-all flex items-center gap-1.5"
              style={tab === k ? { background: v.color, color: 'white', borderColor: v.color } : { background: 'var(--card)', color: 'var(--muted-foreground)', borderColor: 'var(--border)' }}>
              {v.label}
              <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: tab === k ? 'rgba(255,255,255,0.25)' : 'var(--muted)' }}>{(byKind[k] || []).length}</span>
            </button>
          ))}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="품목, 규격, 비고 검색..."
              className="w-full pl-9 pr-3 py-2 rounded-xl text-sm border outline-none"
              style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onCopy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border transition-all hover:brightness-95"
            style={copied ? { background: 'var(--success)', color: '#fff', borderColor: 'var(--success)' } : { background: '#FEE500', color: '#3C1E1E', borderColor: '#FEE500' }}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? '복사됨!' : '카톡용 복사'}
          </button>
          <button onClick={onCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border"
            style={{ background: 'var(--card)', color: 'var(--foreground)', borderColor: 'var(--border)' }}>
            <FileDown className="w-4 h-4" /> CSV
          </button>
          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{KIND[tab].desc} · {filtered.length}건</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {loadFailed && (
          <div className="mb-4 p-4 rounded-xl border flex items-start gap-3" style={{ background: 'var(--card)', borderColor: 'var(--destructive)' }}>
            <Database className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--destructive)' }} />
            <div className="text-sm" style={{ color: 'var(--foreground)' }}>
              <div className="font-bold mb-1">수불 장부 테이블을 찾을 수 없습니다</div>
              <div style={{ color: 'var(--muted-foreground)' }}>
                Supabase 대시보드 &gt; SQL Editor 에서 <b>migrations/010_supplier_ledger.sql</b> 을 실행해주세요.
                (실행하면 시트의 체크리스트 18건 + 불량품 12종이 함께 들어옵니다)
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>{q ? '검색 결과가 없습니다' : `${KIND[tab].label} 내역이 없습니다`}</div>
        ) : (
          <div className="rounded-xl border overflow-x-auto" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <table className="w-full text-sm" style={{ minWidth: 860 }}>
              <thead>
                <tr style={{ background: 'var(--muted)' }}>
                  {['구분', tab === 'defect' ? '' : '발생일', '품목', '규격', '수량', '비고', '처리'].map((h, i) => (
                    <th key={i} className="px-3 py-2.5 text-left text-xs font-bold whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const days = r.occurred_on ? daysSince(r.occurred_on) : 0;
                  const lv = r.occurred_on && !r.resolved ? ageLevel(days) : 'ok';
                  return (
                    <tr key={r.id} className="border-t" style={{
                      borderColor: 'var(--border)',
                      background: lv === 'critical' ? 'color-mix(in srgb, var(--destructive) 6%, transparent)' : undefined,
                      opacity: r.resolved ? 0.5 : 1,
                    }}>
                      <td className="px-3 py-2.5"><KindBadge kind={r.kind} /></td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {r.occurred_on ? (
                          <>
                            <div className="tabular-nums" style={{ color: 'var(--foreground)' }}>{r.occurred_on}</div>
                            {!r.resolved && (
                              <div className="text-[11px] font-bold flex items-center gap-0.5" style={{ color: lv === 'critical' ? 'var(--destructive)' : lv === 'warn' ? 'var(--warning)' : 'var(--muted-foreground)' }}>
                                <Clock className="w-3 h-3" />{days}일
                              </div>
                            )}
                          </>
                        ) : <span style={{ color: 'var(--muted-foreground)' }}>-</span>}
                      </td>
                      <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--foreground)' }}>
                        <button onClick={() => setEditing({ ...r })} className="underline decoration-dotted">{r.item_name}</button>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs" style={{ color: 'var(--muted-foreground)' }}>{r.spec || '-'}</td>
                      <td className="px-3 py-2.5 text-lg font-black tabular-nums whitespace-nowrap" style={{ color: 'var(--foreground)' }}>{num(r.qty)}<span className="text-xs font-bold">{r.unit}</span></td>
                      <td className="px-3 py-2.5 text-xs whitespace-pre-line" style={{ color: r.note?.includes('확인 필요') ? 'var(--warning)' : 'var(--muted-foreground)' }}>
                        {r.note?.includes('확인 필요') && <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />}
                        {r.note || ''}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {r.kind !== 'defect' && (
                            <button onClick={() => toggleResolved(r)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap"
                              style={r.resolved ? { background: 'var(--muted)', color: 'var(--muted-foreground)' } : { background: 'var(--success)', color: 'white' }}>
                              {r.resolved ? <><Undo2 className="w-3.5 h-3.5" /> 되돌리기</> : <><Check className="w-3.5 h-3.5" /> {r.kind === 'lent' ? '돌려받음' : '입고됨'}</>}
                            </button>
                          )}
                          <button onClick={() => setConfirmDelete(r)} className="p-1.5 rounded-lg hover:bg-[var(--accent)]" style={{ color: 'var(--muted-foreground)' }} aria-label="삭제">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>
          여기는 <b>발주서와 무관하게</b> 오간 것들입니다. 발주서에 있는 건의 입고 잔량은 <b>[매입 발주] → 미입고 현황</b>에서 봅니다.
        </p>
      </div>

      {/* 추가/수정 */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={() => !saving && setEditing(null)}>
          <div className="w-full max-w-2xl rounded-2xl border overflow-hidden" style={{ background: 'var(--card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center gap-3" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
              <HandCoins className="w-6 h-6" style={{ color: 'var(--primary)' }} />
              <h2 className="text-2xl font-black" style={{ color: 'var(--foreground)' }}>{editing.id ? '수정' : '추가'}</h2>
              <button onClick={() => setEditing(null)} className="ml-auto p-2 rounded-lg hover:bg-[var(--accent)]" style={{ color: 'var(--muted-foreground)' }}><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <span className="text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>구분</span>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {Object.entries(KIND).map(([k, v]) => (
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
            <div className="px-6 py-4 border-t flex items-center gap-2" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
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
                정리된 건이면 삭제 말고 <b>[{confirmDelete.kind === 'lent' ? '돌려받음' : '입고됨'}]</b>을 쓰세요 — 이력이 남습니다.
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
