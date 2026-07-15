import { useState, useMemo } from 'react';
import { X, AlertTriangle, Check, Gift, Trash2, Camera, Loader2 } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { findFillTargets } from '@/lib/quoteVision';
import { daysSince } from '@/lib/purchaseExport';

// 발주서 사진 판독 결과 확인 모달.
// ⚠️ 매입 증빙이라 절대 자동 저장하지 않는다 — 사장님이 눈으로 보고 고치고 [등록] 눌러야 들어간다.
// 판독기가 틀릴 수 있으므로 모든 칸을 수정 가능하게 두고, 산술 검산 결과를 눈에 띄게 보여준다.

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export default function QuoteScanModal({ scan, pos, onClose, onConfirm, saving, imgUrl }) {
  const [q, setQ] = useState(scan);
  // 무상 보전 행 → 어느 발주의 미입고를 채울지. { [행 index]: {poId, itemSpec} }
  const [fills, setFills] = useState(() => {
    const init = {};
    (scan.items || []).forEach((it, i) => {
      if (!it.freeFill) return;
      const cands = findFillTargets(it, pos);
      if (cands.length === 1) init[i] = `${cands[0].po.id}|${cands[0].item.spec}`; // 후보 1개면 자동 선택
    });
    return init;
  });

  const patch = (i, p) => setQ((prev) => ({ ...prev, items: prev.items.map((it, idx) => (idx === i ? { ...it, ...p } : it)) }));
  const removeRow = (i) => setQ((prev) => ({ ...prev, items: prev.items.filter((_, idx) => idx !== i) }));

  // 화면에서 실시간 재검산 — 사장님이 값을 고치면 즉시 반영
  const calc = useMemo(() => {
    const total = (q.items || []).reduce((s, it) => s + num(it.unit_price) * num(it.qty), 0);
    const mismatch = (q.items || [])
      .map((it, i) => ({ i, it, calc: num(it.unit_price) * num(it.qty) }))
      .filter(({ it, calc }) => num(it.supply) !== calc);
    return { total, mismatch, statedOk: total === num(q.stated_total) };
  }, [q]);

  const dupPo = useMemo(() => (pos || []).find((p) => String(p.quote_no || '').split(',').map((s) => s.trim()).includes(q.quote_no)), [pos, q.quote_no]);

  const freeRows = (q.items || []).map((it, i) => ({ it, i })).filter(({ it }) => it.freeFill);

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-2 sm:p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => !saving && onClose()}>
      <div className="w-full max-w-[92rem] max-h-[94vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="flex-shrink-0 px-6 py-4 border-b flex items-center gap-3" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
          <Camera className="w-6 h-6" style={{ color: 'var(--primary)' }} />
          <h2 className="text-2xl font-black" style={{ color: 'var(--foreground)' }}>발주서 판독 결과</h2>
          <span className="text-sm font-mono font-bold px-2.5 py-1 rounded-lg" style={{ background: 'var(--card)', color: 'var(--muted-foreground)' }}>{q.quote_no || '관리번호 없음'}</span>
          <button onClick={onClose} className="ml-auto p-2 rounded-lg hover:bg-[var(--accent)]" style={{ color: 'var(--muted-foreground)' }}><X className="w-6 h-6" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* 경고 */}
          {dupPo && (
            <div className="mb-4 p-3 rounded-xl border flex items-center gap-2 text-sm" style={{ background: 'var(--card)', borderColor: 'var(--destructive)', color: 'var(--foreground)' }}>
              <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--destructive)' }} />
              <span><b>{q.quote_no}</b> 관리번호가 이미 <b>{dupPo.po_number}</b>에 등록돼 있습니다. 중복 등록일 수 있습니다.</span>
            </div>
          )}
          {calc.mismatch.length > 0 && (
            <div className="mb-4 p-3 rounded-xl border text-sm" style={{ background: 'var(--card)', borderColor: 'var(--warning)', color: 'var(--foreground)' }}>
              <div className="flex items-center gap-2 font-bold mb-1"><AlertTriangle className="w-5 h-5" style={{ color: 'var(--warning)' }} />단가×수량과 공급가액이 다른 행이 있습니다</div>
              {calc.mismatch.map(({ it, calc: c }) => (
                <div key={it.spec} style={{ color: 'var(--muted-foreground)' }}>
                  · {it.spec}: 계산 ₩{formatPrice(c)} vs 발주서 표기 ₩{formatPrice(it.supply)} ({num(it.supply) - c > 0 ? '+' : ''}{num(it.supply) - c}원)
                </div>
              ))}
              <div className="mt-1" style={{ color: 'var(--muted-foreground)' }}>판독 오류이거나 발주서 원본 오류입니다. 원본을 확인해주세요. (등록은 <b>단가×수량</b> 기준으로 됩니다)</div>
            </div>
          )}
          {q.checks?.uncertainCount > 0 && (
            <div className="mb-4 p-3 rounded-xl border flex items-center gap-2 text-sm" style={{ background: 'var(--card)', borderColor: 'var(--warning)', color: 'var(--foreground)' }}>
              <AlertTriangle className="w-5 h-5" style={{ color: 'var(--warning)' }} />
              글자가 흐려서 확신 못 한 행이 <b>{q.checks.uncertainCount}개</b> 있습니다 (아래 노란 테두리). 원본과 대조해주세요.
            </div>
          )}

          <div className="grid lg:grid-cols-[1fr_360px] gap-5">
            <div>
              {/* 발주 정보 */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { k: 'supplier', l: '매입처', t: 'text' },
                  { k: 'order_date', l: '발주일', t: 'date' },
                  { k: 'quote_no', l: '관리번호', t: 'text' },
                ].map((f) => (
                  <label key={f.k} className="block">
                    <span className="text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>{f.l}</span>
                    <input type={f.t} value={q[f.k] || ''} onChange={(e) => setQ({ ...q, [f.k]: e.target.value })}
                      className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl text-base border outline-none"
                      style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                  </label>
                ))}
              </div>

              {/* 품목 표 */}
              <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
                <table className="w-full" style={{ minWidth: 820 }}>
                  <thead>
                    <tr style={{ background: 'var(--muted)' }}>
                      {['품명', '규격명', '단가', '수량', '계산 금액', '비고', ''].map((h) => (
                        <th key={h} className="px-2.5 py-2.5 text-left text-sm font-bold whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(q.items || []).map((it, i) => {
                      const st = { background: 'var(--background)', borderColor: it.uncertain ? 'var(--warning)' : 'var(--border)', color: 'var(--foreground)' };
                      return (
                        <tr key={i} className="border-t" style={{ borderColor: 'var(--border)', background: it.freeFill ? 'color-mix(in srgb, var(--success) 8%, transparent)' : undefined }}>
                          <td className="px-2.5 py-2">
                            <div className="flex items-center gap-1.5">
                              {it.freeFill && <Gift className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--success)' }} title="무상 보전" />}
                              <input value={it.name} onChange={(e) => patch(i, { name: e.target.value })} className="w-40 px-3 py-2 rounded-lg text-base border outline-none" style={st} />
                            </div>
                          </td>
                          <td className="px-2.5 py-2"><input value={it.spec} onChange={(e) => patch(i, { spec: e.target.value })} className="w-40 px-3 py-2 rounded-lg text-base border outline-none font-mono text-sm" style={st} /></td>
                          <td className="px-2.5 py-2"><input type="number" value={it.unit_price} onChange={(e) => patch(i, { unit_price: e.target.value })} className="w-28 px-3 py-2 rounded-lg text-base border outline-none text-right tabular-nums" style={st} /></td>
                          <td className="px-2.5 py-2"><input type="number" value={it.qty} onChange={(e) => patch(i, { qty: e.target.value })} className="w-20 px-3 py-2 rounded-lg text-base border outline-none text-right tabular-nums" style={st} /></td>
                          <td className="px-2.5 py-2 text-right text-lg font-black tabular-nums whitespace-nowrap" style={{ color: 'var(--foreground)' }}>₩{formatPrice(num(it.unit_price) * num(it.qty))}</td>
                          <td className="px-2.5 py-2"><input value={it.note || ''} onChange={(e) => patch(i, { note: e.target.value })} className="w-36 px-3 py-2 rounded-lg text-sm border outline-none" style={st} /></td>
                          <td className="px-2.5 py-2"><button onClick={() => removeRow(i)} className="p-2 rounded-lg hover:bg-[var(--accent)]" style={{ color: 'var(--destructive)' }}><Trash2 className="w-4 h-4" /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
                      <td colSpan={4} className="px-2.5 py-3 text-right text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>합계 (단가×수량)</td>
                      <td className="px-2.5 py-3 text-right text-2xl font-black tabular-nums whitespace-nowrap" style={{ color: 'var(--foreground)' }}>₩{formatPrice(calc.total)}</td>
                      <td colSpan={2} className="px-2.5 py-3 text-xs" style={{ color: calc.statedOk ? 'var(--success)' : 'var(--warning)' }}>
                        {calc.statedOk ? '✅ 발주서 합계와 일치' : `⚠️ 발주서 표기 ₩${formatPrice(q.stated_total)}`}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* 무상 보전 연결 — JSR이 늦게 보낸 물건을 어느 발주에 채울지 */}
              {freeRows.length > 0 && (
                <div className="mt-4 p-4 rounded-xl border" style={{ background: 'color-mix(in srgb, var(--success) 5%, var(--card))', borderColor: 'var(--success)' }}>
                  <div className="flex items-center gap-2 font-bold mb-1" style={{ color: 'var(--foreground)' }}>
                    <Gift className="w-5 h-5" style={{ color: 'var(--success)' }} />
                    무상 보전 {freeRows.length}건 — 예전에 안 온 물건이 이번에 들어왔습니다
                  </div>
                  <p className="text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>
                    단가 0원 행은 신규 발주가 아니라 과거 미입고분을 채워준 것입니다. 어느 발주의 미입고를 채우는지 골라주시면 그 발주가 자동으로 입고 처리됩니다.
                  </p>
                  {freeRows.map(({ it, i }) => {
                    const cands = findFillTargets(it, pos);
                    return (
                      <div key={i} className="flex flex-wrap items-center gap-2 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
                        <span className="font-bold text-sm" style={{ color: 'var(--foreground)' }}>{it.spec}</span>
                        <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>×{num(it.qty)}개 →</span>
                        {cands.length === 0 ? (
                          <span className="text-sm font-bold" style={{ color: 'var(--warning)' }}>매칭되는 미입고 발주 없음 (그냥 기록만 됩니다)</span>
                        ) : (
                          <select
                            value={fills[i] || ''}
                            onChange={(e) => setFills({ ...fills, [i]: e.target.value })}
                            className="px-3 py-2 rounded-lg text-sm border outline-none flex-1 min-w-[260px]"
                            style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                          >
                            <option value="">연결 안 함 (기록만)</option>
                            {cands.map((c) => (
                              <option key={`${c.po.id}|${c.item.spec}`} value={`${c.po.id}|${c.item.spec}`}>
                                {c.po.order_date} {c.po.po_number} — 미입고 {c.remaining}개 ({daysSince(c.po.order_date)}일 묵음)
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 원본 사진 — 판독 결과와 나란히 대조 */}
            <div>
              <div className="text-sm font-bold mb-2" style={{ color: 'var(--muted-foreground)' }}>원본 사진 (대조용)</div>
              {imgUrl && <img src={imgUrl} alt="발주서 원본" className="w-full rounded-xl border bg-white" style={{ borderColor: 'var(--border)' }} />}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex-shrink-0 px-6 py-4 border-t flex items-center gap-2" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
          <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            품목 {(q.items || []).length}건 · 합계 <b style={{ color: 'var(--foreground)' }}>₩{formatPrice(calc.total)}</b>
            {q.dummyCount > 0 && ` · 더미행 ${q.dummyCount}개 자동 제외`}
          </span>
          <button onClick={onClose} className="ml-auto px-5 py-2.5 rounded-xl text-base font-bold border"
            style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>취소</button>
          <button onClick={() => onConfirm(q, fills)} disabled={saving}
            className="px-7 py-2.5 rounded-xl text-base font-bold text-white disabled:opacity-60 flex items-center gap-2" style={{ background: 'var(--primary)' }}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 등록 중...</> : <><Check className="w-4 h-4" /> 발주 등록</>}
          </button>
        </div>
      </div>
    </div>
  );
}
