import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import ExchangeOrderDraft from '@/components/ExchangeOrderDraft';
import ExchangeOrderPicker from '@/components/ExchangeOrderPicker';
import ViewportModal from '@/components/ui/ViewportModal';
import { formatDateTime, formatPrice } from '@/lib/utils';
import { editableReturnEntries, exchangeOrderCandidates, exchangeProductQuote, getReturnLines, RETURN_REASONS } from '@/lib/orderReturns';

const control = 'min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base disabled:opacity-60';
const secondary = 'min-h-11 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--accent)] disabled:opacity-50';
const returnDetails = entry => ({
  kind: 'return', reason: '', note: '', exchangeOrderNumber: '', replacement: '',
  ...entry?.returnDetails,
});

export default function OrderReturnDialog({ order, orders = [], products = [], entry: initialEntry, onClose, onSave }) {
  const title = useId();
  const form = useRef(null);
  const closeButton = useRef(null);
  const pending = useRef(false);
  const lines = useMemo(() => getReturnLines(order).filter(line => line.available > 0), [order]);
  const entries = useMemo(() => editableReturnEntries(order), [order]);
  const [entry, setEntry] = useState(() => initialEntry ?? (lines.length === 0 && entries.length === 1 ? entries[0] : null));
  const [draftReturnId] = useState(() => `RET-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const [details, setDetails] = useState(() => returnDetails(entry));
  const [quantities, setQuantities] = useState({});
  const [createExchange, setCreateExchange] = useState(false);
  const [exchangeQuantities, setExchangeQuantities] = useState({});
  const [delivery, setDelivery] = useState('courier');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canEdit = Boolean(entry || lines.length > 0);
  const selected = lines.flatMap(line => {
    const quantity = Number(quantities[line.index]);
    return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= line.available ? [{ ...line, quantity }] : [];
  });
  const invalidQuantity = lines.some(line => {
    const quantity = Number(quantities[line.index] || 0);
    return !Number.isSafeInteger(quantity) || quantity < 0 || quantity > line.available;
  });
  const total = selected.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const remainingAmount = Math.max(0, Number(order.totalAmount || 0) - Number(order.totalReturned || 0));
  const returnAmount = entry
    ? (order.returns || []).filter(item => item.returnId === entry.returnId).reduce((sum, item) => sum + (Number(item.total) || 0), 0)
    : total;
  const exchangeOrderNumber = details.kind === 'exchange' ? details.exchangeOrderNumber : '';
  const newExchange = details.kind === 'exchange' && createExchange;
  const priceType = order.priceType === 'retail' ? 'retail' : 'wholesale';
  const exchangeItems = Object.entries(exchangeQuantities).map(([id, quantity]) => {
    const product = products.find(item => String(item.id) === id);
    if (!product) return { id, quantity, name: `상품 ${id}`, invalid: '상품 정보를 다시 확인해주세요.' };
    const count = Number(quantity);
    const quote = exchangeProductQuote(product, count, priceType);
    let invalid = '';
    if (!Number.isSafeInteger(count) || count < 1 || count > 9999) invalid = '수량을 1개 이상 입력해주세요.';
    else if (product.stock != null && count > Number(product.stock)) invalid = `재고 ${product.stock}개를 초과했습니다.`;
    else if (!Number.isFinite(quote.price) || quote.price < 0) invalid = '상품 단가를 확인해주세요.';
    return { ...quote, catalogTiers: product.discount_tiers ?? [], quantity, invalid };
  });
  const exchangeTotal = exchangeItems.reduce((sum, item) => sum + (item.invalid ? 0 : item.price * Number(item.quantity)), 0);
  const candidates = useMemo(() => exchangeOrderCandidates(order, orders), [order, orders]);
  const selectedOrder = candidates.find(candidate => candidate.orderNumber === exchangeOrderNumber);
  const replacementAmount = newExchange && exchangeItems.length ? exchangeTotal
    : selectedOrder ? Number(selectedOrder.totalAmount ?? 0) - Number(selectedOrder.totalReturned ?? 0) : null;
  const difference = replacementAmount !== null && (entry || selected.length > 0) ? replacementAmount - returnAmount : null;
  const update = (key, value) => setDetails(previous => ({ ...previous, [key]: value }));
  const linkOrder = orderNumber => {
    setCreateExchange(false);
    setDetails(previous => ({
      ...previous,
      kind: orderNumber ? 'exchange' : previous.kind,
      exchangeOrderNumber: orderNumber,
    }));
  };
  const updateExchangeQuantity = (id, quantity) => setExchangeQuantities(previous => {
    const next = { ...previous };
    if (quantity === null) delete next[id];
    else next[id] = quantity;
    return next;
  });
  const canSave = !saving && details.reason && (details.reason !== '기타' || details.note.trim()) &&
    (entry || (selected.length > 0 && !invalidQuantity && total <= remainingAmount)) &&
    (newExchange ? exchangeItems.length > 0 && exchangeItems.every(item => !item.invalid)
      : details.kind !== 'exchange' || details.exchangeOrderNumber || details.replacement.trim());

  useEffect(() => {
    const trigger = document.activeElement;
    closeButton.current?.focus({ preventScroll: true });
    return () => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);

  const close = () => { if (!pending.current) onClose(); };
  const handleKeys = event => {
    if (event.key === 'Escape' && !event.isComposing && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.stopPropagation();
      close();
    }
    if (event.key !== 'Tab') return;
    const controls = [...form.current.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
    const first = controls[0], last = controls.at(-1);
    if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  };

  const submit = async event => {
    event.preventDefault();
    if (!canSave || pending.current) return;
    pending.current = true;
    setSaving(true);
    setError('');
    const isExchange = details.kind === 'exchange';
    try {
      await onSave({
        action: entry ? 'edit' : 'add', returnId: entry?.returnId ?? draftReturnId,
        selections: selected.map(({ index, quantity }) => ({ index, quantity })),
        details: {
          kind: details.kind, reason: details.reason, note: details.note.trim(),
          exchangeOrderNumber: isExchange ? details.exchangeOrderNumber : '',
          replacement: isExchange ? details.replacement.trim() : '',
        },
        ...(newExchange && { exchange: {
          requestId: draftReturnId, delivery,
          items: exchangeItems.map(({ id, quantity, basePrice, price, catalogTiers }) => ({
            id, quantity: Number(quantity), basePrice, price, catalogTiers,
          })),
        } }),
      });
      onClose();
    } catch (error) {
      setError(error.message || '반품 기록을 저장하지 못했습니다.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return <ViewportModal className="move-dialog-backdrop fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-5"
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <form ref={form} role="dialog" aria-modal="true" aria-labelledby={title} onSubmit={submit} onKeyDown={handleKeys}
      className="move-dialog flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-[var(--card)] text-[var(--foreground)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h2 id={title} className="flex items-center gap-2 text-lg"><RotateCcw size={19} className="shrink-0 text-[var(--warning)]" />{entry ? '반품 기록 수정' : !canEdit && entries.length ? '반품 기록 선택' : '반품·교체 처리'}</h2>
          <p className="mt-1 break-words text-sm text-[var(--muted-foreground)]">{order.customerName} · {order.orderNumber}</p>
        </div>
        <button ref={closeButton} type="button" aria-label="닫기" disabled={saving} onClick={close}><X size={18} /></button>
      </header>
      <div role="region" aria-label="반품 입력 내용" tabIndex={0} className="min-h-0 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
        {!canEdit ? <section className="space-y-2">
          <p className="text-sm text-[var(--muted-foreground)]">{entries.length ? '이미 전량 반품된 주문입니다. 교체 정보를 기록할 반품을 선택하세요.' : '반품 가능한 수량과 수정 가능한 반품 기록이 없습니다.'}</p>
          {entries.map(item => {
            const items = order.returns.filter(row => row.returnId === item.returnId);
            const amount = items.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
            return <button key={item.returnId} type="button" className={secondary + ' w-full text-left'}
              onClick={() => { setEntry(item); setDetails(returnDetails(item)); closeButton.current?.focus(); }}>
              <span className="block">{formatDateTime(item.returnedAt) || '반품일 미등록'} · {formatPrice(amount)}원</span>
              <span className="mt-1 block break-words font-normal">{items.map(row => row.itemName || row.name).filter(Boolean).join(', ')}</span>
            </button>;
          })}
        </section> : <fieldset disabled={saving} className="min-w-0 space-y-4">
          {!entry && <section aria-label="반품 품목" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">반품 수량</h3>
              <button type="button" className={secondary} onClick={() => setQuantities(Object.fromEntries(lines.map(line => [line.index, String(line.available)])))}>남은 수량 모두 선택</button>
            </div>
            {lines.map(line => <label key={line.index} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2">
              <span className="min-w-0 break-words"><span className="block font-medium">{line.name}</span><span className="text-sm text-[var(--muted-foreground)]">남은 {line.available}개 · {formatPrice(line.price)}원/개</span></span>
              <input aria-label={`${line.name} 반품 수량`} className={`${control} !w-20 shrink-0 text-center tabular-nums`} type="number" min="0" max={line.available} step="1"
                inputMode="numeric" value={quantities[line.index] ?? ''} placeholder="0" onChange={event => setQuantities(previous => ({ ...previous, [line.index]: event.target.value }))} />
            </label>)}
            {(invalidQuantity || total > remainingAmount) && <p role="alert" className="text-sm text-[var(--destructive)]">{invalidQuantity ? '남은 수량 이내의 정수를 입력해주세요.' : '반품 금액이 원주문의 남은 금액을 초과합니다. 주문 내역을 확인해주세요.'}</p>}
          </section>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">처리 유형
                <select className={`${control} mt-1`} value={details.kind} onChange={event => {
                  update('kind', event.target.value);
                  if (event.target.value === 'return') setCreateExchange(false);
                }}>
                <option value="return">반품</option><option value="exchange">반품 후 교체</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">반품 사유
              <select required className={`${control} mt-1`} value={details.reason} onChange={event => update('reason', event.target.value)}>
                <option value="">사유 선택</option>{RETURN_REASONS.map(reason => <option key={reason}>{reason}</option>)}
              </select>
            </label>
          </div>
          <div className="space-y-3 rounded-xl border border-[var(--border)] p-3">
            {!newExchange && <ExchangeOrderPicker candidates={candidates} selected={selectedOrder} value={exchangeOrderNumber} onSelect={linkOrder} />}
            {newExchange ? <>
              <button type="button" className={secondary} onClick={() => setCreateExchange(false)}>기존 교체 주문 연결</button>
              <ExchangeOrderDraft products={products} items={exchangeItems} total={exchangeTotal} priceType={priceType} delivery={delivery}
                hasAddress={Boolean(order.customerAddress?.trim())} onQuantity={updateExchangeQuantity} onDelivery={setDelivery} />
            </> : products.length > 0 && !exchangeOrderNumber && !entry?.returnDetails?.exchangeOrderNumber && order.customerName && (
              <button type="button" className={secondary + ' text-[var(--primary)]'} onClick={() => {
                update('kind', 'exchange');
                setCreateExchange(true);
              }}>오늘 교체 주문 만들기</button>
            )}
            {details.kind === 'exchange' && (
              <label className="block text-sm font-semibold">교체 품목 또는 메모
                <input className={`${control} mt-1`} maxLength={300} value={details.replacement} onChange={event => update('replacement', event.target.value)} placeholder="예: SNPK 114D - S 4개로 교체" />
              </label>
            )}
            {difference !== null && <p className="text-sm font-semibold">주문 금액 차액 {difference > 0 ? '+' : ''}{formatPrice(difference)}원</p>}
          </div>
          <label className="block text-sm font-semibold">상세 사유{details.reason === '기타' ? '' : ' (선택)'}
            <textarea className={`${control} mt-1 resize-y`} rows={2} maxLength={500} value={details.note} onChange={event => update('note', event.target.value)} placeholder="예: 주문 품목과 다른 제품이 출고됨" />
          </label>
        </fieldset>}
      </div>
      <footer className="move-dialog-footer flex shrink-0 flex-wrap items-center justify-end border-t border-[var(--border)] px-4 pb-3 pt-3 sm:px-6">
        {error && <p role="alert" className="basis-full break-words text-sm text-[var(--destructive)]">{error}</p>}
        {canEdit && <strong className="mr-auto text-[var(--warning)]">
          {entry ? '기존 반품 금액' : '반품 금액'} {returnAmount > 0 ? '−' : ''}{formatPrice(returnAmount)}원
        </strong>}
        <button type="button" className={secondary} disabled={saving} onClick={close}>취소</button>
        {canEdit && <button type="submit" disabled={!canSave} className="min-h-11 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)]">
          {saving ? '저장 중…' : newExchange ? '기록 저장·교체 주문 접수' : entry ? '기록 저장' : '반품 확정'}
        </button>}
      </footer>
    </form>
  </ViewportModal>;
}

export function OrderReturnDetails({ details }) {
  if (!details?.reason && !details?.note && !details?.exchangeOrderNumber && !details?.replacement) return null;
  return <div className="mt-2 space-y-1 border-t border-[var(--border)] pt-2 text-sm">
    {details.reason && <p className="font-semibold">{details.kind === 'exchange' ? '반품 후 교체' : '반품 사유'} · {details.reason}</p>}
    {details.note && <p className="whitespace-pre-wrap break-words">{details.note}</p>}
    {details.exchangeOrderNumber && <p className="break-words">교체 주문 {details.exchangeOrderNumber}</p>}
    {details.replacement && <p className="break-words">교체 품목 · {details.replacement}</p>}
  </div>;
}
