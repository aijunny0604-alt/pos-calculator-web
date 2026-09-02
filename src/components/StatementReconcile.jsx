import { useState, useEffect, useCallback } from 'react';
import { X, Camera, Loader2, Check, AlertTriangle, FileSearch, Trash2, ClipboardPaste } from 'lucide-react';
import { fileToScaledBase64 } from '@/lib/certVision';
import { extractStatement } from '@/lib/statementVision';
import { formatPrice, toDateKST } from '@/lib/utils';

// 거래명세서(부장님이 단톡방에 올린 이미지) ↔ 오늘 주문내역 대조.
// 판독(Gemini) → 거래처+발행일로 POS 주문 매칭 → 합계·라인 대조 → 누락/불일치 표시.
// ⚠️ 규격 문자열 자동매칭 금지(오탐 사고). 라인 매칭은 (수량+금액 근사)로, 이름은 사람이 눈으로 확인.

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const itemPrice = (it) => num(it?.price ?? it?.wholesale ?? 0);

// 거래처명 토큰 매칭 — 어순 무관("스핀휠 진주"↔"진주 스핀휠"), 괄호/공백 무시.
function custMatch(a, b) {
  const tok = (s) => String(s || '').toLowerCase().replace(/[()[\]]/g, ' ').split(/\s+/).filter(Boolean);
  const na = tok(a), nb = tok(b);
  if (!na.length || !nb.length) return false;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  const longerJoined = longer.join('');
  return shorter.every((t) => longer.includes(t) || longerJoined.includes(t));
}

// 명세서 라인 VAT포함 총액 = 공급가액+세액. POS 라인 = 단가(VAT포함)×수량.
const stmtLineTotal = (it) => num(it.supply) + num(it.tax);
const near = (a, b) => Math.abs(a - b) <= Math.max(150, a * 0.02);

