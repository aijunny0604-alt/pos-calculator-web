import { useState } from 'react';
import { X, Camera, Loader2, Check, AlertTriangle, FileSearch, Trash2 } from 'lucide-react';
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

function reconcile(stmt, orders) {
  const matchedOrders = (orders || []).filter((o) =>
    toDateKST(o.createdAt) === stmt.issue_date && custMatch(stmt.customer, o.customerName)
  );
  // POS 라인 펼치기
  const posLines = [];
  for (const o of matchedOrders) {
    for (const it of (o.items || [])) {
      posLines.push({ name: it.name || '', qty: num(it.quantity), total: itemPrice(it) * num(it.quantity), used: false, order: o });
    }
  }
  const posTotal = matchedOrders.reduce((s, o) => s + num(o.totalAmount), 0);
  // 라인 대조 — 명세서 각 라인을 POS 라인과 (금액 근사 + 수량) 매칭
  const stmtRows = stmt.items.map((it) => {
    const want = stmtLineTotal(it);
    let hit = posLines.find((p) => !p.used && p.qty === num(it.qty) && near(want, p.total));
    if (!hit) hit = posLines.find((p) => !p.used && near(want, p.total)); // 수량 다르면 금액만
    if (hit) hit.used = true;
    return { ...it, lineTotal: want, matched: !!hit, posName: hit?.name || null, posQty: hit?.qty ?? null };
  });
  const posOnly = posLines.filter((p) => !p.used);
  return {
    matchedOrders, posTotal, stmtRows, posOnly,
    totalDiff: num(stmt.stated_total) - posTotal,
    missingCount: stmtRows.filter((r) => !r.matched).length,
  };
}

