import { resolvePaymentCustomer } from './paymentIdentity.js';
// 명세서 표시 계산. DB에 쓰지 않으며, 청구 원장과 인쇄용 편집을 구분한다.
export function kstDate(value = new Date()) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10) : '';
}

export const signedPaymentAmount = h => (h.type === 'expense' ? -1 : 1) * Number(h.amount || 0);
export function customerBalanceSummary(records) {
  const byCustomer = new Map();
  for (const r of records) {
    const key = r.customer_id == null ? `unknown:${r.id}` : String(r.customer_id);
    byCustomer.set(key, (byCustomer.get(key) || 0) + Number(r.balance || 0));
  }
  return { byCustomer, receivable: [...byCustomer.values()].reduce((s, b) => s + Math.max(0, b), 0),
    credit: [...byCustomer.values()].reduce((s, b) => s + Math.max(0, -b), 0) };
}
const amount = value => {
  const n = Number(value ?? 0);
  if (!Number.isSafeInteger(n)) throw new Error('명세서 금액이 올바른 원화 정수가 아닙니다.');
  return n;
};
const sum = (rows, field) => rows.reduce((s, r) => s + amount(r[field]), 0);

export function partitionInvoiceRecords(records, range) {
  const current = [], carryover = [];
  for (const raw of records) {
    // 날짜 없는 수기 건이 매 기간 새 매출로 반복되지 않도록 생성일을 사용한다.
    const r = { ...raw, invoice_date: kstDate(raw.invoice_date || raw.created_at) };
    if (!range.from || !r.invoice_date || (r.invoice_date >= range.from && r.invoice_date <= range.to)) current.push(r);
    else if (r.invoice_date < range.from && amount(r.balance) !== 0) carryover.push(r);
  }
  return { current, carryover };
}

export function recordToInvoiceLines(record, overrides = {}) {
  const items = Array.isArray(record.items) ? record.items : [];
  const line = (it, index, override = {}) => {
    const qty = Number(override.qty ?? it.quantity ?? 1);
    const unitWithVat = amount(override.unitWithVat ?? it.price ?? it.unit_price ?? 0);
    if (!Number.isSafeInteger(qty) || qty <= 0 || unitWithVat < 0) throw new Error('명세서 수량·단가를 확인해주세요.');
    const total = amount(qty * unitWithVat);
    const isTaxFree = record.is_vat_exempt === true || it.taxFree === true;
    const supply = isTaxFree ? total : Math.round(total / 1.1);
    return {
      key: `${record.id}:${index}`, date: record.invoice_date || '',
      code: it.code || it.product_id || '', name: override.name ?? it.name ?? it.product_name ?? '품목',
      spec: it.spec || it.option || '', qty, unitWithVat,
      unitPrice: isTaxFree ? unitWithVat : Math.round(unitWithVat / 1.1), supply, vat: total - supply, isTaxFree,
      edited: Object.keys(override).length > 0,
      isDiscounted: !!it.discountType && Number(it.discountValue) > 0 && override.unitWithVat == null,
      baseUnitWithVat: Number(it.originalPrice) || unitWithVat,
      discountType: it.discountType, discountValue: it.discountValue,
    };
  };
  const original = items.map((it, index) => line(it, index));
  const result = items.flatMap((it, index) => {
    const override = overrides[`${record.id}:${index}`] || {};
    return override.deleted ? [] : [line(it, index, override)];
  });
  const total = amount(record.total_amount);
  // 실제 저장된 세액을 우선한다. 가상 주문은 품목별 비과세를 유지한다.
  const originalSupply = sum(original, 'supply'), originalVat = sum(original, 'vat');
  const validTax = record.supply_amount != null && record.vat_amount != null
    && amount(record.supply_amount) + amount(record.vat_amount) === total;
  const supply = validTax ? amount(record.supply_amount)
    : record.is_vat_exempt ? total
    : original.length ? originalSupply + Math.round((total - originalSupply - originalVat) / 1.1) : Math.round(total / 1.1);
  const adjustmentSupply = supply - originalSupply;
  const adjustmentVat = total - supply - originalVat;
  // 품목 없는 수기 건, 반품·할인·원 단위 세액 차이도 원장 총액에 정확히 맞춘다.
  if (!original.length || adjustmentSupply !== 0 || adjustmentVat !== 0) {
    result.push({ key: `${record.id}:ledger`, date: record.invoice_date || '', code: '',
      name: !original.length ? (record.memo || record.invoice_number || '수기 명세서') : '반품·금액 및 세액 조정',
      qty: 1, unitPrice: adjustmentSupply, unitWithVat: adjustmentSupply + adjustmentVat,
      supply: adjustmentSupply, vat: adjustmentVat, locked: true,
    });
  }
  return result;
}