const MATCH_WINDOW_DAYS = 7; // 발행일 정확매칭 없을 때 이 일수 내(±) 그 거래처 주문으로 확장 대조
const dayDiff = (a, b) => Math.abs((new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 86400000);

// 조합(묶음) 매칭 — 명세서 1줄이 POS 여러 줄의 합일 때(예: "AL70 45-2 90-5" 7개 = 70-90 5개 + 70-45 2개).
// 남은 POS 라인들 중 합이 goal에 근사한 작은 부분집합을 찾는다(크기 2~4).
function findSubset(items, goal) {
  const n = items.length;
  const tol = Math.max(200, goal * 0.02);
  const rec = (start, size, acc, sum) => {
    if (size === 0) return Math.abs(sum - goal) <= tol ? acc.slice() : null;
    for (let i = start; i <= n - size; i++) {
      const r = rec(i + 1, size - 1, [...acc, items[i]], sum + items[i].total);
      if (r) return r;
    }
    return null;
  };
  for (let size = 2; size <= Math.min(4, n); size++) { const r = rec(0, size, [], 0); if (r) return r; }
  return null;
}

function reconcile(stmt, orders, windowDays = MATCH_WINDOW_DAYS) {
  const target = stmt.issue_date; // 명세서 발행일(YYYY-MM-DD)
  const stmtTotal = num(stmt.stated_total);
  const inWindow = (o) => { const ds = toDateKST(o.createdAt); return ds && (!target || dayDiff(ds, target) <= windowDays); };

  // 1) 거래처(어순무관 토큰매칭) → 정확 날짜 → ±window
  const byCust = (orders || []).filter((o) => custMatch(stmt.customer, o.customerName));
  let matchedOrders = target ? byCust.filter((o) => toDateKST(o.createdAt) === target) : [];
  let dateFuzzy = false, matchBy = 'customer';
  if (!matchedOrders.length && byCust.length) {
    const within = byCust.filter(inWindow);
    if (within.length) { matchedOrders = within; dateFuzzy = true; }
    else if (!target) { matchedOrders = byCust; dateFuzzy = true; }
  }
  // 2) 거래처 매칭 실패(상호명 OCR 오독 등) → 금액+날짜 폴백: ±window 내 합계가 명세서 합계와 근사한 주문
  if (!matchedOrders.length && stmtTotal > 0) {
    const single = (orders || []).filter((o) => inWindow(o) && near(stmtTotal, num(o.totalAmount)));
    if (single.length) { matchedOrders = single; dateFuzzy = true; matchBy = 'amount'; }
  }

  const matchedDates = [...new Set(matchedOrders.map((o) => toDateKST(o.createdAt)))].filter(Boolean).sort();
  const matchedCustomers = [...new Set(matchedOrders.map((o) => o.customerName).filter(Boolean))];

  // POS 라인 펼치기
  const posLines = [];
  for (const o of matchedOrders) for (const it of (o.items || [])) {
    posLines.push({ name: it.name || '', qty: num(it.quantity), total: itemPrice(it) * num(it.quantity), used: false });
  }
  const posTotal = matchedOrders.reduce((s, o) => s + num(o.totalAmount), 0);
  const totalDiff = stmtTotal - posTotal;
  const totalOk = Math.abs(totalDiff) <= Math.max(200, stmtTotal * 0.01);

  // 라인 대조: 1:1(수량+금액→금액) → 조합(명세서 1줄 = POS 여러 줄)
  const stmtRows = stmt.items.map((it) => {
    const want = stmtLineTotal(it);
    let hit = posLines.find((p) => !p.used && p.qty === num(it.qty) && near(want, p.total));
    if (!hit) hit = posLines.find((p) => !p.used && near(want, p.total));
    if (hit) hit.used = true;
    return { name: it.name, spec: it.spec, qty: num(it.qty), lineTotal: want, matched: !!hit, combo: false, refs: hit ? [{ name: hit.name, qty: hit.qty }] : [] };
  });
  for (const row of stmtRows) {
    if (row.matched) continue;
    const combo = findSubset(posLines.filter((p) => !p.used), row.lineTotal);
    if (combo) { combo.forEach((p) => { p.used = true; }); row.matched = true; row.combo = true; row.refs = combo.map((p) => ({ name: p.name, qty: p.qty })); }
  }
  const posOnly = posLines.filter((p) => !p.used);
  return {
    matchedOrders, matchedDates, matchedCustomers, dateFuzzy, matchBy, custFound: byCust.length,
    posTotal, totalDiff, totalOk, stmtRows, posOnly,
    missingCount: stmtRows.filter((r) => !r.matched).length,
  };
}

// DataTransfer/Clipboard에서 이미지 파일 뽑기 — 카톡 드래그(파일) + Ctrl+V(이미지 blob) 모두 대응.
// 드래그/클립보드에서 이미지를 뽑는다. DataTransfer는 이벤트 중에만 유효 → 동기로 files/urls 수집.
//  카톡 등은 파일 대신 HTML(<img src>)·URL로 넘기기도 해서 그 경로까지 커버.
function syncCollect(dt) {
  const files = [];
  const urls = new Set();
  if (dt?.files?.length) for (const f of dt.files) if (/^image\//.test(f.type || '')) files.push(f);
  // ⚠️ items는 files가 비었을 때만 — 클립보드는 같은 이미지를 files·items 양쪽에 노출해 2배 중복됨
  if (!files.length && dt?.items) for (const it of dt.items) {
    if (it.kind === 'file' && /^image\//.test(it.type || '')) { const f = it.getAsFile(); if (f) files.push(f); }
  }
  if (!files.length) {
    try { const h = dt.getData('text/html'); const m = h && h.match(/<img[^>]+src=["']([^"']+)["']/i); if (m) urls.add(m[1]); } catch { /* noop */ }
    try { const u = dt.getData('text/uri-list'); if (u) u.split(/\r?\n/).forEach((x) => { const t = x.trim(); if (t && !t.startsWith('#')) urls.add(t); }); } catch { /* noop */ }
    try { const t = dt.getData('text/plain'); const s = (t || '').trim(); if (s && /^(data:image|https?:|blob:)/.test(s)) urls.add(s); } catch { /* noop */ }
  }
  return { files, urls: [...urls] };
}
async function urlsToFiles(urls) {
  const out = [];
  for (const u of urls) {
    try { const b = await (await fetch(u)).blob(); if (/^image\//.test(b.type)) out.push(new File([b], 'dropped.png', { type: b.type })); } catch { /* CORS/파일접근 실패는 무시 */ }
  }
  return out;
}

export default function StatementReconcile({ orders, showToast, onClose }) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]); // 올려둔(아직 조회 안 한) 이미지 [{id,file,url}]
  const [results, setResults] = useState([]); // 조회 결과 [{ id, stmt, rec, imgUrl, error }]
  const [dragOver, setDragOver] = useState(false);

  // 이미지 파일을 대기열에 추가만 (조회는 [일괄 조회] 버튼에서)
  const addFiles = useCallback((fileList) => {
    const imgs = [...(fileList || [])].filter((f) => /^image\//.test(f.type || ''));
    if (!imgs.length) { showToast?.('이미지를 인식하지 못했어요 — 카톡에서 복사(Ctrl+C) 후 붙여넣기(Ctrl+V) 해보세요', 'error'); return; }
    setPending((p) => [...p, ...imgs.map((f) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file: f, url: URL.createObjectURL(f) }))]);
  }, [showToast]);

  const removePending = (id) => setPending((p) => p.filter((x) => x.id !== id));
  const clearPending = () => setPending([]);
  const removeResult = (id) => setResults((r) => r.filter((x) => x.id !== id));

  // [일괄 조회] — 대기열 전부를 판독+대조
  const runReconcile = useCallback(async () => {
    if (!pending.length) { showToast?.('먼저 명세서 사진을 올려주세요', 'error'); return; }
    setBusy(true);
    const out = [];
    for (const p of pending) {
      try {
        const { base64, mimeType } = await fileToScaledBase64(p.file, 1600);
        const res = await extractStatement(base64, mimeType);
        if (!res.ok) out.push({ id: p.id, imgUrl: p.url, error: res.error });
        else out.push({ id: p.id, imgUrl: p.url, stmt: res.data, rec: reconcile(res.data, orders) });
      } catch (e) { out.push({ id: p.id, imgUrl: p.url, error: e.message || '판독 실패' }); }
    }
    setResults((r) => [...out, ...r]); // 최신 조회가 위로
    setPending([]);
    setBusy(false);
    showToast?.(`${out.length}장 대조 완료`, 'success');
  }, [pending, orders, showToast]);

  // Ctrl+V 붙여넣기 — 카톡 이미지 복사 후 붙여넣기 (대기열에 추가만)
  useEffect(() => {
    const onPaste = (e) => {
      const { files, urls } = syncCollect(e.clipboardData);
      if (files.length) { e.preventDefault(); addFiles(files); }
      else if (urls.length) { e.preventDefault(); urlsToFiles(urls).then((fs) => fs.length ? addFiles(fs) : showToast?.('붙여넣기에서 이미지를 못 읽었어요 — 사진으로 복사됐는지 확인해주세요', 'error')); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles, showToast]);

  // 문서 전체 드롭 — 카톡창에서 끌어와 창 어디에 놓아도 인식(+ 파일 열림으로 페이지 이탈 방지)
  useEffect(() => {
    const onOver = (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; if (!dragOver) setDragOver(true); };
    const onDrop = (e) => {
      e.preventDefault();
      setDragOver(false);
      const { files, urls } = syncCollect(e.dataTransfer); // ⚠️ 동기 수집(이벤트 후엔 dataTransfer 무효)
      if (files.length) addFiles(files);
      else if (urls.length) urlsToFiles(urls).then((fs) => fs.length ? addFiles(fs) : showToast?.('드래그로는 이미지를 못 가져왔어요 — 카톡에서 복사(Ctrl+C)→붙여넣기(Ctrl+V)가 확실합니다', 'error'));
      else showToast?.('드래그로는 이미지를 못 가져왔어요 — 카톡에서 복사(Ctrl+C)→붙여넣기(Ctrl+V)가 확실합니다', 'error');
    };
    const onLeave = (e) => { if (e.relatedTarget == null) setDragOver(false); };
    document.addEventListener('dragover', onOver);
    document.addEventListener('drop', onDrop);
    document.addEventListener('dragleave', onLeave);
    return () => { document.removeEventListener('dragover', onOver); document.removeEventListener('drop', onDrop); document.removeEventListener('dragleave', onLeave); };
  }, [addFiles, dragOver, showToast]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="relative w-full sm:max-w-5xl rounded-t-2xl sm:rounded-2xl border flex flex-col" style={{ background: 'var(--card)', borderColor: 'var(--border)', maxHeight: '94vh' }}
        onClick={(e) => e.stopPropagation()}>
        {dragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed pointer-events-none" style={{ background: 'rgba(0,212,255,0.12)', borderColor: 'var(--primary)' }}>
            <div className="text-center font-black" style={{ color: 'var(--primary)' }}>
              <Camera className="w-10 h-10 mx-auto mb-2" />여기에 명세서 사진을 놓으세요
            </div>
          </div>
        )}
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <FileSearch className="w-6 h-6" style={{ color: 'var(--primary)' }} />
          <h3 className="text-xl font-black flex-1">명세서 대조</h3>
          <button onClick={onClose}><X className="w-6 h-6 opacity-60" /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-3.5">
          <div className="text-sm rounded-lg p-3 border" style={{ background: 'rgba(0,212,255,0.06)', borderColor: 'var(--primary)', color: 'var(--foreground)' }}>
            거래명세서 사진을 <b>여러 장 올려두고</b>, 아래 <b>[일괄 조회]</b>를 누르면 <b>같은 거래처·비슷한 날짜(±7일)의 주문내역</b>과 한꺼번에 대조해 <b>빠진 품목</b>을 찾아줍니다.
            <br />📎 올리기: <b>클릭 업로드</b> · <b>Ctrl+V 붙여넣기</b>(카톡에서 이미지 복사 후) · 드래그드롭. <span style={{ color: '#e6961b' }}>카톡 드래그가 안 되면 <b>복사→붙여넣기(Ctrl+V)</b>가 가장 확실해요.</span>
          </div>

          {/* 업로드 */}
          <label className="flex flex-col items-center justify-center gap-1 py-4 rounded-xl border-2 border-dashed cursor-pointer font-bold text-sm"
            style={{ borderColor: 'var(--primary)', color: 'var(--primary)', background: 'var(--background)' }}>
            <span className="flex items-center gap-2"><Camera className="w-5 h-5" /> 명세서 사진 올리기 (카메라·갤러리)</span>
            <span className="flex items-center gap-1 text-[11px] font-semibold opacity-70"><ClipboardPaste className="w-3.5 h-3.5" /> 클릭 · 드래그드롭 · Ctrl+V 붙여넣기</span>
            <input type="file" accept="image/*" capture="environment" multiple className="hidden" disabled={busy}
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </label>

          {/* 대기열(올려둔 사진) + 일괄 조회 버튼 */}
          {pending.length > 0 && (
            <div className="rounded-xl border p-2.5" style={{ borderColor: 'var(--primary)', background: 'rgba(0,212,255,0.05)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold" style={{ color: 'var(--foreground)' }}>올려둔 명세서 {pending.length}장</span>
                <button onClick={clearPending} className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>모두 지우기</button>
              </div>
              <div className="flex flex-wrap gap-2 mb-2.5">
                {pending.map((p) => (
                  <div key={p.id} className="relative w-16 h-16 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                    <img src={p.url} alt="명세서" className="w-full h-full object-cover" />
                    <button onClick={() => removePending(p.id)} className="absolute top-0 right-0 w-5 h-5 flex items-center justify-center text-white" style={{ background: 'rgba(0,0,0,0.6)' }}><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
              <button onClick={runReconcile} disabled={busy}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'var(--primary)' }}>
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> 대조 중...</> : <><FileSearch className="w-4 h-4" /> 일괄 조회 ({pending.length}장 대조)</>}
              </button>
            </div>
          )}

          {pending.length === 0 && results.length === 0 && !busy && (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              아직 올린 명세서가 없어요. 위 버튼/붙여넣기로 사진을 올린 뒤 <b>[일괄 조회]</b>를 누르세요.
            </div>
          )}

          {/* 결과 카드들 */}
          {results.map((r) => (
            <div key={r.id} className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              {r.error ? (
                <div className="p-3 flex items-start gap-2 text-sm" style={{ background: 'rgba(255,77,109,0.08)', color: '#ff4d6d' }}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">판독 실패: {r.error}</div>
                  <button onClick={() => removeResult(r.id)}><Trash2 className="w-4 h-4 opacity-60" /></button>
                </div>
              ) : (
                <StatementResult r={r} onRemove={() => removeResult(r.id)} />
              )}
            </div>
          ))}
        </div>

        <div className="flex-shrink-0 px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="w-full py-2.5 rounded-xl text-sm font-bold border" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>닫기</button>
        </div>
      </div>
    </div>
  );
}

function StatementResult({ r, onRemove }) {
  const { stmt, rec } = r;
  const noOrder = rec.matchedOrders.length === 0;
  const totalOk = rec.totalOk;
  const linesClean = rec.missingCount === 0 && rec.posOnly.length === 0;
  const allGood = !noOrder && totalOk && linesClean;
  const totalMatchOnly = !noOrder && totalOk && !linesClean; // 합계는 맞고 품목 묶음만 다름
  const badge = allGood ? { t: '✅ 일치', c: 'var(--success)' }
    : totalMatchOnly ? { t: '✅ 합계 일치', c: 'var(--success)' }
    : noOrder ? { t: '❌ 주문내역 없음', c: '#ff4d6d' }
    : { t: '⚠️ 확인 필요', c: '#e6961b' };

  return (
    <div>
      {/* 헤더 요약 */}
      <div className="p-3.5" style={{ background: (allGood || totalMatchOnly) ? 'rgba(16,185,129,0.08)' : noOrder ? 'rgba(255,77,109,0.08)' : 'rgba(255,170,0,0.08)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-black text-lg">{stmt.customer || '(거래처 미판독)'}</span>
          <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{stmt.issue_date || '날짜?'}</span>
          <span className="ml-auto text-sm px-2.5 py-1 rounded-full font-black text-white" style={{ background: badge.c }}>{badge.t}</span>
          <button onClick={onRemove}><Trash2 className="w-4 h-4 opacity-50" /></button>
        </div>
        {noOrder ? (
          <div className="text-sm mt-1.5" style={{ color: '#ff4d6d' }}>
            {rec.custFound === 0
              ? <><b>{stmt.customer || '이 거래처'}</b> 주문내역을 찾지 못했습니다. 거래처명이 다르게 등록됐거나 주문 등록이 누락됐을 수 있어요.</>
              : <><b>{stmt.customer}</b> 주문은 있으나 <b>{stmt.issue_date}</b> 전후 {'±'}{MATCH_WINDOW_DAYS}일 내에 없습니다. 주문 날짜를 확인하세요.</>}
          </div>
        ) : (
          <div className="text-sm mt-1.5 flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--foreground)' }}>
            <span>명세서 합계 <b>₩{formatPrice(stmt.stated_total)}</b></span>
            <span>주문내역 합계 <b>₩{formatPrice(rec.posTotal)}</b></span>
            <span style={{ color: totalOk ? 'var(--success)' : '#ff4d6d', fontWeight: 800 }}>
              차액 {rec.totalDiff === 0 ? '없음 ✓' : `₩${formatPrice(Math.abs(rec.totalDiff))} ${rec.totalDiff > 0 ? '(명세서가 많음)' : '(주문내역이 많음)'}`}
            </span>
            <span style={{ color: 'var(--muted-foreground)' }}>· 매칭 주문 {rec.matchedOrders.length}건 ({rec.matchedDates.join(', ')})</span>
            {totalMatchOnly && (
              <span className="w-full text-[13px] font-semibold" style={{ color: 'var(--success)' }}>합계가 정확히 맞습니다 — 아래 표시는 <b>품목 묶음/표기 차이</b>일 뿐, 빠진 물건이 아닙니다.</span>
            )}
            {rec.matchBy === 'amount' && (
              <span className="w-full px-1.5 py-0.5 rounded-lg font-bold" style={{ background: 'rgba(255,170,0,0.18)', color: '#e6961b' }}>
                ⚠️ 상호명 판독이 불확실해 <b>합계금액·날짜로 매칭</b>했습니다 (거래처: {rec.matchedCustomers.join(', ') || '?'}). 맞는지 확인하세요.
              </span>
            )}
            {rec.dateFuzzy && rec.matchBy !== 'amount' && (
              <span className="px-1.5 py-0.5 rounded-lg font-bold" style={{ background: 'rgba(255,170,0,0.18)', color: '#e6961b' }}>
                ⚠️ 발행일과 주문 날짜가 달라 근처 날짜(±{MATCH_WINDOW_DAYS}일)로 대조함
              </span>
            )}
          </div>
        )}
      </div>

      {/* 라인 대조 */}
      {!noOrder && (
        <div className="border-t" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--muted)' }}>
                {['', '명세서 품목', '수량', '금액', '상태'].map((h, i) => (
                  <th key={i} className="px-2.5 py-2 text-left text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rec.stmtRows.map((row, i) => {
                // 합계가 맞으면 미매칭도 '묶음 확인'(주황), 합계가 틀리면 '누락?'(빨강)
                const okColor = row.matched ? 'var(--success)' : totalOk ? '#e6961b' : '#ff4d6d';
                const rowBg = row.matched ? undefined : totalOk ? 'rgba(255,170,0,0.07)' : 'rgba(255,77,109,0.07)';
                const label = row.matched ? (row.combo ? '일치(묶음)' : '일치') : totalOk ? '묶음 확인' : '누락?';
                const refStr = row.refs.map((f) => `${f.name}${f.qty != null ? `(${f.qty})` : ''}`).join(' + ');
                const showRef = row.matched && refStr && (row.combo || refStr.replace(/\s/g, '') !== String(row.name).replace(/\s/g, ''));
                return (
                  <tr key={i} className="border-t" style={{ borderColor: 'var(--border)', background: rowBg }}>
                    <td className="px-2.5 py-2 align-top">{row.matched ? <Check className="w-4 h-4" style={{ color: 'var(--success)' }} /> : <AlertTriangle className="w-4 h-4" style={{ color: okColor }} />}</td>
                    <td className="px-2.5 py-2 font-semibold" style={{ color: 'var(--foreground)' }}>
                      {row.name}{row.spec ? ` (${row.spec})` : ''}
                      {showRef && <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>↔ 주문: {refStr}{row.combo ? ' [묶음]' : ''}</div>}
                    </td>
                    <td className="px-2.5 py-2 tabular-nums">{num(row.qty)}</td>
                    <td className="px-2.5 py-2 tabular-nums">₩{formatPrice(row.lineTotal)}</td>
                    <td className="px-2.5 py-2 font-bold" style={{ color: okColor }}>{label}</td>
                  </tr>
                );
              })}
              {/* POS엔 있는데 명세서엔 없는 것 */}
              {rec.posOnly.map((p, i) => (
                <tr key={`p${i}`} className="border-t" style={{ borderColor: 'var(--border)', background: 'rgba(255,170,0,0.07)' }}>
                  <td className="px-2.5 py-2">⚠️</td>
                  <td className="px-2.5 py-2" style={{ color: '#e6961b' }}>{p.name} <span className="text-xs">({totalOk ? '묶음/표기 차이' : '주문내역엔 있는데 명세서에 없음'})</span></td>
                  <td className="px-2.5 py-2 tabular-nums">{p.qty}</td>
                  <td className="px-2.5 py-2 tabular-nums">₩{formatPrice(p.total)}</td>
                  <td className="px-2.5 py-2 font-bold" style={{ color: '#e6961b' }}>명세서 X</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-2.5 py-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
            ※ 금액·수량 기준 자동 대조(묶음 표기 차이 자동 인식). 품목명이 달라도 금액이 맞으면 일치로 봅니다. 최종은 눈으로 한 번 더 확인하세요.
          </div>
        </div>
      )}
    </div>
  );
}
