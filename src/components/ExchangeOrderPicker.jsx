import { useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { formatPrice, getTodayKST, normalizeText, offsetDateKST, toDateKST } from '@/lib/utils';

const dayFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
});
const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
});
const dateKey = value => value && Number.isFinite(new Date(value).getTime()) ? toDateKST(value) : '';
const dayLabel = day => day ? dayFormat.format(new Date(day + 'T00:00:00+09:00')) : '주문일 미등록';
const timeLabel = value => dateKey(value) ? timeFormat.format(new Date(value)) : '';
const field = 'min-h-11 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-base';

function OrderItems({ items = [], limit = items.length }) {
  if (!items.length) return <p className="text-sm text-[var(--muted-foreground)]">등록된 상품 없음</p>;
  return <ul className="space-y-1 text-sm">
    {items.slice(0, limit).map((item, index) => (
      <li key={index} className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 break-words">{item.name || '상품명 미등록'}</span>
        {Number(item.quantity) > 0 && <span className="shrink-0 tabular-nums">{item.quantity}개</span>}
      </li>
    ))}
    {items.length > limit && <li className="text-[var(--muted-foreground)]">외 {items.length - limit}종</li>}
  </ul>;
}

export default function ExchangeOrderPicker({ candidates, selected, value, onSelect }) {
  const panelId = useId();
  const toggle = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const today = getTodayKST();
  const start = period === 'custom' ? from : period === 'all' ? '' : offsetDateKST(today, 1 - Number(period));
  const end = period === 'custom' ? to : period === 'all' ? '' : today;
  const invalidRange = start && end && start > end;

  const groups = useMemo(() => {
    const result = new Map();
    if (invalidRange) return result;
    const terms = query.trim().split(/\s+/).map(normalizeText).filter(Boolean);
    for (const order of candidates) {
      const day = dateKey(order.createdAt);
      if (((start || end) && !day) || (start && day < start) || (end && day > end)) continue;
      if (terms.length) {
        const fields = [order.orderNumber, ...(order.items || []).map(item => item.name || '')].map(normalizeText);
        if (!terms.every(term => fields.some(field => field.includes(term)))) continue;
      }
      if (!result.has(day)) result.set(day, []);
      result.get(day).push(order);
    }
    return result;
  }, [candidates, end, invalidRange, query, start]);
  const resultCount = [...groups.values()].reduce((count, group) => count + group.length, 0);

  const pick = candidate => {
    onSelect(candidate.orderNumber);
    setOpen(false);
    toggle.current?.focus({ preventScroll: true });
  };

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">교체 주문 연결</h3>
      {value && <button type="button" onClick={() => { onSelect(''); toggle.current?.focus({ preventScroll: true }); }}
        className="min-h-11 px-2 text-sm font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)]">연결 해제</button>}
    </div>
    {value && <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="flex flex-wrap justify-between gap-x-2 gap-y-1">
        <p className="min-w-0 break-words text-sm font-semibold">{value}</p>
        {selected && <strong className="tabular-nums text-[var(--primary)]">{formatPrice(selected.totalAmount)}원</strong>}
      </div>
      {selected && <>
        <p className="text-sm text-[var(--muted-foreground)]">{dayLabel(dateKey(selected.createdAt))} {timeLabel(selected.createdAt)}</p>
        <OrderItems items={selected.items} />
      </>}
    </div>}
    {candidates.length > 0 ? <>
      <button ref={toggle} type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(previous => !previous)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left font-semibold hover:bg-[var(--accent)]">
        {open ? '교체 주문 목록 접기' : value ? '교체 주문 변경' : '교체 주문 선택'}
        <ChevronDown size={18} className={open ? 'shrink-0 rotate-180' : 'shrink-0'} />
      </button>
      <div id={panelId} hidden={!open} className="space-y-2" onKeyDown={event => {
        if (event.key === 'Enter' && event.target.tagName === 'INPUT' && !event.nativeEvent.isComposing && event.keyCode !== 229) event.preventDefault();
      }}>{open && <>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9.5rem]">
          <div className="relative min-w-0">
            <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-[var(--muted-foreground)]" />
            <input type="search" aria-label="교체 주문 검색" className={field + ' !pl-9'} value={query}
              onChange={event => setQuery(event.target.value)} placeholder="상품명 · 주문번호 검색" />
          </div>
          <select aria-label="교체 주문 기간" className={field} value={period} onChange={event => setPeriod(event.target.value)}>
            <option value="all">전체 기간</option><option value="7">최근 7일</option>
            <option value="30">최근 30일</option><option value="custom">날짜 지정</option>
          </select>
        </div>
        {period === 'custom' && <div className="grid grid-cols-2 gap-2">
          <label className="min-w-0 text-sm">시작일<input type="date" aria-label="교체 주문 시작일" className={field + ' mt-1'} value={from} onChange={event => setFrom(event.target.value)} /></label>
          <label className="min-w-0 text-sm">종료일<input type="date" aria-label="교체 주문 종료일" className={field + ' mt-1'} value={to} onChange={event => setTo(event.target.value)} /></label>
        </div>}
        {invalidRange ? <p role="status" className="text-sm text-[var(--destructive)]">종료일을 시작일과 같거나 이후로 선택해주세요.</p>
          : <p role="status" className="text-sm text-[var(--muted-foreground)]">{resultCount ? `조회 ${resultCount}건` : '조건에 맞는 교체 주문이 없습니다.'}</p>}
        {resultCount > 0 && <div role="region" aria-label="날짜별 교체 주문" tabIndex={0}
          className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)]">
          {[...groups].map(([day, orders]) => <section key={day}>
            <h4 className="bg-[var(--muted)] px-3 py-2 text-sm font-semibold">{dayLabel(day)} <span className="font-normal text-[var(--muted-foreground)]">{orders.length}건</span></h4>
            {orders.map(candidate => <div key={candidate.orderNumber}
              className="relative space-y-1.5 border-t border-[var(--border)] px-3 py-2.5 hover:bg-[var(--accent)] focus-within:bg-[var(--accent)]">
              <button type="button" onClick={() => pick(candidate)} aria-pressed={candidate.orderNumber === value}
                className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1 text-left text-sm font-semibold after:absolute after:inset-0">
                <span className="flex min-w-0 items-center gap-1.5 break-all">
                  {candidate.orderNumber === value && <Check className="shrink-0 text-[var(--primary)]" size={15} />}
                  {candidate.orderNumber}
                </span>
                <span className="tabular-nums text-[var(--primary)]">{formatPrice(candidate.totalAmount)}원</span>
              </button>
              {timeLabel(candidate.createdAt) && <p className="text-xs text-[var(--muted-foreground)]">{timeLabel(candidate.createdAt)}</p>}
              <OrderItems items={candidate.items} limit={2} />
            </div>)}
          </section>)}
        </div>}
      </>}</div>
    </> : <p className="text-sm text-[var(--muted-foreground)]">같은 거래처의 연결 가능한 주문이 없습니다.</p>}
  </div>;
}
