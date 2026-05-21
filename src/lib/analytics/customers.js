// 거래처 분석 — TOP N, 트렌드, 세그먼트
// Gemini Function Calling에서 호출되는 도구 함수

import {
  filterByPeriod,
  groupByCustomer,
  sumRevenue,
  orderQuantity,
  monthlyTrend,
  averageOrderValue,
  daysSinceLastOrder,
  previousPeriodRange,
  orderInRange,
  percentChange,
} from './aggregations';
import { analyzeAllCustomers } from './rfm';
import { getTodayKST } from '../utils';

// 거래처 매출 TOP N
// params: { period: '1W'|'1M'|'3M'|'6M'|'1Y'|'ALL', sortBy: 'revenue'|'count'|'qty', limit: number }
// 반환: [{ rank, name, customerId, phone, revenue, count, qty, avgOrderValue, lastOrderDays, changePct? }]
export function getTopCustomers(orders, customers, { period = '1M', sortBy = 'revenue', limit = 10 } = {}) {
  const today = getTodayKST();
  const filtered = filterByPeriod(orders, period, today);
  if (filtered.length === 0) {
    return { period, sortBy, total: 0, results: [], message: '해당 기간에 주문이 없습니다.' };
  }
  const customerByName = new Map(
    (customers || []).map((c) => [(c?.name || '').trim().toLowerCase(), c])
  );
  const grouped = groupByCustomer(filtered);
  // 이전 기간 (변화율 비교용)
  const prevRange = previousPeriodRange(period, today);
  const prevByCustomer = new Map();
  if (prevRange) {
    const prevOrders = (orders || []).filter((o) => orderInRange(o, prevRange.start, prevRange.end));
    const prevGrouped = groupByCustomer(prevOrders);
    for (const [k, g] of prevGrouped.entries()) {
      prevByCustomer.set(k, sumRevenue(g.orders));
    }
  }
  const rows = [];
  for (const [key, group] of grouped.entries()) {
    if (key === '__unknown') continue;
    const revenue = sumRevenue(group.orders);
    const count = group.orders.length;
    const qty = group.orders.reduce((acc, o) => acc + orderQuantity(o, { excludeCustom: true }), 0);
    const customer = customerByName.get(key);
    const prevRev = prevByCustomer.get(key) || 0;
    rows.push({
      name: group.name,
      customerId: customer?.id ?? null,
      phone: customer?.phone || '',
      revenue,
      count,
      qty,
      avgOrderValue: count > 0 ? Math.round(revenue / count) : 0,
      lastOrderDays: daysSinceLastOrder(group.orders, today),
      changePct: percentChange(revenue, prevRev),
    });
  }
  const sorter = {
    revenue: (a, b) => b.revenue - a.revenue,
    count: (a, b) => b.count - a.count,
    qty: (a, b) => b.qty - a.qty,
  }[sortBy] || ((a, b) => b.revenue - a.revenue);
  rows.sort(sorter);
  const top = rows.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
  return {
    period,
    sortBy,
    total: rows.length,
    results: top,
  };
}

// 특정 거래처 월별 추이
// params: { customerId?: number, customerName?: string, months: number }
// 반환: { name, months: [{ month, revenue, count, qty }], totals, avgMonthly }
export function getCustomerTrend(orders, customers, { customerId, customerName, months = 6 } = {}) {
  const today = getTodayKST();
  // 거래처 식별 — id 우선, 없으면 이름
  let target = null;
  if (customerId != null) {
    target = (customers || []).find((c) => c.id === customerId);
  }
  if (!target && customerName) {
    const lower = customerName.trim().toLowerCase();
    target = (customers || []).find((c) => (c?.name || '').toLowerCase() === lower);
  }
  const nameKey = (target?.name || customerName || '').trim().toLowerCase();
  if (!nameKey) {
    return { error: '거래처를 찾을 수 없습니다.', name: customerName || '' };
  }
  const customerOrders = (orders || []).filter(
    (o) => (o?.customerName || '').trim().toLowerCase() === nameKey
  );
  if (customerOrders.length === 0) {
    return {
      name: target?.name || customerName,
      customerId: target?.id ?? null,
      months: [],
      totals: { revenue: 0, count: 0, qty: 0, avgOrderValue: 0 },
      avgMonthly: 0,
      message: '해당 거래처의 주문이 없습니다.',
    };
  }
  const buckets = monthlyTrend(customerOrders, months, today);
  const monthsResult = buckets.map((b) => ({
    month: b.month,
    revenue: b.revenue,
    count: b.count,
    qty: b.orders.reduce((acc, o) => acc + orderQuantity(o, { excludeCustom: true }), 0),
  }));
  const totals = {
    revenue: sumRevenue(customerOrders),
    count: customerOrders.length,
    qty: customerOrders.reduce((acc, o) => acc + orderQuantity(o, { excludeCustom: true }), 0),
    avgOrderValue: averageOrderValue(customerOrders),
  };
  const monthlySum = monthsResult.reduce((acc, m) => acc + m.revenue, 0);
  const avgMonthly = monthsResult.length > 0 ? Math.round(monthlySum / monthsResult.length) : 0;
  return {
    name: target?.name || customerName,
    customerId: target?.id ?? null,
    phone: target?.phone || '',
    months: monthsResult,
    totals,
    avgMonthly,
    lastOrderDays: daysSinceLastOrder(customerOrders, today),
  };
}

// 전체 거래처 RFM 세그먼트 분석
// params: { period: '3M', minOrders: 1 }
// 반환: { period, totalCustomers, segments: { Champion: { count, members: [...] }, ... } }
export function getCustomerSegments(orders, customers, { period = '3M', minOrders = 1, limit = 20 } = {}) {
  const today = getTodayKST();
  const { bySegment } = analyzeAllCustomers(orders, customers, { period, minOrders, today });
  const segments = {};
  let total = 0;
  for (const [seg, members] of Object.entries(bySegment)) {
    total += members.length;
    segments[seg] = {
      count: members.length,
      members: members.slice(0, limit).map((m) => ({
        name: m.name,
        customerId: m.customerId,
        phone: m.phone,
        score: m.score,
        r: m.r,
        f: m.f,
        m: m.m,
        recencyDays: m.recencyDays,
        frequency: m.frequency,
        monetary: m.monetary,
      })),
    };
  }
  return {
    period,
    totalCustomers: total,
    segments,
  };
}

// 휴면 위험 거래처 — 평소 패턴 대비 N일 이상 미주문
// params: { daysThreshold: 60, minPastOrders: 3 }
export function getDormantCustomers(orders, customers, { daysThreshold = 60, minPastOrders = 3, limit = 20 } = {}) {
  const today = getTodayKST();
  const grouped = groupByCustomer(orders);
  const customerByName = new Map(
    (customers || []).map((c) => [(c?.name || '').trim().toLowerCase(), c])
  );
  const rows = [];
  for (const [key, group] of grouped.entries()) {
    if (key === '__unknown') continue;
    if (group.orders.length < minPastOrders) continue;
    const lastDays = daysSinceLastOrder(group.orders, today);
    if (lastDays == null || lastDays < daysThreshold) continue;
    const customer = customerByName.get(key);
    rows.push({
      name: group.name,
      customerId: customer?.id ?? null,
      phone: customer?.phone || '',
      pastOrderCount: group.orders.length,
      lifetimeRevenue: sumRevenue(group.orders),
      lastOrderDays: lastDays,
    });
  }
  rows.sort((a, b) => b.lifetimeRevenue - a.lifetimeRevenue);
  return {
    daysThreshold,
    total: rows.length,
    results: rows.slice(0, limit),
  };
}