export default function StatementReconcile({ orders, showToast, onClose }) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState([]); // [{ id, stmt, rec, imgUrl, error }]

  const handleFiles = async (fileList) => {
    const files = [...(fileList || [])].filter((f) => /^image\//.test(f.type || ''));
    if (!files.length) { showToast?.('이미지 파일을 선택해주세요', 'error'); return; }
    setBusy(true);
    for (const file of files) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const imgUrl = URL.createObjectURL(file);
      try {
        const { base64, mimeType } = await fileToScaledBase64(file, 1600);
        const res = await extractStatement(base64, mimeType);
        if (!res.ok) { setResults((r) => [...r, { id, imgUrl, error: res.error }]); continue; }
        const rec = reconcile(res.data, orders);
        setResults((r) => [...r, { id, imgUrl, stmt: res.data, rec }]);
      } catch (e) {
        setResults((r) => [...r, { id, imgUrl, error: e.message || '판독 실패' }]);
      }
    }
    setBusy(false);
  };

  const removeResult = (id) => setResults((r) => r.filter((x) => x.id !== id));

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl border flex flex-col" style={{ background: 'var(--card)', borderColor: 'var(--border)', maxHeight: '92vh' }} onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <FileSearch className="w-5 h-5" style={{ color: 'var(--primary)' }} />
          <h3 className="text-base font-bold flex-1">명세서 대조</h3>
          <button onClick={onClose}><X className="w-5 h-5 opacity-60" /></button>
        </div>

        <div className="overflow-y-auto px-4 py-3 space-y-3">
          <div className="text-xs rounded-lg p-2.5 border" style={{ background: 'rgba(0,212,255,0.06)', borderColor: 'var(--primary)', color: 'var(--foreground)' }}>
            부장님이 올린 <b>거래명세서 사진</b>을 올리면, <b>같은 거래처·같은 날짜의 주문내역</b>과 자동 대조해 <b>빠진 품목</b>을 찾아줍니다. 여러 장 한꺼번에 가능.
          </div>

          {/* 업로드 */}
          <label className="flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed cursor-pointer font-bold text-sm"
            style={{ borderColor: 'var(--primary)', color: 'var(--primary)', background: 'var(--background)' }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer?.files); }}>
            {busy ? <><Loader2 className="w-5 h-5 animate-spin" /> 판독 중...</> : <><Camera className="w-5 h-5" /> 명세서 사진 올리기 (카메라·갤러리)</>}
            <input type="file" accept="image/*" capture="environment" multiple className="hidden" disabled={busy}
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
          </label>

          {results.length === 0 && !busy && (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              아직 올린 명세서가 없어요. 위 버튼으로 사진을 올려보세요.
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
  const totalOk = Math.abs(rec.totalDiff) <= 150;
  const allGood = !noOrder && totalOk && rec.missingCount === 0 && rec.posOnly.length === 0;

  return (
    <div>
      {/* 헤더 요약 */}
      <div className="p-3" style={{ background: allGood ? 'rgba(16,185,129,0.08)' : noOrder ? 'rgba(255,77,109,0.08)' : 'rgba(255,170,0,0.08)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-black text-sm">{stmt.customer || '(거래처 미판독)'}</span>
          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{stmt.issue_date || '날짜?'}</span>
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-bold text-white"
            style={{ background: allGood ? 'var(--success)' : noOrder ? '#ff4d6d' : '#e6961b' }}>
            {allGood ? '✅ 일치' : noOrder ? '❌ 주문내역 없음' : '⚠️ 확인 필요'}
          </span>
          <button onClick={onRemove}><Trash2 className="w-3.5 h-3.5 opacity-50" /></button>
        </div>
        {noOrder ? (
          <div className="text-xs mt-1" style={{ color: '#ff4d6d' }}>
            <b>{stmt.customer}</b>의 <b>{stmt.issue_date}</b> 주문내역을 찾지 못했습니다. 주문 등록이 누락됐거나, 거래처명/날짜가 다를 수 있어요.
          </div>
        ) : (
          <div className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: 'var(--foreground)' }}>
            <span>명세서 합계 <b>₩{formatPrice(stmt.stated_total)}</b></span>
            <span>주문내역 합계 <b>₩{formatPrice(rec.posTotal)}</b></span>
            <span style={{ color: totalOk ? 'var(--success)' : '#ff4d6d', fontWeight: 700 }}>
              차액 {rec.totalDiff === 0 ? '없음 ✓' : `₩${formatPrice(Math.abs(rec.totalDiff))} ${rec.totalDiff > 0 ? '(명세서가 많음)' : '(주문내역이 많음)'}`}
            </span>
            <span style={{ color: 'var(--muted-foreground)' }}>· 매칭 주문 {rec.matchedOrders.length}건</span>
          </div>
        )}
      </div>

      {/* 라인 대조 */}
      {!noOrder && (
        <div className="border-t" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--muted)' }}>
                {['', '명세서 품목', '수량', '금액', '상태'].map((h, i) => (
                  <th key={i} className="px-2 py-1.5 text-left font-bold" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rec.stmtRows.map((row, i) => (
                <tr key={i} className="border-t" style={{ borderColor: 'var(--border)', background: row.matched ? undefined : 'rgba(255,77,109,0.07)' }}>
                  <td className="px-2 py-1.5">{row.matched ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} /> : <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#ff4d6d' }} />}</td>
                  <td className="px-2 py-1.5 font-semibold" style={{ color: 'var(--foreground)' }}>
                    {row.name}{row.spec ? ` (${row.spec})` : ''}
                    {row.matched && row.posName && row.posName.replace(/\s/g, '') !== row.name.replace(/\s/g, '') && (
                      <div className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>↔ 주문: {row.posName}{row.posQty != null && row.posQty !== num(row.qty) ? ` (수량 ${row.posQty})` : ''}</div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{num(row.qty)}</td>
                  <td className="px-2 py-1.5 tabular-nums">₩{formatPrice(row.lineTotal)}</td>
                  <td className="px-2 py-1.5 font-bold" style={{ color: row.matched ? 'var(--success)' : '#ff4d6d' }}>{row.matched ? '일치' : '누락?'}</td>
                </tr>
              ))}
              {/* POS엔 있는데 명세서엔 없는 것 */}
              {rec.posOnly.map((p, i) => (
                <tr key={`p${i}`} className="border-t" style={{ borderColor: 'var(--border)', background: 'rgba(255,170,0,0.07)' }}>
                  <td className="px-2 py-1.5">⚠️</td>
                  <td className="px-2 py-1.5" style={{ color: '#e6961b' }}>{p.name} <span className="text-[10px]">(주문내역엔 있는데 명세서에 없음)</span></td>
                  <td className="px-2 py-1.5 tabular-nums">{p.qty}</td>
                  <td className="px-2 py-1.5 tabular-nums">₩{formatPrice(p.total)}</td>
                  <td className="px-2 py-1.5 font-bold" style={{ color: '#e6961b' }}>명세서 X</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-2 py-1.5 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
            ※ 금액·수량 기준 자동 대조라 품목명이 달라도 금액이 맞으면 일치로 봅니다. 최종은 눈으로 한 번 더 확인하세요.
          </div>
        </div>
      )}
    </div>
  );
}
