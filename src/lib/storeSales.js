import { PAYMENT_PENDING_STATUSES } from './orderStatus.js';

const canceled = new Set(['cancelled', 'CANCELED', 'CANCELED_BY_NOPAYMENT', 'RETURNED']);
const amount = value => value === null || value === undefined || value === '' || !Number.isSafeInteger(Number(value)) || Number(value) < 0 ? null : Number(value);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
export function storeSalesOrdersUrl(baseUrl, start, end) {
  if (!validDate(start) || !validDate(end) || start > end) throw new Error('조회 기간을 확인해주세요.');
  const next = new Date(`${end}T00:00:00Z`); next.setUTCDate(next.getUTCDate()+1);
  const url = new URL(`${baseUrl}/rest/v1/external_orders`);
  url.searchParams.set('provider', 'eq.naver');
  url.searchParams.append('received_at', `gte.${start}T00:00:00+09:00`);
  url.searchParams.append('received_at', `lt.${next.toISOString().slice(0,10)}T00:00:00+09:00`);
  url.searchParams.set('order', 'received_at.desc,id.desc');
  return url.toString();
}
export function kstDay(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul'}).format(date) : null;
}

// 네이버가 제공한 상품주문 금액만 합산한다. 불완전한 자료는 0원으로 취급하지 않는다.
export function summarizeStoreSales(orders, itemsByOrder = {}) {
  const days = new Map();
  let total = 0, products = 0, unpaid = 0, canceledCount = 0, missing = 0, initial = 0, claims = 0, paidOrders = 0;
  for (const order of orders) {
    if (order.provider !== 'naver') continue;
    if (PAYMENT_PENDING_STATUSES.has(order.order_status)) { unpaid++; continue; }
    const day = kstDay(order.received_at);
    if (!day) { missing++; continue; }
    const group = days.get(day) || {date:day,total:0,orders:0,missing:0};
    days.set(day, group);
    const items = itemsByOrder[order.id] || [];
    const entries = items.length ? items : order.raw_payload?.productOrder ? [{raw_payload:order.raw_payload}] : [];
    if (!entries.length && (canceled.has(order.order_status) || order.naver_cancel_succeeded_at)) { canceledCount++; continue; }
    paidOrders++; group.orders++;
    if (!entries.length) { missing++; group.missing++; continue; }
    for (const entry of entries) {
      const po = entry.raw_payload?.productOrder;
      if (!po) { missing++; group.missing++; continue; }
      const status = po.productOrderStatus || (entries.length === 1 ? order.order_status : '');
      if (PAYMENT_PENDING_STATUSES.has(status)) { unpaid++; continue; }
      const claim = /CANCEL|RETURN/.test(`${po.claimStatus || ''} ${po.claimType || ''}`) || (Array.isArray(po.completedClaims) && po.completedClaims.length > 0);
      if (claim) claims++;
      let value = amount(po.remainPaymentAmount);
      if (canceled.has(status)) {
        if (value !== null && value > 0) { missing++; group.missing++; }
        else if (!claim) canceledCount++;
        continue;
      }
      if (value === null && canceled.has(order.order_status) && !po.productOrderStatus) { missing++; group.missing++; continue; }
      if (value === null && !claim) {
        value = amount(po.initialPaymentAmount ?? po.totalPaymentAmount);
        if (value !== null) initial++;
      }
      if (value === null) { missing++; group.missing++; continue; }
      total += value; group.total += value; products++;
    }
  }
  return {total,products,paidOrders,unpaid,canceledCount,missing,initial,claims,days:[...days.values()].sort((a,b)=>b.date.localeCompare(a.date))};
}
