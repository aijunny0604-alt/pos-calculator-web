import { useMemo, useState } from 'react';
import { FileText, Building, Check, Loader2, UserPlus, Link2, AlertTriangle } from 'lucide-react';

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');

/**
 * 사업자등록증 인식 결과 확인 카드 (MOVIS 채팅 인라인)
 * - 추출값 확인/수정 → 신규 거래처 등록 또는 기존 거래처 연결 → 등록증 보관함 저장
 * props: extract { data, dataUrl }, customers, onRegister({mode,customerId,data,dataUrl}) => {ok,name,createdNew}
 */
export default function CertRegisterCard({ extract, customers = [], onRegister }) {
  const d = extract?.data || {};
  const [form, setForm] = useState({
    name: d.name || '', bizNo: d.bizNo || '', owner: d.owner || '',
    address: d.address || '', phone: '',
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, name, createdNew } | { ok:false, error }

  // 중복 감지 — 정확 일치(자동 연결 후보) / 유사(경고만)
  const { exactDup, similarDup } = useMemo(() => {
    const n = norm(form.name);
    if (!n) return { exactDup: null, similarDup: null };
    const exact = customers.find((c) => norm(c.name) === n) || null;
    const similar = exact ? null : (customers.find((c) => {
      const cn = norm(c.name);
      // 너무 짧은 부분일치 오탐 방지: 양쪽 3자 이상 + 포함 관계일 때만
      return n.length >= 3 && cn.length >= 3 && (cn.includes(n) || n.includes(cn));
    }) || null);
    return { exactDup: exact, similarDup: similar };
  }, [form.name, customers]);
  const dup = exactDup || similarDup;

  // 정확 일치가 있으면 기본을 '기존 연결'로 (중복 거래처 양산 방지)
  const [mode, setMode] = useState(exactDup ? 'existing' : 'new'); // 'new' | 'existing'
  const [existingId, setExistingId] = useState('');

  const effectiveMode = mode;
  // 자동 선택은 '정확 일치'만 (유사 오탐으로 엉뚱한 거래처 연결 방지)
  const effectiveExistingId = existingId || (exactDup ? exactDup.id : '');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleRegister = async () => {
    if (busy || !onRegister) return;
    if (!form.name.trim()) return;
    setBusy(true);
    const res = await onRegister({
      mode: effectiveMode,
      customerId: effectiveMode === 'existing' ? effectiveExistingId : null,
      data: { ...d, name: form.name.trim(), bizNo: form.bizNo.trim(), owner: form.owner.trim(), address: form.address.trim(), phone: form.phone.trim() },
      dataUrl: extract.dataUrl,
    });
    setBusy(false);
    setResult(res || { ok: false, error: '알 수 없는 오류' });
  };

  if (result?.ok) {
    return (
      <div className="rounded-xl border p-3 my-1.5" style={{ background: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.4)' }}>
        <div className="flex items-center gap-2 text-sm font-bold" style={{ color: '#16a34a' }}>
          <Check className="w-4 h-4" />
          {result.createdNew ? '신규 거래처 등록 + ' : ''}사업자등록증 저장 완료 — {result.name}
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>거래처 관리 → 📄 사업자등록증 보관함에서 확인할 수 있어요.</p>
      </div>
    );
  }

  const Field = ({ label, k, span }) => (
    <label className={`flex flex-col gap-0.5 ${span ? 'col-span-2' : ''}`}>
      <span className="text-[11px] font-bold" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      <input value={form[k]} onChange={set(k)}
        className="px-2 py-1.5 rounded-lg text-sm border"
        style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
    </label>
  );

  return (
    <div className="rounded-xl border p-3 my-1.5 max-w-full" style={{ background: 'var(--card)', borderColor: 'rgba(0,212,255,0.35)' }}>
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-4 h-4" style={{ color: 'var(--jarvis-cyan, #00b4d8)' }} />
        <span className="font-bold text-sm">사업자등록증 인식 결과</span>
      </div>
      <div className="flex gap-3">
        {extract?.dataUrl && (
          <img src={extract.dataUrl} alt="cert" className="w-20 h-20 object-cover rounded-lg border flex-shrink-0" style={{ borderColor: 'var(--border)' }} />
        )}
        <div className="grid grid-cols-2 gap-2 flex-1 min-w-0">
          <Field label="상호" k="name" span />
          <Field label="사업자번호" k="bizNo" />
          <Field label="대표자" k="owner" />
          <Field label="주소" k="address" span />
          <Field label="전화(선택)" k="phone" span />
        </div>
      </div>

      {/* 중복 경고 + 모드 선택 */}
      {dup && (
        <div className="mt-2 flex items-start gap-1.5 text-xs rounded-lg p-2" style={{ background: 'rgba(251,191,36,0.12)', color: '#b45309' }}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>비슷한 거래처 <b>"{dup.name}"</b>가 이미 있어요. 새로 만들지 말고 <b>기존에 연결</b>을 권장해요.</span>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={() => setMode('new')}
          className="px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 border transition-colors"
          style={{ background: mode === 'new' ? 'var(--primary)' : 'transparent', color: mode === 'new' ? '#fff' : 'var(--foreground)', borderColor: 'var(--border)' }}>
          <UserPlus className="w-3.5 h-3.5" />신규 등록
        </button>
        <button onClick={() => setMode('existing')}
          className="px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 border transition-colors"
          style={{ background: mode === 'existing' ? 'var(--primary)' : 'transparent', color: mode === 'existing' ? '#fff' : 'var(--foreground)', borderColor: 'var(--border)' }}>
          <Link2 className="w-3.5 h-3.5" />기존 연결
        </button>
        {mode === 'existing' && (
          <select value={effectiveExistingId} onChange={(e) => setExistingId(e.target.value)}
            className="flex-1 min-w-[140px] px-2 py-1.5 rounded-lg text-xs border"
            style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
            <option value="">거래처 선택…</option>
            {[...customers].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {result && !result.ok && (
        <div className="mt-2 text-xs" style={{ color: 'var(--destructive)' }}>❌ {result.error}</div>
      )}

      <button onClick={handleRegister}
        disabled={busy || !form.name.trim() || (mode === 'existing' && !effectiveExistingId)}
        className="mt-2 w-full py-2 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #00b4d8, #0077b6)' }}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building className="w-4 h-4" />}
        {busy ? '등록 중…' : mode === 'existing' ? '기존 거래처에 등록증 연결' : '신규 거래처 등록 + 등록증 저장'}
      </button>
    </div>
  );
}
