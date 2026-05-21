// 제품 분석 — TOP N, 트렌드, 카테고리별, 재주문 주기
// Gemini Function Calling 도구 함수

import {
  filterByPeriod,
  groupByProduct,
  groupByCategory,
  monthlyTrend,
  orderInRange,
  previousPeriodRange,
  percentChange,
} from './aggregations';
import { getTodayKST, toDateKST } from '../utils';

// 제품 TOP N (또는 카테고리 TOP)
// params: { period, sortBy: 'revenue'|'qty', limit, byCategory: boolean }
export function getTopProducts(orders, products, { period = '1M', sortBy = 'revenue', limit = 10, byCategory = false } = {}) {
  const today = getTodayKST();
  const filtered = filterByPeriod(orders, period, today);
  if (filtered.length === 0) {
    return { period, sortBy, byCategory, total: 0, results: [], message: '해당 기간에 주문이 없습니다.' };
  }
  // 카테고리 모드
  if (byCategory) {
    const grouped = groupByCategory(filtered, products, { excludeCustom: true });
    const rows = [];
    for (const [cat, slot] of grouped.entries()) {
      rows.push({
        category: cat,
        qty: slot.qty,
        revenue: slot.revenue,
        productCount: slot.productIds.size,
      });
    }
    const sorter = sortBy === 'qty'
      ? (a, b) => b.qty - a.qty
      : (a, b) => b.revenue - a.revenue;
    rows.sort(sorter);
    return {
      period,
      sortBy,
      byCategory: true,
      total: rows.length,
      results: rows.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r })),
    };
  }
  // 제품 모드 — 이전 기간 변화율 비교
  const productMap = new Map((products || []).map((p) => [p.id, p]));
  const grouped = groupByProduct(filtered, { excludeCustom: true });
  const prevRange = previousPeriodRange(period, today);
  const prevByProduct = new Map();
  if (prevRange) {
    const prevOrders = (orders || []).filter((o) => orderInRange(o, prevRange.start, prevRange.end));
    const prevGrouped = groupByProduct(prevOrders, { excludeCustom: true });
    for (const [pid, slot] of prevGrouped.entries()) {
      prevByProduct.set(pid, slot.revenue);
    }
  }
  const rows = [];
  for (const [pid, slot] of grouped.entries()) {
    const product = productMap.get(pid);
    const prevRev = prevByProduct.get(pid) || 0;
    rows.push({
      productId: pid,
      name: slot.name,
      category: product?.category || '미분류',
      stock: product?.stock ?? null,
      stockStatus: product?.stock_status || null,
      qty: slot.qty,
      revenue: slot.revenue,
      avgPrice: slot.qty > 0 ? Math.round(slot.revenue / slot.qty) : 0,
      changePct: percentChange(slot.revenue, prevRev),
    });
  }
  const sorter = sortBy === 'qty'
    ? (a, b) => b.qty - a.qty
    : (a, b) => b.revenue - a.revenue;
  rows.sort(sorter);
  return {
    period,
    sortBy,
    byCategory: false,
    total: rows.length,
    results: rows.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r })),
  };
}

