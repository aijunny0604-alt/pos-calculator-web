import { useId } from 'react';
import { ArrowRightLeft, CalendarDays, Package, PencilLine, RotateCcw } from 'lucide-react';
import { formatPrice } from '@/lib/utils';

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});
const dateLabel = value => value && Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : '미등록';
const quantityOf = item => Number(item.quantity ?? item.returnQuantity) || 0;
const amountOf = item => Number(item.total ?? Number(item.price) * quantityOf(item)) || 0;
const signedPrice = amount => `${amount > 0 ? '−' : ''}${formatPrice(amount)}원`;

export default function OrderReturnHistory({ order, orders = [], onEdit, onCancel, cancelingReturnId }) {
  const title = useId();
  const groups = new Map();
  for (const item of order.returns || []) {
    const key = item.returnId || 'legacy';
    if (!groups.has(key)) groups.set(key, { entry: item, rows: [], amount: 0 });
    const group = groups.get(key);
    group.rows.push(item);
    group.amount += amountOf(item);
  }
  if (!groups.size) return null;
  const ordered = [...groups.values()].sort((a, b) => (Date.parse(b.entry.returnedAt) || 0) - (Date.parse(a.entry.returnedAt) || 0));
  const total = Number(order.totalReturned ?? order.total_returned ?? ordered.reduce((sum, group) => sum + group.amount, 0));

  return <section aria-labelledby={title} className="my-4 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3 sm:p-4">
    <header className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h4 id={title} className="flex items-center gap-2 font-bold">
          <RotateCcw size={18} className="shrink-0 text-[var(--warning)]" />
          반품 내역 <span className="text-sm font-medium text-[var(--muted-foreground)]">{groups.size}건</span>
        </h4>
        <p className="mt-1 flex items-start gap-1.5 text-xs text-[var(--muted-foreground)]">
          <CalendarDays size={14} aria-hidden="true" className="shrink-0" />
          <span>원주문일 {dateLabel(order.createdAt ?? order.created_at)}</span>
        </p>
      </div>
      <p className="flex items-baseline gap-2 tabular-nums">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">반품 총액</span>
        <strong className="text-lg text-[var(--warning)]">{signedPrice(total)}</strong>
      </p>
    </header>
    <div className="space-y-3">
      {ordered.map(({ entry, rows, amount }) => {
        const details = entry.returnDetails;
        const exchange = details?.kind === 'exchange';
        const linkedOrder = exchange && orders.find(candidate => (candidate.orderNumber || candidate.id) === details.exchangeOrderNumber);
        const replacementItems = linkedOrder?.items ?? [];
        const replacementSummary = replacementItems.map(item => `${item.name} ×${quantityOf(item)}`).join(', ').slice(0, 300);
        const replacementNote = details?.replacement !== replacementSummary ? details?.replacement : '';
        const editable = /^RET-[A-Za-z0-9-]{1,96}$/.test(entry.returnId);
        const accent = exchange ? 'var(--purple)' : 'var(--warning)';

        return <article key={entry.returnId || 'legacy'} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
          style={{ borderLeft: `3px solid ${accent}` }}>
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-3 py-3 sm:px-4">
            <div className="space-y-1">
              <strong className="inline-block rounded-full px-2.5 py-1 text-xs" style={{ background: `color-mix(in srgb, ${accent} 13%, var(--card))`, color: accent }}>
                {exchange ? '반품 후 교체' : '반품'}{details?.reason ? ` · ${details.reason}` : ''}
              </strong>
              <p className="text-xs text-[var(--muted-foreground)]">반품일 {dateLabel(entry.returnedAt)}</p>
            </div>
            <strong className="text-base tabular-nums text-[var(--warning)]">{signedPrice(amount)}</strong>
          </div>
          <div className={`grid gap-2 px-3 pb-3 sm:px-4 ${exchange ? 'md:grid-cols-2' : ''}`}>
            <div className="min-w-0 rounded-lg bg-[var(--muted)] p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold"><Package size={15} /> 반품 품목</p>
              <ul className="divide-y divide-[var(--border)]">
                {rows.map((item, index) => <li key={index} className="flex flex-wrap items-baseline justify-between gap-x-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 basis-40 break-words">{item.itemName || item.name || '상품명 미등록'}</span>
                  <span className="shrink-0 font-medium tabular-nums">{quantityOf(item)}개</span>
                  <span className="shrink-0 tabular-nums text-[var(--warning)]">{signedPrice(amountOf(item))}</span>
                </li>)}
              </ul>
            </div>
            {exchange && <div className="min-w-0 rounded-lg p-3" style={{ background: 'color-mix(in srgb, var(--purple) 8%, var(--card))' }}>
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-[var(--purple)]"><ArrowRightLeft size={15} /> 교체 품목</p>
              {details.exchangeOrderNumber && <p className="break-all text-xs text-[var(--muted-foreground)]">교체 주문 {details.exchangeOrderNumber}</p>}
              {replacementItems.length > 0 && <ul className="divide-y divide-[var(--border)]">
                {replacementItems.map((item, index) => <li key={index} className="flex justify-between gap-2 py-1.5 text-sm">
                  <span className="min-w-0 break-words">{item.name || '상품명 미등록'}</span>
                  <span className="shrink-0 font-medium tabular-nums">{quantityOf(item)}개</span>
                </li>)}
              </ul>}
              {replacementNote && <p className="mt-1 break-words text-sm">
                {replacementItems.length > 0 && <span className="mr-1.5 text-xs font-semibold text-[var(--muted-foreground)]">교체 메모</span>}
                {replacementNote}
              </p>}
              {!details.exchangeOrderNumber && !details.replacement && <p className="text-sm text-[var(--muted-foreground)]">교체 품목 미등록</p>}
            </div>}
          </div>
          {(details?.note || (editable && (onEdit || onCancel))) &&
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-3 py-2 sm:px-4">
              {details?.note && <p className="min-w-0 flex-1 basis-48 whitespace-pre-wrap break-words text-sm">
                <span className="mr-2 font-semibold text-[var(--muted-foreground)]">메모</span>{details.note}
              </p>}
              {editable && <div className="ml-auto flex flex-wrap items-center gap-2">
                {onEdit && <button type="button" onClick={() => onEdit(entry)} className="flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--accent)]">
                  <PencilLine size={15} /> 사유·교체 기록
                </button>}
                {onCancel && <button type="button" onClick={() => onCancel(entry.returnId)} disabled={cancelingReturnId === entry.returnId}
                  className="min-h-11 rounded-lg px-2 text-sm text-[var(--destructive)] hover:bg-[var(--accent)] disabled:opacity-60">
                  {cancelingReturnId === entry.returnId ? '취소 중…' : '반품 취소'}
                </button>}
              </div>}
            </div>}
        </article>;
      })}
    </div>
  </section>;
}
