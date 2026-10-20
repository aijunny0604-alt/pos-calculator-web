import MotionBackdrop from '@/components/ui/MotionBackdrop';
import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Camera, Loader2, Check, AlertTriangle, FileSearch, Trash2, ClipboardPaste, Save, History } from 'lucide-react';
import { fileToScaledBase64 } from '@/lib/certVision';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { extractStatement } from '@/lib/statementVision';
import { formatPrice, toDateKST } from '@/lib/utils';

import { reconcile, statusOf, MATCH_WINDOW_DAYS, buildStatementRecord, statementNumber } from '@/lib/statementReconcile';
const num = v => statementNumber(v) ?? 0;
const displayAmount = v => statementNumber(v) === null ? '미판독' : `₩${formatPrice(statementNumber(v))}`;

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

// 대조 상태 한 단어 — 저장 기록과 화면 뱃지가 같은 기준을 쓰도록 단일 소스
const STATUS_COLOR = { 일치: 'var(--success)', 합계일치: '#e6961b', 확인필요: '#e6961b', 주문내역없음: '#ff4d6d' };

// 명세서 원본을 증거로 Storage에 보관 (실패해도 기록 저장은 진행)
async function uploadStatementImage(file) {
  const ext = (file.name?.match(/\.(jpe?g|png|webp)$/i) || [, 'png'])[1];
  const path = `statement-recons/recon-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/product-images/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': file.type || 'image/png', 'x-upsert': 'true' },
    body: file,
  });
  if (!r.ok) throw new Error(`upload ${r.status}`);
  return { url: `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`, path };
}

export default function StatementReconcile({ orders, showToast, onClose }) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false), saving = useRef(new Set());
  const [pending, setPending] = useState([]); // 올려둔(아직 조회 안 한) 이미지 [{id,file,url}]
  const [results, setResults] = useState([]); // 조회 결과 [{ id, stmt, rec, imgUrl, error }]
  const [dragOver, setDragOver] = useState(false);
  const [savedIds, setSavedIds] = useState(() => new Set()); // 확인 완료 저장된 결과 id
  const [savingId, setSavingId] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  useEffect(() => {
    setResults(current => current.map(r => r.stmt && !savedIds.has(r.id) ? {...r, rec: reconcile(r.stmt, orders)} : r));
  }, [orders, savedIds]);
  const [logs, setLogs] = useState(null); // null=미로드, []=없음

  // 이미지 파일을 대기열에 추가만 (조회는 [일괄 조회] 버튼에서)
  const addFiles = useCallback((fileList) => {
    const imgs = [...(fileList || [])].filter((f) => /^image\//.test(f.type || ''));
    if (!imgs.length) { showToast?.('이미지를 인식하지 못했어요 — 카톡에서 복사(Ctrl+C) 후 붙여넣기(Ctrl+V) 해보세요', 'error'); return; }
    setPending((p) => [...p, ...imgs.map((f) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file: f, url: URL.createObjectURL(f) }))]);
  }, [showToast]);

  // 지난 대조 기록 조회
  const loadLogs = useCallback(async () => {
    const res = await supabase.getStatementReconLogs(100);
    if (res === null) { showToast?.('기록 조회 실패 — 마이그레이션 016 적용 여부를 확인해주세요', 'error'); setLogs([]); return; }
    setLogs(res || []);
  }, [showToast]);

  // [✅ 확인 완료] — 이 대조 결과를 기록으로 저장(원본 사진 포함)
  const saveLog = useCallback(async (r) => {
    if (!r?.rec || savedIds.has(r.id) || saving.current.size > 0) return;
    saving.current.add(r.id);
    setSavingId(r.id);
    try {
      const payload = buildStatementRecord(r.stmt, orders);
      let image_url = null, image_path = null;
      let imageFailed = false;
      if (r.file) { try { const up = await uploadStatementImage(r.file); image_url = up.url; image_path = up.path; } catch { imageFailed = true; } }
      Object.assign(payload, {image_url, image_path});
      const res = await supabase.addStatementReconLog(payload);
      if (!Array.isArray(res) || !res[0]?.id) { showToast?.('저장 실패 — 마이그레이션 016 적용 여부를 확인해주세요', 'error'); return; }
      setSavedIds((sv) => new Set([...sv, r.id]));
      showToast?.(imageFailed ? '대조 기록은 저장했지만 원본 사진 보관에 실패했습니다.' : '대조 기록을 저장했습니다 ✅', imageFailed ? 'warning' : 'success');
      if (showLogs) loadLogs();
    } catch (error) { showToast?.(error.message || '대조 기록 저장에 실패했습니다. 저장 여부를 확인해주세요.', 'error'); } finally { saving.current.delete(r.id); setSavingId(null); }
  }, [savedIds, showToast, showLogs, loadLogs, orders]);

  const deleteLog = async (id) => {
    const ok = await supabase.deleteStatementReconLog(id);
    if (!ok) { showToast?.('삭제 실패', 'error'); return; }
    setLogs((l) => (l || []).filter((x) => x.id !== id));
  };

  const removePending = (id) => setPending((p) => p.filter((x) => x.id !== id));
  const clearPending = () => setPending([]);
  const removeResult = (id) => setResults((r) => r.filter((x) => x.id !== id));

  // [일괄 조회] — 대기열 전부를 판독+대조
  const runReconcile = useCallback(async () => {
    if (running.current) return;
    if (!pending.length) { showToast?.('먼저 명세서 사진을 올려주세요', 'error'); return; }
    running.current = true;
    setBusy(true);
    const batchIds = new Set(pending.map(p => p.id));
    const out = [];
    for (const p of pending) {
      try {
        const { base64, mimeType } = await fileToScaledBase64(p.file, 2400);
        const res = await extractStatement(base64, mimeType);
        if (!res.ok) out.push({ id: p.id, imgUrl: p.url, file: p.file, error: res.error });
        else out.push({ id: p.id, imgUrl: p.url, file: p.file, stmt: res.data, rec: reconcile(res.data, orders) });
      } catch (e) { out.push({ id: p.id, imgUrl: p.url, file: p.file, error: e.message || '판독 실패' }); }
    }
    setResults((r) => [...out, ...r]); // 최신 조회가 위로
    setPending(current => current.filter(p => !batchIds.has(p.id)));
    running.current = false;
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
    <MotionBackdrop className="move-dialog-backdrop fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="move-dialog relative w-full sm:max-w-5xl rounded-t-2xl sm:rounded-2xl border flex flex-col" style={{ background: 'var(--card)', borderColor: 'var(--border)', maxHeight: '94dvh' }}
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
          <button onClick={() => { const n = !showLogs; setShowLogs(n); if (n && logs === null) loadLogs(); }}
            className="text-sm px-2.5 py-1.5 rounded-lg font-bold border flex items-center gap-1.5"
            style={showLogs ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : { background: 'var(--card)', color: 'var(--foreground)', borderColor: 'var(--border)' }}>
            <History className="w-4 h-4" /> 지난 기록
          </button>
          <button onClick={onClose}><X className="w-6 h-6 opacity-60" /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-3.5">
          <div className="text-sm rounded-lg p-3 border" style={{ background: 'rgba(0,212,255,0.06)', borderColor: 'var(--primary)', color: 'var(--foreground)' }}>
            거래명세서 사진을 <b>여러 장 올려두고</b>, 아래 <b>[일괄 조회]</b>를 누르면 <b>같은 거래처·발행일의 주문내역</b>과 대조해 <b>제품명·규격·수량·금액의 차이</b>를 표시합니다. 날짜가 다르거나 후보가 여러 건이면 확인이 필요합니다.
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

          {/* 지난 대조 기록 */}
          {showLogs && (
            <div className="rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
              <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
                <History className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                <span className="text-sm font-bold">지난 대조 기록 {logs ? `(${logs.length}건)` : ''}</span>
                <button onClick={loadLogs} className="ml-auto text-xs font-semibold" style={{ color: 'var(--primary)' }}>새로고침</button>
              </div>
              {logs === null ? (
                <div className="px-3 py-4 text-sm" style={{ color: 'var(--muted-foreground)' }}>불러오는 중...</div>
              ) : logs.length === 0 ? (
                <div className="px-3 py-4 text-sm" style={{ color: 'var(--muted-foreground)' }}>저장된 기록이 없습니다. 대조 후 [확인 완료]를 누르면 여기에 쌓입니다.</div>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y" style={{ borderColor: 'var(--border)' }}>
                  {logs.map((l) => (
                    <div key={l.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                      {l.image_url && <img src={l.image_url} alt="명세서" className="w-9 h-9 rounded object-cover border" style={{ borderColor: 'var(--border)' }} />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <b>{l.customer || '(거래처?)'}</b>
                          <span style={{ color: 'var(--muted-foreground)' }}>{l.issue_date || '-'}</span>
                          <span className="px-1.5 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: STATUS_COLOR[l.status] || 'var(--muted-foreground)' }}>{l.status}</span>
                          {l.match_by === 'amount' && <span className="text-xs font-bold" style={{ color: '#e6961b' }}>금액매칭</span>}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                          명세서 ₩{formatPrice(l.stated_total)} / 주문 ₩{formatPrice(l.pos_total)}
                          {num(l.total_diff) !== 0 ? ` · 차액 ₩${formatPrice(Math.abs(num(l.total_diff)))}` : ' · 차액 없음'}
                          {l.checked_at ? ` · ${String(l.checked_at).slice(0, 16).replace('T', ' ')}` : ''}
                        </div>
                      </div>
                      <button onClick={() => deleteLog(l.id)} style={{ color: 'var(--destructive)' }}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
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
                <StatementResult r={r} onEdit={stmt => setResults(current => current.map(x => x.id === r.id ? {...x, stmt, rec: reconcile(stmt, orders)} : x))} onRemove={() => removeResult(r.id)} onSave={() => saveLog(r)} saved={savedIds.has(r.id)} saving={savingId === r.id} saveDisabled={savingId !== null} />
              )}
            </div>
          ))}
        </div>

        <div className="flex-shrink-0 px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="w-full py-2.5 rounded-xl text-sm font-bold border" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>닫기</button>
        </div>
      </div>
    </MotionBackdrop>
  );
}

// 대조 결과를 카톡에 붙여넣을 텍스트로 (누락/추가 항목 정리)
function buildResultText(r) {
  const { stmt, rec } = r;
  const L = [`[명세서 대조] ${stmt.customer || '?'} · ${stmt.issue_date || '?'} · ${statusOf(rec)}`];
  L.push(`명세서 ${displayAmount(stmt.stated_total)} / 주문 ₩${formatPrice(rec.posTotal)} · 차액 ${!Number.isFinite(rec.totalDiff) ? '확인 필요' : rec.totalDiff === 0 ? '없음' : `₩${formatPrice(Math.abs(num(rec.totalDiff)))}`}`);
  const miss = rec.stmtRows.filter((x) => !x.matched);
  if (miss.length) { L.push('', '■ 명세서 품목 중 미확인 항목'); miss.forEach((x) => L.push(`· ${x.name} ${x.qty}개 — ₩${formatPrice(x.lineTotal)}`)); }
  if (rec.posOnly.length) { L.push('', '■ 주문내역엔 있는데 명세서에 없음'); rec.posOnly.forEach((x) => L.push(`· ${x.name} ${x.qty}개 — ₩${formatPrice(x.total)}`)); }
  if (statusOf(rec) === '일치') L.push('', '제품명·규격·수량·금액 일치 ✅');
  if(rec.issues?.length) L.push('', ...rec.issues.map(x=>'⚠ '+x));
  return L.join('\n');
}

export function StatementResult({ r, onRemove, onSave, onEdit, saved, saving, saveDisabled = false }) {
  const { stmt, rec } = r;
  const noOrder = rec.matchedOrders.length === 0;
  const totalOk = rec.totalOk;
  const status = statusOf(rec);
  const allGood = status === '일치';
  const totalMatchOnly = status === '합계일치';
  const badge = allGood ? { t: '✅ 일치', c: 'var(--success)' }
    : totalMatchOnly ? { t: '⚠️ 합계만 일치', c: '#e6961b' }
    : status === '주문내역없음' ? { t: '❌ 주문내역 없음', c: '#ff4d6d' }
    : { t: '⚠️ 확인 필요', c: '#e6961b' };

  return (
    <div>
      {/* 헤더 요약 */}
      <div className="p-3.5" style={{ background: allGood ? 'rgba(16,185,129,0.08)' : noOrder ? 'rgba(255,77,109,0.08)' : 'rgba(255,170,0,0.08)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-black text-lg">{stmt.customer || '(거래처 미판독)'}</span>
          <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{stmt.issue_date || '날짜?'}</span>
          <span className="ml-auto text-sm px-2.5 py-1 rounded-full font-black text-white" style={{ background: badge.c }}>{badge.t}</span>
          <button onClick={() => { navigator.clipboard?.writeText(buildResultText(r)); }}
            className="text-sm px-2 py-1 rounded-lg font-bold border" style={{ background: 'var(--card)', color: 'var(--foreground)', borderColor: 'var(--border)' }}
            title="대조 결과를 카톡에 붙여넣게 복사">📋</button>
          {/* 확인 완료 → 대조 기록 저장(원본 사진 포함) */}
          <button onClick={onSave} disabled={saved || saving || saveDisabled}
            className="text-sm px-2.5 py-1 rounded-lg font-bold border flex items-center gap-1 disabled:opacity-60"
            style={saved
              ? { background: 'rgba(16,185,129,0.15)', color: 'var(--success)', borderColor: 'var(--success)' }
              : { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }}
            title="이 대조 결과를 기록으로 저장합니다">
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 저장 중</> : saved ? <><Check className="w-3.5 h-3.5" /> 저장됨</> : <><Save className="w-3.5 h-3.5" /> 기록 저장</>}
          </button>
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
            <span>명세서 합계 <b>{displayAmount(stmt.stated_total)}</b></span>
            <span>주문내역 합계 <b>₩{formatPrice(rec.posTotal)}</b></span>
            <span style={{ color: totalOk ? 'var(--success)' : '#ff4d6d', fontWeight: 800 }}>
              차액 {!Number.isFinite(rec.totalDiff) ? '확인 필요' : rec.totalDiff === 0 ? '없음 ✓' : `₩${formatPrice(Math.abs(rec.totalDiff))} ${rec.totalDiff > 0 ? '(명세서가 많음)' : '(주문내역이 많음)'}`}
            </span>
            <span style={{ color: 'var(--muted-foreground)' }}>· 매칭 주문 {rec.matchedOrders.length}건 ({rec.matchedDates.join(', ')})</span>
            {totalMatchOnly && (
              <span className="w-full text-[13px] font-semibold" style={{ color: '#e6961b' }}>합계는 허용오차 안에 있지만 <b>제품명·규격·수량은 확인이 필요합니다.</b> 다른 물건이나 누락이 있을 수 있습니다.</span>
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

      {rec.issues?.length > 0 && <div className="p-3 text-sm space-y-1" style={{color:'#986116',background:'#fff8e8'}}>{rec.issues.map((issue,i)=><p key={i}>⚠ {issue}</p>)}</div>}
      {!rec.matchedOrders.length && rec.candidateOrders?.length > 0 && <div className="p-3 text-sm"><b>확인이 필요한 주문 후보</b>{rec.candidateOrders.slice(0,10).map((o,i)=><p key={o.id||i}>{o.orderNumber||o.order_number||o.id} · {o.customerName} · {toDateKST(o.createdAt)} · ₩{formatPrice(o.totalAmount)}</p>)}</div>}
      <details className="m-3 border rounded-xl p-3">
        <summary className="cursor-pointer font-semibold text-sm">원본 · 판독 결과 확인/수정 후 재대조</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>{r.imgUrl && <a href={r.imgUrl} target="_blank" rel="noreferrer"><img src={r.imgUrl} alt="업로드한 거래명세서 원본" className="w-full rounded-lg border" /></a>}</div>
          <fieldset disabled={saved || saving} className="min-w-0 space-y-3">
            <p className="text-xs text-[var(--muted-foreground)]">원본을 확인하고 수정하면 즉시 다시 대조합니다. 실제 주문은 변경하지 않습니다.</p>
            {[['customer','거래처'],['issue_date','발행일'],['stated_total','명세서 합계']].map(([key,label])=><label key={key} className="block text-sm">{label}<input className="block w-full border rounded-lg p-2 bg-[var(--card)]" aria-label={`판독 ${label}`} value={stmt[key] ?? ''} onChange={e=>onEdit({...stmt,[key]:e.target.value})}/></label>)}
            {stmt.items.map((item,i)=><div key={i} className="border rounded-lg p-3 space-y-2">
              <b className="text-sm">품목 {i+1}</b>
              {[['name','제품명'],['spec','규격'],['qty','수량'],['supply','공급가액'],['tax','세액']].map(([key,label])=><label key={key} className="block text-sm">{label}<input className="block w-full border rounded-lg p-2 bg-[var(--card)]" aria-label={`품목 ${i+1} ${label}`} value={item[key] ?? ''} onChange={e=>onEdit({...stmt,items:stmt.items.map((x,j)=>j===i?{...x,[key]:e.target.value}:x)})}/></label>)}
              <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={!!item.uncertain} onChange={e=>onEdit({...stmt,items:stmt.items.map((x,j)=>j===i?{...x,uncertain:e.target.checked}:x)})}/>판독 불확실 · 원본 확인 후 해제</label>
            </div>)}
          </fieldset>
        </div>
      </details>
      {/* 라인 대조 */}
      {!noOrder && (
        <div className="border-t overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full min-w-[560px] text-sm">
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
                const label = row.matched ? (row.combo ? '일치(묶음)' : '일치') : row.reason || '확인 필요';
                const refStr = row.refs.map((f) => `${f.name}${f.qty != null ? `(${f.qty})` : ''}`).join(' + ');
                const showRef = refStr && (row.combo || refStr.replace(/\s/g, '') !== String(row.name).replace(/\s/g, ''));
                return (
                  <tr key={i} className="border-t" style={{ borderColor: 'var(--border)', background: rowBg }}>
                    <td className="px-2.5 py-2 align-top">{row.matched ? <Check className="w-4 h-4" style={{ color: 'var(--success)' }} /> : <AlertTriangle className="w-4 h-4" style={{ color: okColor }} />}</td>
                    <td className="px-2.5 py-2 font-semibold" style={{ color: 'var(--foreground)' }}>
                      {row.name}{row.spec ? ` (${row.spec})` : ''}
                      {showRef && <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{row.matched ? '↔ 주문: ' : '확인 후보: '}{refStr}{row.combo ? ' [묶음]' : ''}</div>}
                    </td>
                    <td className="px-2.5 py-2 tabular-nums">{num(row.qty)}</td>
                    <td className="px-2.5 py-2 tabular-nums">{Number.isFinite(row.lineTotal) ? `₩${formatPrice(row.lineTotal)}` : '미판독'}</td>
                    <td className="px-2.5 py-2 font-bold" style={{ color: okColor }}>{label}</td>
                  </tr>
                );
              })}
              {/* POS엔 있는데 명세서엔 없는 것 */}
              {rec.posOnly.map((p, i) => (
                <tr key={`p${i}`} className="border-t" style={{ borderColor: 'var(--border)', background: 'rgba(255,170,0,0.07)' }}>
                  <td className="px-2.5 py-2">⚠️</td>
                  <td className="px-2.5 py-2" style={{ color: '#e6961b' }}>{p.name} <span className="text-xs">(명세서와 매칭되지 않음)</span></td>
                  <td className="px-2.5 py-2 tabular-nums">{p.qty}</td>
                  <td className="px-2.5 py-2 tabular-nums">₩{formatPrice(p.total)}</td>
                  <td className="px-2.5 py-2 font-bold" style={{ color: '#e6961b' }}>명세서 X</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-2.5 py-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
            ※ 제품명·규격·수량·금액을 함께 확인합니다. 다른 이름·규격이나 복합 묶음 표기는 자동 일치시키지 않습니다. 판독이 흐리면 원본을 확인하세요.
          </div>
        </div>
      )}
    </div>
  );
}