export function calculateInvoice(current, carryover, selectedDates = new Set(), overrides = {}) {
  const detailed = [...current, ...carryover.filter(r => selectedDates.has(r.invoice_date))];
  const remaining = carryover.filter(r => !selectedDates.has(r.invoice_date));
  const lines = detailed.flatMap(r => recordToInvoiceLines(r, overrides)).sort((a, b) => a.date.localeCompare(b.date));
  const supply = sum(lines, 'supply'), vat = sum(lines, 'vat'), totalPaid = sum(detailed, 'paid_amount');
  const prevBalance = sum(remaining, 'balance');
  const totalBeforePaid = prevBalance + supply + vat;
  const ledgerBalance = sum([...current, ...carryover], 'balance');
  return { lines, totals: { supply, vat, sum: supply + vat, totalPaid, prevBalance, totalBeforePaid,
    grandBalance: totalBeforePaid - totalPaid, ledgerBalance,
    displayAdjustment: supply + vat - sum(detailed, 'total_amount'), count: lines.length } };
}

export function enrichInvoiceRecords(records, orders, customers, manualPaid = []) {
  const orderMap = new Map(orders.map(o => [String(o.id), o]));
  const marked = new Set(manualPaid.map(m => String(m.order_id)));
  const linked = new Set(records.map(r => String(r.order_id)));
  const result = records.map(r => {
    const order = orderMap.get(String(r.order_id));
    const orderTotal = order ? amount(order.total) - amount(order.total_returned) : null;
    return { ...r, ...(order ? { items: order.items || [], order_memo: order.memo || '' } : {}),
      _orderMismatch: order != null && orderTotal !== amount(r.total_amount),
      _manualPaidMismatch: marked.has(String(r.order_id)) && amount(r.balance) > 0 };
  });
  for (const order of orders) {
    if (linked.has(String(order.id))) continue;
    const total = amount(order.total) - amount(order.total_returned);
    if (total <= 0) continue;
    const customer = resolvePaymentCustomer(order, customers);
    result.push({ id: `virt-${order.id}`, order_id: order.id, customer_id: customer?.id || null,
      customer_name: order.customer_name || '', total_amount: total, paid_amount: 0, balance: total,
      invoice_date: kstDate(order.created_at), items: order.items || [], memo: order.memo || '',
      _virtual: true, _manualPaidMismatch: marked.has(String(order.id)), history: [] });
  }
  return result;
}

// 새 원장 생성 시 품목별 면세와 원 단위 반올림을 명세서와 동일하게 적용한다.
export function orderPaymentPayload(order, customerId) {
  if (Number(order.total_returned ?? order.totalReturned ?? 0) > 0) throw new Error('반품 주문은 청구·환불 금액을 확인한 후 원장을 등록해주세요.');
  const total = amount(order.total ?? order.totalAmount);
  if (total <= 0) throw new Error('정산할 주문 금액이 없습니다.');
  const record = {id:order.id, total_amount:total, items:order.items || [], is_vat_exempt:order.is_vat_exempt === true};
  const lines = recordToInvoiceLines(record);
  const supply = sum(lines,'supply'), vat = sum(lines,'vat');
  if (supply < 0 || vat < 0 || supply + vat !== total) throw new Error('주문 품목과 세액을 확인해주세요.');
  return {order_id:order.id,customer_id:customerId,total_amount:total,supply_amount:supply,vat_amount:vat,
    is_vat_exempt:record.is_vat_exempt || (record.items.length > 0 && record.items.every(it=>it.taxFree === true)),
    category:'sales',invoice_date:kstDate(order.created_at || order.createdAt) || null,memo:order.memo || null,paid_amount:0};
}
