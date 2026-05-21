// 결제/미수 분석 도구
// payment_records: { id, order_id, customer_id, customer_name, total_amount, paid_amount, balance, payment_status, invoice_date, ... }
// payment_history: { id, payment_record_id, amount, method, paid_at, memo, ... }

import { toDateKST, getTodayKST, offsetDateKST } from '../utils';

// 전체 결제 현황 요약
export function getPaymentSummary(paymentRecords = [], paymentHistory = []) {
  if (!Array.isArray(paymentRecords) || paymentRecords.length === 0) {
    return {
      total: 0,
      paid: 0,
      partial: 0,
      unpaid: 0,
      totalAmount: 0,
      totalPaid: 0,
      totalBalance: 0,
      totalHistoryCount: paymentHistory?.length || 0,
      message: '결제 기록이 없습니다.',
    };
  }
  let paid = 0, partial = 0, unpaid = 0;
  let totalAmount = 0, totalPaid = 0, totalBalance = 0;
  for (const r of paymentRecords) {
    const status = r?.payment_status || 'unpaid';
    const t = Number(r?.total_amount) || 0;
    const p = Number(r?.paid_amount) || 0;
    const b = Number(r?.balance) || (t - p);
    totalAmount += t;
    totalPaid += p;
    totalBalance += b;
    if (status === 'paid' || b === 0) paid++;
    else if (p > 0) partial++;
    else unpaid++;
  }
  // 최근 입금 이력
  const recentHistory = (paymentHistory || []).slice(0, 10).map((h) => ({
    amount: Number(h.amount) || 0,
    method: h.method,
    paidAt: h.paid_at,
    memo: h.memo || '',
  }));
  return {
    total: paymentRecords.length,
    paid,
    partial,
    unpaid,
    totalAmount,
    totalPaid,
    totalBalance,
    paidRate: paymentRecords.length > 0 ? Math.round((paid / paymentRecords.length) * 100) : 0,
    totalHistoryCount: paymentHistory?.length || 0,
    recentHistory,
  };
}

// 미수 거래처 (미수금 큰 순)
// params: { minDays: 0 (모두), minBalance: 0, limit: 30 }
export function getOverdueCustomers(paymentRecords = [], customers = [], { minDays = 0, minBalance = 0, limit = 30 } = {}) {
  if (!Array.isArray(paymentRecords) || paymentRecords.length === 0) {
    return { minDays, total: 0, results: [], message: '결제 기록이 없습니다.' };
  }
  const today = getTodayKST();
  const customerById = new Map((customers || []).map((c) => [c.id, c]));
  // 거래처별 미수 집계
  const map = new Map();
  for (const r of paymentRecords) {
    const balance = Number(r?.balance) || 0;
    if (balance <= 0) continue;
    const cid = r?.customer_id;
    const cname = r?.customer_name || (cid != null ? customerById.get(cid)?.name : null) || '(이름없음)';
    const invoiceDate = r?.invoice_date ? toDateKST(r.invoice_date) : '';
    const overdueDays = invoiceDate
      ? Math.round((new Date(today) - new Date(invoiceDate)) / (1000 * 60 * 60 * 24))
      : 0;
    if (!map.has(cname)) {
      map.set(cname, {
        customerId: cid,
        name: cname,
        totalBalance: 0,
        recordCount: 0,
        oldestDays: 0,
        oldestInvoiceDate: null,
      });
    }
    const slot = map.get(cname);
    slot.totalBalance += balance;
    slot.recordCount++;
    if (overdueDays > slot.oldestDays) {
      slot.oldestDays = overdueDays;
      slot.oldestInvoiceDate = invoiceDate || null;
    }
  }
  const rows = [];
  for (const slot of map.values()) {
    if (slot.totalBalance < minBalance) continue;
    if (slot.oldestDays < minDays) continue;
    const customer = customerById.get(slot.customerId);
    rows.push({
      ...slot,
      phone: customer?.phone || '',
    });
  }
  rows.sort((a, b) => b.totalBalance - a.totalBalance || b.oldestDays - a.oldestDays);
  return {
    minDays,
    minBalance,
    total: rows.length,
    results: rows.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r })),
  };
}

// 입금 이력 분석 (기간별 + 방법별)
// params: { period: '1M' | '3M' | '1Y' | 'ALL' }
export function getPaymentInflow(paymentHistory = [], { period = '1M', limit = 50 } = {}) {
  if (!Array.isArray(paymentHistory) || paymentHistory.length === 0) {
    return { period, total: 0, totalAmount: 0, byMethod: [], message: '입금 이력이 없습니다.' };
  }
  const today = getTodayKST();
  // 기간 필터
  let from;
  if (period === '1M') from = offsetDateKST(today, -30);
  else if (period === '3M') from = offsetDateKST(today, -90);
  else if (period === '1Y') from = offsetDateKST(today, -365);
  else from = '1970-01-01';

  const filtered = paymentHistory.filter((h) => {
    const d = toDateKST(h?.paid_at);
    return d && d >= from && d <= today;
  });

  let totalAmount = 0;
  const methodMap = new Map();
  for (const h of filtered) {
    const amt = Number(h?.amount) || 0;
    totalAmount += amt;
    const method = h?.method || '미지정';
    if (!methodMap.has(method)) methodMap.set(method, { method, count: 0, amount: 0 });
    methodMap.get(method).count++;
    methodMap.get(method).amount += amt;
  }
  const byMethod = Array.from(methodMap.values()).sort((a, b) => b.amount - a.amount);
  // 최근 입금 N건
  const recent = filtered.slice(0, limit).map((h) => ({
    amount: Number(h.amount) || 0,
    method: h.method,
    paidAt: toDateKST(h.paid_at),
    memo: h.memo || '',
  }));
  return {
    period,
    from,
    to: today,
    total: filtered.length,
    totalAmount,
    avgAmount: filtered.length > 0 ? Math.round(totalAmount / filtered.length) : 0,
    byMethod,
    recent,
  };
}
