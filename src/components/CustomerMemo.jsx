import { useState } from 'react';
import { FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function CustomerMemo({ customer, onSaved, showToast }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(customer.memo || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const updated = await supabase.updateCustomer(customer.id, { memo: draft.trim() });
      if (!updated || String(updated.id) !== String(customer.id)) throw new Error('저장 실패');
      onSaved(updated);
      setDraft(updated.memo || '');
      setEditing(false);
      showToast?.('거래처 메모를 저장했습니다', 'success');
    } catch {
      setError('메모를 저장하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="거래처 메모" className="mt-3 pt-3 border-t border-[var(--border)]">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><FileText className="w-4 h-4" style={{ color: 'var(--primary)' }} /> 거래처 메모</h3>
        {!editing && <button type="button" onClick={() => { setDraft(customer.memo || ''); setError(''); setEditing(true); }} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--accent)] transition-colors" style={{ color: 'var(--primary)' }}>{customer.memo ? '메모 수정' : '메모 추가'}</button>}
      </div>
      {editing ? (
        <form onSubmit={save} className="mt-2">
          <label htmlFor="customer-memo" className="sr-only">거래처 메모 내용</label>
          <textarea id="customer-memo" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={saving} rows={3} placeholder="거래처 관련 내용을 입력하세요" className="w-full rounded-lg border border-[var(--border)] p-3 text-sm resize-y focus:outline-none focus:border-[var(--primary)]" style={{ background: 'var(--card)', color: 'var(--foreground)' }} />
          {error && <p role="alert" className="text-sm mt-1" style={{ color: 'var(--destructive)' }}>{error}</p>}
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" disabled={saving} onClick={() => { setDraft(customer.memo || ''); setError(''); setEditing(false); }} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--accent)] transition-colors disabled:opacity-50">취소</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background: 'var(--primary)' }}>{saving ? '저장 중...' : '저장'}</button>
          </div>
          {customer.memo && <p className="text-xs mt-2 text-[var(--muted-foreground)]">내용을 비우고 저장하면 메모가 삭제됩니다.</p>}
        </form>
      ) : <p className="mt-2 text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--muted-foreground)' }}>{customer.memo || '등록된 메모가 없습니다.'}</p>}
    </section>
  );
}
