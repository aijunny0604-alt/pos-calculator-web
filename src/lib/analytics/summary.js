// 기간 종합 KPI — 매출/주문수/AOV/신규 거래처/반품률
import {
  filterByPeriod,
  sumRevenue,
  averageOrderValue,
  groupByCustomer,
  periodToRange,
  previousPeriodRange,
  orderInRange,
  percentChange,
} from './aggregations';
import { getTodayKST, toDateKST } from '../utils';

// 종합 KPI 묶음
// params: { period: '1M' }
// 반환: { period, current: {...}, previous: {...}, changes: {...} }
export function getCompositeSummary(orders, customers, products, { period = '1M' } = {}) {
  const today = getTodayKST();
  const currentRange = periodToRange(period, today);
  const current = filterByPeriod(orders, period, today);
  // 이전 기간 (변화율 비교용)
  const prevRange = previousPeriodRange(period, today);
  let prev = [];
  if (prevRange) {
    prev = (orders || []).filter((o) => orderInRange(o, prevRange.start, prevRange.end));
  }
  const currentMetrics = buildMetrics(current, today, period);
  currentMetrics.newCustomers = countNewCustomers(orders, currentRange.start, currentRange.end);
  const prevMetrics = buildMetrics(prev, today, period);
  if (prevRange) {
    prevMetrics.newCustomers = countNewCustomers(orders, prevRange.start, prevRange.end);
  }
  const changes = {
    revenue: percentChange(currentMetrics.revenue.total, prevMetrics.revenue.total),
    orderCount: percentChange(currentMetrics.orderCount, prevMetrics.orderCount),
    avgOrderValue: percentChange(currentMetrics.avgOrderValue, prevMetrics.avgOrderValue),
    activeCustomers: percentChange(currentMetrics.activeCustomers, prevMetrics.activeCustomers),
    newCustomers: percentChange(currentMetrics.newCustomers, prevMetrics.newCustomers),
  };
  // 컨텍스트 정보 (UI 표시용)
  return {
    period,
    today,
    range: currentRange,
    previousRange: prevRange,
    current: currentMetrics,
    previous: prevMetrics,
    changes,
    productCount: Array.isArray(products) ? products.length : 0,
    totalCustomerCount: Array.isArray(customers) ? customers.length : 0,
  };
}

function buildMetrics(periodOrders, today, period) {
  const revenue = sumRevenue(periodOrders, { splitVat: true });
  const orderCount = periodOrders.length;
  const avgOrderValue = averageOrderValue(periodOrders);
  // 활성 거래처 = 기간 내 1건 이상 주문한 거래처 (일반고객 제외)
  const grouped = groupByCustomer(periodOrders);
  const activeKeys = new Set();
  for (const [key] of grouped.entries()) {
    if (key !== '__unknown' && key !== '일반고객') activeKeys.add(key);
  }
  const activeCustomers = activeKeys.size;
  // 반품률 = (totalReturned 합 / total 합) %
  let totalAmount = 0;
  let totalReturned = 0;
  for (const o of periodOrders) {
    totalAmount += Number(o?.totalAmount ?? o?.total ?? 0) || 0;
    totalReturned += Number(o?.totalReturned ?? 0) || 0;
  }
  const returnRate = totalAmount > 0 ? Math.round((totalReturned / totalAmount) * 1000) / 10 : 0;
  // 부가항목 사용률 (택배비/퀵비 등 isCustom 라인 포함된 주문 비율)
  let withExtraCount = 0;
  for (const o of periodOrders) {
    if ((o?.items || []).some((it) => it?.isCustom)) withExtraCount++;
  }
  const extraItemRate = orderCount > 0 ? Math.round((withExtraCount / orderCount) * 100) : 0;
  return {
    period,
    today,
    orderCount,
    revenue,
    avgOrderValue,
    activeCustomers,
    newCustomers: 0, // 호출부에서 countNewCustomers로 보정
    returnRate,
    totalReturned,
    extraItemRate,
  };
}

// 신규 거래처 = 첫 주문일이 [periodStart, periodEnd] 범위 내인 거래처
export function countNewCustomers(orders, periodStart, periodEnd) {
  if (!Array.isArray(orders)) return 0;
  const firstOrderByCustomer = new Map();
  for (const o of orders) {
    const key = (o?.customerName || '').trim().toLowerCase();
    if (!key || key === '일반고객') continue;
    const d = toDateKST(o?.createdAt);
    if (!d) continue;
    if (!firstOrderByCustomer.has(key) || firstOrderByCustomer.get(key) > d) {
      firstOrderByCustomer.set(key, d);
    }
  }
  let count = 0;
  for (const firstDate of firstOrderByCustomer.values()) {
    if (firstDate >= periodStart && firstDate <= periodEnd) count++;
  }
  return count;
}
