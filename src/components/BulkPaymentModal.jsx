import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');

export default function BulkPaymentModal({ open, customer, records, onClose, onSaved }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('계좌이체');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 오래된 순으로 정렬 (invoice_date asc, id asc)
  const sortedRecords = useMemo(() => {
    if (!records) return [];
    return [...records]
      .filter((r) => Number(r.balance) > 0)
      .sort((a, b) => {
        const da = a.invoice_date || a.created_at || '';
        const db = b.invoice_date || b.created_at || '';
        if (da !== db) return da.localeCompare(db);
        return a.id - b.id;
      });
  }, [records]);

  const totalOutstanding = useMemo(
    () => sortedRecords.reduce((s, r) => s + Number(r.balance || 0), 0),
    [sortedRecords]
  );

  // 입금액을 오래된 순으로 자동 배분한 미리보기
  const allocation = useMemo(() => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return [];
    let remaining = amt;
    const result = [];
    for (const rec of sortedRecords) {
      if (remaining <= 0) break;
      const bal = Number(rec.balance);
      const apply = Math.min(remaining, bal);
      result.push({ record: rec, apply });
      remaining -= apply;
    }
    return result.map((a) => ({ ...a, remaining: a.record.balance - a.apply }));
  }, [amount, sortedRecords]);

  const totalAllocated = useMemo(() => allocation.reduce((s, a) => s + a.apply, 0), [allocation]);
  const overflow = Number(amount) - totalAllocated;

  useEffect(() => {
    if (open) { setAmount(''); setMethod('계좌이체'); setMemo(''); setError(''); }
  }, [open]);

  const handleSubmit = async () => {
    setError('');
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('입금액을 입력하세요'); return; }
    if (allocation.length === 0) { setError('배분할 미수가 없습니다'); return; }

    setSubmitting(true);
    try {
      // 배분된 각 레코드에 payment_history 추가
      for (const a of allocation) {
        await supabase.addPaymentHistory({
          payment_record_id: a.record.id,
          amount: a.apply,
          method,
          memo: memo ? `[일괄 ${new Date().toISOString().slice(0, 10)}] ${memo}` : `[일괄 배분] ${a.record.invoice_number || ''}`,
        });
      }
      onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e.message || '저장 실패');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !customer) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl border border-[var(--primary)] bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[var(--border)]">
          <h3 className="text-base font-bold flex items-center gap-2">
            <span>💳</span>
            <span>일괄 입금</span>
          </h3>
          <p className="text-[11px] text-[var(--muted-foreground)] mt-1">
            {customer.name} · 총 미수 <span className="text-red-400 font-bold">{fmt(totalOutstanding)}원</span>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* 입금액 */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              입금액<span className="text-red-400 ml-0.5">*</span>
            </label>
            <div className="relative">
              <input
                inputMode="numeric"
                value={amount ? Number(amount).toLocaleString('ko-KR') : ''}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="1000000"
                className="w-full px-3 py-2.5 pr-10 rounded-lg border border-[var(--border)] bg-[var(--background)] text-lg font-bold text-right"
                style={{ fontSize: '18px' }}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted-foreground)]">원</span>
            </div>
            {/* 빠른 입력 버튼 */}
            <div className="mt-2 flex gap-1.5 flex-wrap">
              <button
                onClick={() => setAmount(String(totalOutstanding))}
                className="px-2.5 py-1 text-[10px] rounded-md bg-[var(--primary)]/15 border border-[var(--primary)]/30 text-[var(--primary)] font-semibold"
              >
                전액 {fmt(totalOutstanding)}
              </button>
              {[1000000, 500000, 100000].map((v) => (
                totalOutstanding >= v && (
                  <button key={v} onClick={() => setAmount(String(v))} className="px-2 py-1 text-[10px] rounded-md bg-[var(--secondary)] border border-[var(--border)]">
                    {fmt(v)}원
                  </button>
                )
              ))}
            </div>
          </div>

          {/* 배분 미리보기 */}
          {Number(amount) > 0 && (
            <div className="p-3 rounded-lg bg-[var(--secondary)] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold">📊 자동 배분 미리보기 (오래된 순)</span>
                {overflow > 0 && (
                  <span className="text-[10px] text-orange-400">초과 {fmt(overflow)}원</span>
                )}
              </div>
              <div className="space-y-1.5">
                {allocation.length === 0 ? (
                  <p className="text-[11px] text-[var(--muted-foreground)] text-center py-2">미수 없음</p>
                ) : allocation.map(({ record, apply, remaining }) => (
                  <div key={record.id} className="text-[11px] flex items-center justify-between gap-2 p-2 rounded bg-[var(--background)]">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">
                        {record.invoice_number ? `#${record.invoice_number}` : `#${record.id}`}
                        <span className="text-[var(--muted-foreground)] font-normal ml-1">{record.invoice_date || ''}</span>
                      </div>
                      <div className="text-[var(--muted-foreground)]">
                        잔 {fmt(record.balance)} → {remaining === 0 ? '✅ 완납' : `${fmt(remaining)} 남음`}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-green-400">+{fmt(apply)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[11px] pt-1 border-t border-[var(--border)]">
                <span>배분 합계:</span>
                <span className="font-bold">{fmt(totalAllocated)}원</span>
              </div>
            </div>
          )}

          {/* 방법 */}
          <div>
            <label className="block text-xs font-semibold mb-1">결제 방법</label>
            <div className="flex gap-1.5 flex-wrap">
              {['계좌이체', '현금', '카드', '기타'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`px-3 py-1.5 text-xs rounded-lg border ${method === m ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-[var(--secondary)] border-[var(--border)] text-[var(--muted-foreground)]'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-xs font-semibold mb-1">메모 (선택)</label>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
              style={{ fontSize: '16px' }}
              placeholder="예: 2026-03 수금분"
            />
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">{error}</div>
          )}
        </div>

        <div className="p-4 border-t border-[var(--border)] flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-[var(--border)] bg-[var(--secondary)] text-[var(--muted-foreground)]">
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || allocation.length === 0}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-[var(--primary)] disabled:opacity-50"
          >
            {submitting ? '저장 중...' : `${allocation.length}건에 일괄 저장`}
          </button>
        </div>
      </div>
    </div>
  );
}
