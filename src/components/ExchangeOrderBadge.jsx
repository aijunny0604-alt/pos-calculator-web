import { ArrowRightLeft } from 'lucide-react';

export default function ExchangeOrderBadge({ origin, delivery }) {
  if (!origin) return null;
  return <span className="inline-flex flex-wrap items-center gap-1.5">
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold"
      style={{ color: 'var(--purple)', borderColor: 'color-mix(in srgb, var(--purple) 40%, transparent)', background: 'color-mix(in srgb, var(--purple) 12%, var(--card))' }}>
      <ArrowRightLeft size={13} aria-hidden="true" /> 반품 교체
    </span>
    <span className="break-all text-xs font-medium text-[var(--muted-foreground)]">원주문 {origin}</span>
    {delivery === 'pickup' && <span className="text-xs font-bold text-[var(--foreground)]">방문 수령</span>}
  </span>;
}