// 특정 제품 월별 추이
// params: { productId?, productName?, months: 6 }
export function getProductTrend(orders, products, { productId, productName, months = 6 } = {}) {
  const today = getTodayKST();
  let target = null;
  if (productId != null) target = (products || []).find((p) => p.id === productId);
  if (!target && productName) {
    const lower = productName.trim().toLowerCase();
    target = (products || []).find((p) => (p?.name || '').toLowerCase() === lower);
  }
  if (!target && productId == null && !productName) {
    return { error: '제품을 식별할 수 없습니다.' };
  }
  const targetId = target?.id ?? productId;
  const targetName = target?.name || productName;
  // 해당 제품을 포함한 주문 + 라인만 추출
  const productOrders = [];
  for (const o of orders || []) {
    if (!o?.items) continue;
    const matched = o.items.find((it) => it?.id === targetId || (productName && it?.name === targetName));
    if (matched) {
      productOrders.push({
        ...o,
        // 해당 제품 라인만 필터링한 가상 주문 (월별 집계용)
        _productLine: matched,
      });
    }
  }
  if (productOrders.length === 0) {
    return {
      name: targetName,
      productId: targetId,
      category: target?.category || '미분류',
      months: [],
      totals: { revenue: 0, qty: 0, orderCount: 0 },
      message: '해당 제품의 판매 기록이 없습니다.',
    };
  }
  // 월별 묶음 직접 계산 (제품 라인 단위)
  const buckets = monthlyTrend(productOrders, months, today);
  const monthsResult = buckets.map((b) => {
    let qty = 0;
    let revenue = 0;
    for (const o of b.orders) {
      const line = o._productLine;
      const q = Number(line?.quantity) || 0;
      const p = Number(line?.price) || 0;
      qty += q;
      revenue += q * p;
    }
    return { month: b.month, qty, revenue, orderCount: b.count };
  });
  // 전체 합계
  let totalQty = 0;
  let totalRev = 0;
  for (const o of productOrders) {
    const line = o._productLine;
    const q = Number(line?.quantity) || 0;
    const p = Number(line?.price) || 0;
    totalQty += q;
    totalRev += q * p;
  }
  return {
    name: targetName,
    productId: targetId,
    category: target?.category || '미분류',
    stock: target?.stock ?? null,
    months: monthsResult,
    totals: {
      revenue: totalRev,
      qty: totalQty,
      orderCount: productOrders.length,
      avgPrice: totalQty > 0 ? Math.round(totalRev / totalQty) : 0,
    },
  };
}

// 재주문 평균 주기 (특정 제품 또는 특정 거래처)
// params: { productId?, customerId?, customerName? }
// 반환: { avgGapDays, sampleSize, gaps: [...] }
export function getRepeatPurchaseGap(orders, { productId, customerId, customerName } = {}) {
  // 1) 제품 모드
  if (productId != null) {
    const dates = new Set();
    for (const o of orders || []) {
      if (!o?.items) continue;
      const hit = o.items.find((it) => it?.id === productId);
      if (!hit) continue;
      const d = toDateKST(o?.createdAt);
      if (d) dates.add(d);
    }
    return computeGap(Array.from(dates).sort(), { productId });
  }
  // 2) 거래처 모드
  if (customerId != null || customerName) {
    const lower = (customerName || '').trim().toLowerCase();
    const dates = new Set();
    for (const o of orders || []) {
      const match =
        (customerId != null && o?.customerId === customerId) ||
        (lower && (o?.customerName || '').toLowerCase() === lower);
      if (!match) continue;
      const d = toDateKST(o?.createdAt);
      if (d) dates.add(d);
    }
    return computeGap(Array.from(dates).sort(), { customerName });
  }
  return { error: 'productId 또는 customerId/customerName 중 하나는 필요합니다.' };
}

function computeGap(sortedDates, meta = {}) {
  if (sortedDates.length < 2) {
    return {
      ...meta,
      avgGapDays: null,
      sampleSize: sortedDates.length,
      message: '재주문 데이터가 부족합니다 (최소 2건 필요).',
    };
  }
  const gaps = [];
  for (let i = 1; i < sortedDates.length; i++) {
    const diff = Math.round((new Date(sortedDates[i]) - new Date(sortedDates[i - 1])) / (1000 * 60 * 60 * 24));
    if (diff > 0) gaps.push(diff);
  }
  if (gaps.length === 0) {
    return { ...meta, avgGapDays: null, sampleSize: sortedDates.length, message: '모든 주문이 동일일자' };
  }
  const avg = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  const min = Math.min(...gaps);
  const max = Math.max(...gaps);
  return {
    ...meta,
    avgGapDays: avg,
    minGapDays: min,
    maxGapDays: max,
    sampleSize: sortedDates.length,
    gaps,
  };
}
