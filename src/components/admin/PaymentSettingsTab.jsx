import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Save, RefreshCw, Building2, Phone, MapPin, CreditCard, Hash } from 'lucide-react';

/**
 * 결제 관리 설정 탭 (AdminPage 내)
 * - 회사 정보 (명세서 헤더 + 발행자 정보)
 * - 인보이스 prefix + 다음 번호
 * - 주문 → 결제 레코드 동기화
 */
export default function PaymentSettingsTab({ showToast }) {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    supabase.getAppSettings().then((s) => {
      setSettings(s);
      if (s) {
        setForm({
          company_name: s.company_name || '',
          business_number: s.business_number || '',
          company_address: s.company_address || '',
          company_phone: s.company_phone || '',
          bank_account: s.bank_account || '',
          invoice_footer: s.invoice_footer || '',
          invoice_prefix: s.invoice_prefix || 'INV',
        });
      }
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await supabase.updateAppSettings(form);
      if (r) {
        setSettings(r);
        showToast?.('회사 정보 저장 완료', 'success');
      } else {
        showToast?.('저장 실패', 'error');
      }
    } catch (e) {
      showToast?.('저장 실패: ' + (e?.message || e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    if (!confirm('운영 주문 데이터를 결제 레코드로 동기화하시겠습니까?\n(이미 있는 주문은 스킵, 매칭 업체 없는 주문도 스킵)')) return;
    setSyncing(true);
    try {
      const r = await supabase.syncAllToPaymentRecords();
      showToast?.(
        `동기화 완료: 주문 ${r.orders.inserted}건 + 장바구니 ${r.carts.inserted}건 추가`,
        'success'
      );
    } catch (e) {
      showToast?.('동기화 실패: ' + (e?.message || e), 'error');
    } finally {
      setSyncing(false);
    }
  };

  if (!settings) {
    return <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">설정 로드 중...</div>;
  }

  const Field = ({ icon: Icon, label, value, onChange, placeholder, type = 'text' }) => (
    <div>
      <label className="text-xs font-semibold mb-1 flex items-center gap-1.5 text-[var(--foreground)]">
        <Icon className="w-3.5 h-3.5" style={{ color: 'var(--muted-foreground)' }} />
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
        style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
      />
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      {/* 회사 정보 섹션 */}
      <section className="rounded-xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold">🏢 회사 정보 (명세서 헤더)</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              명세서 PNG/인쇄 시 상단에 표시됩니다
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
            style={{ background: 'var(--primary)', color: 'white' }}
          >
            <Save className="w-4 h-4" /> {saving ? '저장 중...' : '저장'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field icon={Building2} label="회사명" value={form.company_name} onChange={(v) => setForm({ ...form, company_name: v })} placeholder="예: MOVE MOTORS" />
          <Field icon={Hash} label="사업자등록번호" value={form.business_number} onChange={(v) => setForm({ ...form, business_number: v })} placeholder="000-00-00000" />
          <Field icon={MapPin} label="주소" value={form.company_address} onChange={(v) => setForm({ ...form, company_address: v })} placeholder="본사 주소" />
          <Field icon={Phone} label="연락처" value={form.company_phone} onChange={(v) => setForm({ ...form, company_phone: v })} placeholder="010-0000-0000" />
          <div className="sm:col-span-2">
            <Field icon={CreditCard} label="입금 계좌" value={form.bank_account} onChange={(v) => setForm({ ...form, bank_account: v })} placeholder="예: 신한 000-000-000000 (예금주)" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold mb-1 block text-[var(--foreground)]">명세서 하단 문구</label>
            <textarea
              value={form.invoice_footer}
              onChange={(e) => setForm({ ...form, invoice_footer: e.target.value })}
              placeholder="예: 입금 확인 부탁드립니다."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 resize-y"
              style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>
        </div>
      </section>

      {/* 세금계산서 번호 섹션 */}
      <section className="rounded-xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="mb-4">
          <h2 className="text-base font-bold">📄 세금계산서 자동 번호</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            결제 등록 시 자동 채번 형식: <code className="px-1.5 py-0.5 rounded text-[11px]" style={{ background: 'var(--muted)' }}>{form.invoice_prefix || 'INV'}-YYYY-0001</code>
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field icon={Hash} label="번호 prefix" value={form.invoice_prefix} onChange={(v) => setForm({ ...form, invoice_prefix: v })} placeholder="INV" />
          <div>
            <label className="text-xs font-semibold mb-1 block text-[var(--foreground)]">다음 발행 번호</label>
            <div className="px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
              {settings.invoice_prefix || form.invoice_prefix}-{new Date().getFullYear()}-{String((settings.invoice_seq || 0) + 1).padStart(4, '0')}
            </div>
          </div>
        </div>
      </section>

      {/* 주문 동기화 섹션 */}
      <section className="rounded-xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold">🔄 주문 → 결제 레코드 동기화</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              운영 POS의 주문/저장 장바구니 중 아직 결제 레코드가 없는 건을 일괄 생성
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? '동기화 중...' : '동기화 실행'}
          </button>
        </div>
        <div className="p-3 rounded-lg text-xs border-l-4" style={{ background: 'color-mix(in srgb, var(--warning) 10%, transparent)', borderColor: 'var(--warning)', color: 'var(--foreground)' }}>
          ℹ️ 업체 이름/전화 매칭되는 거래처가 있어야 동기화됩니다. 이미 있는 주문은 skip.
        </div>
      </section>
    </div>
  );
}
