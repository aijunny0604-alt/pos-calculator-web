import { useState } from 'react';
import { Copy, MapPin, Phone } from 'lucide-react';

export default function CustomerContactInfo({ customer, showToast }) {
  const [copying, setCopying] = useState(false);
  const phone = customer.phone || '';
  const address = customer.address || '';
  const copy = async (value, label) => {
    if (!value || copying) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(value);
      showToast?.(`${label} 복사됨`, 'success');
    } catch {
      showToast?.('복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해주세요.', 'error');
    } finally {
      setCopying(false);
    }
  };
  const shippingInfo = [customer.name && `업체명 : ${customer.name}`, phone && `연락처 : ${phone}`, address && `주소지 : ${address}`].filter(Boolean).join('\n');
  const buttonClass = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium text-[var(--primary)] transition-colors hover:bg-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:opacity-50';

  return <section aria-label="거래처 연락처와 배송 주소" className="min-w-0">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">연락처 · 배송 주소</h3>
      {(phone || address) && <button type="button" disabled={copying} onClick={() => copy(shippingInfo, '배송 정보')} className={buttonClass}><Copy size={16} />배송 정보 복사</button>}
    </div>
    <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      {[
        { label:'연락처', value:phone, Icon:Phone, copyLabel:'전화번호' },
        { label:'배송 주소', value:address, Icon:MapPin, copyLabel:'주소' },
      ].map(({ label, value, Icon, copyLabel }) => <div key={label} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
        <div className="mb-1 flex min-h-11 items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--muted-foreground)]"><Icon size={18} className="shrink-0 text-[var(--primary)]" />{label}</p>
          {value && <button type="button" aria-label={`${copyLabel} 복사`} disabled={copying} onClick={() => copy(value, copyLabel)} className={buttonClass}><Copy size={15} />복사</button>}
        </div>
        <p className={value
          ? `min-w-0 whitespace-pre-wrap break-keep [overflow-wrap:anywhere] leading-relaxed text-[var(--foreground)] ${label === '연락처' ? 'text-xl font-semibold tabular-nums sm:text-[22px]' : 'text-base font-medium sm:text-lg'}`
          : 'py-1 text-sm text-[var(--muted-foreground)]'}>{value || `${label} 미등록`}</p>
      </div>)}
    </div>
  </section>;
}
