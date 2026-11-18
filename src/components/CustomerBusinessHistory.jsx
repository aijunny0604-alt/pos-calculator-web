import { useEffect, useId, useState } from 'react';
import { Building2, History, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { BUSINESS_FIELDS, formatBusinessNumber, normalizeBusinessProfile } from '@/lib/customerBusiness.mjs';

const stamp = value => value ? new Date(value).toLocaleString('ko-KR') : '기존 기록 · 변경일 미등록';
const fileLink = url => /^https?:\/\//i.test(url || '') ? url : null;
function Profile({ profile = {} }) {
  return <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2 text-sm">{BUSINESS_FIELDS.map(([key, label]) => <div key={key} className={key === 'address' ? 'sm:col-span-2' : ''}>
    <dt className="text-xs text-[var(--muted-foreground)]">{label}</dt><dd className="mt-0.5 break-words">{key === 'business_number' ? formatBusinessNumber(profile[key]) : profile[key] || '미등록'}</dd>
  </div>)}</dl>;
}

export default function CustomerBusinessHistory({ customer, onSaved, showToast }) {
  const uid = useId();
  const [data, setData] = useState(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState({}), [expectedAt, setExpectedAt] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setData(null); setEditing(false); setShowHistory(false);
    supabase.getCustomerBusiness(customer.id).then(value => { if (active) setData(value); })
      .catch(() => { if (active) setError('사업자 이력을 불러오지 못했습니다. DB 이력 기능 적용 또는 연결 상태를 확인해주세요.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [customer.id]);
  useEffect(() => {
    if (!data || !customer.business_profile_changed_at || customer.business_profile_changed_at === data.current.business_profile_changed_at) return;
    let active = true;
    supabase.getCustomerBusiness(customer.id).then(value => { if (active) setData(value); }).catch(() => { if (active) setError('등록증 변경 후 이력을 확인하지 못했습니다. 다시 불러와주세요.'); });
    return () => { active = false; };
  }, [customer.id, customer.business_profile_changed_at]);
  const reload = async () => {
    setLoading(true); setError('');
    try { setData(await supabase.getCustomerBusiness(customer.id)); }
    catch { setError('사업자 이력을 불러오지 못했습니다. 잠시 후 다시 확인해주세요.'); }
    finally { setLoading(false); }
  };
  const save = async () => {
    if (saving) return;
    let profile;
    try { profile = normalizeBusinessProfile(draft); }
    catch (e) { setError(e.message); return; }
    setSaving(true); setError('');
    try {
      const updated = await supabase.saveCustomerBusiness(customer.id, profile, expectedAt);
      setData(previous => ({ ...previous, current:updated }));
      setEditing(false); onSaved?.(updated);
      showToast?.('사업자 정보 저장 완료 · 이전 정보는 변경 이력에 보존됩니다.', 'success');
      await reload();
    } catch (e) { setError(e.message || '저장 결과를 확인하지 못했습니다. 다시 불러와 내역을 확인해주세요.'); }
    finally { setSaving(false); }
  };
  const profile = data?.current?.business_profile || {};
  return <section className="mb-4 rounded-xl border p-4" style={{ background:'var(--card)', borderColor:'var(--border)' }} aria-label="거래처 사업자 정보와 변경 이력">
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <h3 className="flex items-center gap-2 font-bold"><Building2 size={19} className="text-[var(--primary)]" />사업자 정보
        {!!data?.current?.business_change_count && <span className="text-xs rounded-full px-2 py-1 bg-[var(--muted)] text-[var(--primary)]">변경 이력 {data.current.business_change_count}건</span>}
      </h3>
      <div className="flex gap-2">
        <button type="button" onClick={reload} disabled={loading || saving} className="p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--accent)] disabled:opacity-50" aria-label="사업자 정보 다시 불러오기"><RefreshCw size={16} /></button>
        {data && !editing && <button type="button" onClick={() => { setDraft({ ...profile }); setExpectedAt(data.current.business_profile_changed_at); setError(''); setEditing(true); }} className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm font-semibold text-[var(--primary)] hover:bg-[var(--accent)]">{profile.business_number ? '사업자 변경' : '사업자 정보 등록'}</button>}
      </div>
    </div>
    {error && <p role="alert" className="text-sm mb-3 text-[var(--destructive)]">{error}</p>}
    {loading && !data && <p role="status" className="text-sm text-[var(--muted-foreground)]">사업자 정보 확인 중...</p>}
    {data && !editing && <><div className="mb-3 flex flex-wrap gap-2 items-center"><span className="text-xs font-bold text-[var(--primary)]">현재 사업자</span><span className="text-xs text-[var(--muted-foreground)]">{stamp(data.current.business_profile_changed_at)}</span></div><Profile profile={profile} /></>}
    {editing && <form onSubmit={event => { event.preventDefault(); save(); }} className="space-y-3">
      <p className="text-sm text-[var(--muted-foreground)]">저장하면 이전 사업자 정보와 연결된 등록증이 이력에 보존됩니다. 기존 주문·입금은 변경하지 않습니다.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{BUSINESS_FIELDS.map(([key, label]) => <div key={key} className={key === 'address' ? 'sm:col-span-2' : ''}>
        <label htmlFor={`${uid}-${key}`} className="block text-xs font-semibold mb-1">{label}{['company_name','business_number'].includes(key) ? ' *' : ''}</label>
        <input id={`${uid}-${key}`} value={draft[key] || ''} onChange={e => setDraft(previous => ({ ...previous, [key]:e.target.value }))} maxLength={key === 'business_number' ? 12 : 500} inputMode={key === 'business_number' ? 'numeric' : 'text'} disabled={saving} className="w-full rounded-lg border px-3 py-2.5 bg-[var(--background)] border-[var(--border)] focus-visible:outline-[var(--primary)]" />
      </div>)}</div>
      <div className="flex flex-wrap gap-2"><button type="submit" disabled={saving || loading} className="px-4 py-2.5 rounded-lg font-semibold bg-[var(--primary)] text-white disabled:opacity-50">{saving ? '저장 중...' : '이전 정보 보존 후 저장'}</button><button type="button" disabled={saving} onClick={() => { setEditing(false); setError(''); }} className="px-4 py-2.5 rounded-lg border border-[var(--border)] hover:bg-[var(--accent)]">취소</button></div>
    </form>}
    {data && <div className="mt-4 border-t border-[var(--border)] pt-3">
      <button type="button" onClick={() => setShowHistory(value => !value)} aria-expanded={showHistory} className="flex items-center gap-2 min-h-11 text-sm font-semibold text-[var(--primary)]"><History size={17} />이전 사업자·등록증 {data.history?.length || 0}건 {showHistory ? '접기' : '보기'}</button>
      {showHistory && <div className="space-y-3">{!data.history?.length && <p className="text-sm text-[var(--muted-foreground)]">보존된 변경 이력이 없습니다. 기능 적용 전 삭제된 정보는 복구되지 않습니다.</p>}{data.history?.map(row => <article key={row.id} className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3">
        <p className="text-xs font-semibold mb-3 text-[var(--muted-foreground)]">이전 사업자 · 변경일 {stamp(row.changed_at)}</p>
        {!row.snapshot?.profile?.business_number && <p className="mb-3 text-xs text-[var(--muted-foreground)]">상세 사업자 정보 등록 전 기록입니다. 당시 거래처명: {row.snapshot?.customer_name || '미등록'}. 이전 등록증을 함께 확인해주세요.</p>}
        <Profile profile={row.snapshot?.profile || {}} />
        {fileLink(row.snapshot?.cert_url) && <a href={fileLink(row.snapshot.cert_url)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--primary)]">이전 사업자등록증 열기 ↗</a>}
      </article>)}</div>}
    </div>}
  </section>;
}
