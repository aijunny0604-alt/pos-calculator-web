import { useMemo, useState } from 'react';
import { PackagePlus, Search, X } from 'lucide-react';
import { searchProductChoices } from '@/lib/productMatch';
import { formatPrice, getTodayKST } from '@/lib/utils';

const field = 'min-h-11 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-base';

export default function ExchangeOrderDraft({ products, items, total, priceType, delivery, hasAddress, onQuantity, onDelivery }) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => searchProductChoices(query, products, { limit: 8 }), [query, products]);
  return <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-semibold">교체 품목 선택</h4>
      <span className="text-sm text-[var(--muted-foreground)]">{getTodayKST()} · {priceType === 'retail' ? '소매가' : '도매가'}</span>
    </div>
    <div className="relative">
      <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-[var(--muted-foreground)]" />
      <input type="search" className={field + ' w-full !pl-9'} aria-label="교체 상품 검색" placeholder="상품명 · 규격 검색"
        value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) event.preventDefault();
        }} />
    </div>
    {query.trim() && (matches.length ? <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)]">
      {matches.map(product => <button key={product.id} type="button"
        className="flex min-h-11 w-full items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--accent)]"
        onClick={() => {
          const quantity = Number(items.find(item => String(item.id) === String(product.id))?.quantity) || 0;
          onQuantity(product.id, quantity + 1);
          setQuery('');
        }}>
        <span className="min-w-0 break-words text-sm font-medium">{product.name}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
          {product.stock == null ? '재고 미관리' : `재고 ${product.stock}`}<PackagePlus size={16} aria-hidden="true" />
        </span>
      </button>)}
    </div> : <p className="text-sm text-[var(--muted-foreground)]">검색 결과가 없습니다.</p>)}
    {items.map(item => <div key={item.id} className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-2 text-sm">
      <div className="min-w-0 flex-1 basis-32 break-words">
        <p className="font-semibold">{item.name}</p>
        {item.invalid ? <p role="alert" className="text-[var(--destructive)]">{item.invalid}</p>
          : <p className="text-[var(--muted-foreground)]">{formatPrice(item.price)}원/개</p>}
      </div>
      <input type="number" min="1" max="9999" step="1" inputMode="numeric" aria-label={`${item.name} 교체 수량`}
        className={field + ' w-20 text-center tabular-nums'} value={item.quantity} onChange={event => onQuantity(item.id, event.target.value)} />
      <button type="button" aria-label={`${item.name} 제외`} onClick={() => onQuantity(item.id, null)}
        className="grid size-11 place-items-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--accent)]"><X size={17} /></button>
    </div>)}
    <div className="flex flex-wrap items-end justify-between gap-2">
      <label className="text-sm font-semibold">출고 방법
        <select className={field + ' mt-1 block'} value={delivery} onChange={event => onDelivery(event.target.value)}>
          <option value="courier">택배 발송</option><option value="pickup">방문 수령</option>
        </select>
      </label>
      <strong className="text-[var(--primary)]">교체 주문 금액 {formatPrice(total)}원</strong>
    </div>
    {delivery === 'courier' && !hasAddress && <p className="text-sm text-[var(--muted-foreground)]">원주문에 주소가 없습니다. 송장 작성 전에 배송주소를 확인하세요.</p>}
  </div>;
}
