import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, X, Trash2, Copy, Check, Printer, Database, PackageCheck, RotateCcw, ClipboardPaste, Minus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getTodayKST } from '@/lib/utils';

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

export default function DefectReturns({ showToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState(null); // { id?, return_date, supplier, items, memo, status }
  const [saving, setSaving] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
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

  const openNew = () => {
    setPasteText('');
    setEditing({ return_date: getTodayKST(), supplier: 'JSR', items: [], memo: '', status: '진행중' });
  };
  const openEdit = (row) => {
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
      <h3>${cat}</h3>
      <table><thead><tr><th>규격</th><th>수량</th></tr></thead><tbody>
        ${arr.map((it) => `<tr><td>${it.spec}</td><td>${num(it.qty)}${it.unit}</td></tr>`).join('')}
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
      <div class="sub">발송일 ${row.return_date} · 매입처 ${row.supplier}</div>
      ${body}
      <div class="total">총합 : ${summaryLabel(s)}</div>
      ${row.memo ? `<div class="memo">${row.memo}</div>` : ''}
    </body></html>`);
    w.document.close(); w.focus(); w.print();
  };

  const openCount = useMemo(() => rows.filter((r) => r.status !== '완료').length, [rows]);

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
      <div className="p-3 rounded-xl border flex items-start gap-2.5 text-xs" style={{ background: 'rgba(0,212,255,0.06)', borderColor: 'var(--primary)' }}>
        <RotateCcw className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--primary)' }} />
        <div style={{ color: 'var(--foreground)' }}>
          <b>JSR로 발송한 불량품 묶음 + 교환품 회수</b>를 추적하는 곳입니다.
          <br />발생만 하고 아직 안 보낸 <b>누적 불량품 목록</b>은 <b>[JSR 수불 장부] → 불량품</b> 탭에서 봅니다.
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={openNew} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--primary)' }}>
          <Plus className="w-4 h-4" /> 새 불량 반품 기록
        </button>
        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>진행 중 {openCount}건 · 전체 {rows.length}건</span>
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
          <PackageCheck className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--success)' }} />
          아직 불량품 반품 기록이 없습니다. <b>새 불량 반품 기록</b>으로 리스트를 붙여넣어 보세요.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => {
            const s = summarize(row.items);
            const done = row.status === '완료';
            const isOpen = expanded.has(row.id);
            const pct = s.totalQty ? Math.round((s.totalRec / s.totalQty) * 100) : 0;
            return (
              <div key={row.id} className="rounded-xl border overflow-hidden" style={{ background: 'var(--card)', borderColor: done ? 'var(--success)' : 'var(--border)' }}>
                <div className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">{row.supplier}</span>
                        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{row.return_date}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={done
                          ? { background: 'rgba(16,185,129,0.15)', color: 'var(--success)' }
                          : { background: 'rgba(255,176,32,0.15)', color: '#e6961b' }}>{done ? '완료' : '진행중'}</span>
                      </div>
                      <div className="text-lg font-black mt-0.5">{summaryLabel(s)}</div>
                      <div className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                        회수 {s.totalRec}/{s.totalQty} ({pct}%) · 품목 {row.items?.length || 0}종
                      </div>
                    </div>
                  </div>
                  {/* 회수 진행바 */}
                  <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: 'var(--muted)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--success)' : 'var(--primary)' }} />
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <button onClick={() => setExpanded((s2) => { const n = new Set(s2); n.has(row.id) ? n.delete(row.id) : n.add(row.id); return n; })}
                      className="px-2 py-1 rounded-lg text-xs font-bold border" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                      {isOpen ? '접기' : '품목·회수'}
                    </button>
                    <button onClick={() => copyKakao(row)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                      {copiedId === row.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} 복사
                    </button>
                    <button onClick={() => printRow(row)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                      <Printer className="w-3.5 h-3.5" /> 명세서
                    </button>
                    <button onClick={() => toggleStatus(row)} className="px-2 py-1 rounded-lg text-xs font-bold border" style={{ borderColor: 'var(--border)', color: done ? '#e6961b' : 'var(--success)' }}>
                      {done ? '진행중으로' : '완료 처리'}
                    </button>
                    <button onClick={() => openEdit(row)} className="px-2 py-1 rounded-lg text-xs font-bold border ml-auto" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>수정</button>
                    <button onClick={() => setConfirmDel(row)} className="p-1.5 rounded-lg" style={{ color: 'var(--destructive)' }}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t px-3 py-2 space-y-1" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
                    {(row.items || []).map((it, i) => {
                      const full = num(it.received_qty) >= num(it.qty);
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs py-1">
                          {it.category && <span className="px-1.5 py-0.5 rounded font-bold text-[10px]" style={{ background: 'var(--card)', color: 'var(--muted-foreground)' }}>{it.category}</span>}
                          <span className="font-mono font-bold flex-1 truncate" style={{ color: full ? 'var(--success)' : 'var(--foreground)' }}>{it.spec}</span>
                          <span style={{ color: 'var(--muted-foreground)' }}>{num(it.qty)}{it.unit}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => bump(row, i, -1)} disabled={num(it.received_qty) <= 0} className="p-1 rounded disabled:opacity-30" style={{ background: 'var(--card)' }}><Minus className="w-3 h-3" /></button>
                            <span className="w-10 text-center font-bold" style={{ color: full ? 'var(--success)' : '#e6961b' }}>{num(it.received_qty)}/{num(it.qty)}</span>
                            <button onClick={() => bump(row, i, 1)} disabled={num(it.received_qty) >= num(it.qty)} className="p-1 rounded disabled:opacity-30" style={{ background: 'var(--card)' }}><Plus className="w-3 h-3" /></button>
                          </div>
                        </div>
                      );
                    })}
                    <div className="text-[11px] pt-1" style={{ color: 'var(--muted-foreground)' }}>+/- 로 교환품 회수 수량을 기록하세요. 전량 회수되면 자동 완료됩니다.</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 기록/수정 모달 */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }} onClick={() => !saving && setEditing(null)}>
          <div className="w-full max-w-2xl rounded-2xl border flex flex-col" style={{ background: 'var(--card)', borderColor: 'var(--border)', maxHeight: '92vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              <RotateCcw className="w-5 h-5" style={{ color: 'var(--primary)' }} />
              <h3 className="text-base font-bold flex-1">{editing.id ? '불량 반품 수정' : '새 불량 반품 기록'}</h3>
              <button onClick={() => !saving && setEditing(null)}><X className="w-5 h-5 opacity-60" /></button>
            </div>
            <div className="overflow-y-auto px-4 py-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-bold" style={{ color: 'var(--muted-foreground)' }}>발송일
                  <input type="date" value={editing.return_date} onChange={(e) => setEditing({ ...editing, return_date: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                </label>
                <label className="text-xs font-bold" style={{ color: 'var(--muted-foreground)' }}>매입처
                  <input value={editing.supplier} onChange={(e) => setEditing({ ...editing, supplier: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                </label>
              </div>

              {/* 리스트 붙여넣기 파서 */}
              {!editing.id && (
                <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--primary)', background: 'rgba(0,212,255,0.06)' }}>
                  <div className="flex items-center gap-1.5 text-xs font-bold mb-1.5" style={{ color: 'var(--primary)' }}>
                    <ClipboardPaste className="w-4 h-4" /> 불량품 리스트 붙여넣기 → 자동 인식
                  </div>
                  <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4}
                    placeholder={'예)\n■ NPK\n* NPK 114D-T : 4개\n* VP KIT : 1세트'}
                    className="w-full px-3 py-2 rounded-lg border text-xs font-mono" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                  <button onClick={applyPaste} className="mt-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: 'var(--primary)' }}>품목 불러오기</button>
                </div>
              )}

              {/* 품목 편집 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold" style={{ color: 'var(--muted-foreground)' }}>품목 {editing.items.length}종</span>
                  <button onClick={addItem} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}><Plus className="w-3 h-3" /> 행 추가</button>
                </div>
                <div className="space-y-1 max-h-[38vh] overflow-y-auto">
                  {editing.items.length === 0 ? (
                    <div className="text-xs py-6 text-center" style={{ color: 'var(--muted-foreground)' }}>위에 리스트를 붙여넣거나 행을 추가하세요</div>
                  ) : editing.items.map((it, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input value={it.category} onChange={(e) => setItem(i, { category: e.target.value })} placeholder="분류"
                        className="w-16 px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                      <input value={it.spec} onChange={(e) => setItem(i, { spec: e.target.value })} placeholder="규격/품명"
                        className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border text-xs font-mono" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                      <input type="number" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })}
                        className="w-14 px-2 py-1.5 rounded-lg border text-xs text-right" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                      <select value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })}
                        className="px-1.5 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                        <option value="개">개</option><option value="세트">세트</option>
                      </select>
                      <button onClick={() => delItem(i)} className="p-1.5 rounded-lg" style={{ color: 'var(--destructive)' }}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
                {editing.items.length > 0 && (
                  <div className="text-xs font-bold mt-1.5 text-right" style={{ color: 'var(--foreground)' }}>총합 {summaryLabel(summarize(editing.items))}</div>
                )}
              </div>

              <label className="text-xs font-bold block" style={{ color: 'var(--muted-foreground)' }}>메모 (선택)
                <textarea value={editing.memo || ''} onChange={(e) => setEditing({ ...editing, memo: e.target.value })} rows={2}
                  placeholder="교환 조건, 담당자 등"
                  className="mt-1 w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
              </label>
            </div>
            <div className="flex items-center gap-2 px-4 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => !saving && setEditing(null)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>취소</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: 'var(--primary)' }}>{saving ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={() => setConfirmDel(null)}>
          <div className="w-full max-w-sm rounded-2xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <div className="font-bold mb-2">이 불량 반품 기록을 삭제할까요?</div>
            <div className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>{confirmDel.supplier} · {confirmDel.return_date} · {summaryLabel(summarize(confirmDel.items))}</div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(null)} className="flex-1 py-2 rounded-xl text-sm font-bold border" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>취소</button>
              <button onClick={doDelete} className="flex-1 py-2 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--destructive)' }}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
