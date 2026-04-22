import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Trash2 } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');

export default function PaymentEditModal({ open, history, onClose, onSaved }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('계좌이체');
  const [memo, setMemo] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !history) return;
    setAmount(String(history.amount || ''));
    setMethod(history.method || '계좌이체');
    setMemo(history.memo || '');
    setPaidAt((history.paid_at || '').slice(0, 16));
    setError('');
  }, [open, history]);

  const handleSubmit = async () => {
    setError('');
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('입금액을 입력하세요'); return; }

    setSubmitting(true);
    try {
      const r = await supabase.updatePaymentHistory(history.id, {
        amount: amt,
        method,
        memo: memo || null,
        paid_at: paidAt ? new Date(paidAt).toISOString() : history.paid_at,
      });
      if (!r) { setError('수정 실패'); setSubmitting(false); return; }
      onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e.message || '수정 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`이 입금 기록(${fmt(history.amount)}원)을 삭제하시겠습니까?\n\n삭제 시 결제 레코드의 입금액이 자동 재계산됩니다.`)) return;
    setSubmitting(true);
    try {
      await supabase.deletePaymentHistory(history.id);
      onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e.message || '삭제 실패');
      setSubmitting(false);
    }
  };

  if (!open || !history) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border shadow-2xl bg-[var(--card)] border-[var(--primary)]"
        style={{ WebkitOverflowScrolling: 'touch' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between sticky top-0 bg-[var(--card)]">
          <h3 className="text-base font-bold flex items-center gap-2">
            <span>✏️</span>
            <span>입금 수정</span>
          </h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[var(--secondary)]" aria-label="닫기">✕</button>
        </div>

        <div className="p-4 space-y-3">
          <div className="p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-[11px] text-yellow-200/80">
            ⚠️ 수정/삭제 시 해당 결제 레코드의 잔금이 <strong>자동 재계산</strong>됩니다.
          </div>

          <Field label="입금액" required>
            <NumberInput value={amount} onChange={setAmount} />
          </Field>

          <Field label="결제 방법">
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
          </Field>

          <Field label="입금 일시">
            <input
              type="datetime-local"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
              style={{ fontSize: '16px' }}
            />
          </Field>

          <Field label="메모">
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
              style={{ fontSize: '16px' }}
              placeholder="예: 2월분 잔금 이월"
            />
          </Field>

          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">{error}</div>
          )}
        </div>

        <div className="p-4 pt-0 flex gap-2 sticky bottom-0 bg-[var(--card)]">
          <button
            onClick={handleDelete}
            disabled={submitting}
            className="flex items-center justify-center gap-1 py-2.5 px-3 rounded-lg text-xs font-semibold border border-red-500/40 bg-red-500/10 text-red-400 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            삭제
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-[var(--border)] bg-[var(--secondary)] text-[var(--muted-foreground)]">
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-[var(--primary)] disabled:opacity-50"
          >
            {submitting ? '저장 중...' : '수정 저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function NumberInput({ value, onChange }) {
  return (
    <div className="relative">
      <input
        inputMode="numeric"
        value={value ? Number(value).toLocaleString('ko-KR') : ''}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
        className="w-full px-3 py-2.5 pr-10 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm font-semibold text-right"
        style={{ fontSize: '16px' }}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">원</span>
    </div>
  );
}
