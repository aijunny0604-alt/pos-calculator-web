// 분석 공통 유틸 — 기간 필터 / 합산 / 그룹핑 / 시계열
// 모든 함수는 NaN-safe, 0건 입력 시 빈 결과 반환
// orders 입력은 App.jsx formatOrder 후 형태 (createdAt, customerName, items, totalAmount 등)

import { getTodayKST, offsetDateKST, offsetMonthKST, toDateKST } from '../utils';

export const PERIOD_KEYS = ['1W', '1M', '3M', '6M', '1Y', 'ALL'];

// 기간 키 → 시작/종료 KST 날짜 (YYYY-MM-DD)
export function periodToRange(period = '1M', today = getTodayKST()) {
  const end = today;
  if (period === 'ALL') return { start: '1970-01-01', end };
  if (period === '1W') return { start: offsetDateKST(end, -6), end };
  if (period === '1M') return { start: offsetMonthKST(end, -1), end };
  if (period === '3M') return { start: offsetMonthKST(end, -3), end };
  if (period === '6M') return { start: offsetMonthKST(end, -6), end };
  if (period === '1Y') return { start: offsetMonthKST(end, -12), end };
  return { start: '1970-01-01', end };
}

// 주문이 [start, end] 기간(KST, inclusive)에 포함되는지
export function orderInRange(order, start, end) {
  if (!order?.createdAt) return false;
  const d = toDateKST(order.createdAt);
  return d >= start && d <= end;
}

// 기간 필터
export function filterByPeriod(orders, period = '1M', today = getTodayKST()) {
  if (!Array.isArray(orders) || orders.length === 0) return [];
  const { start, end } = periodToRange(period, today);
  return orders.filter((o) => orderInRange(o, start, end));
}

// 주문 1건의 매출 합산 (VAT 포함 = totalAmount, 반품 차감 옵션)
// NaN-safe: 모든 비유한수는 0으로 처리
export function orderRevenue(order, { includeReturned = false } = {}) {
  if (!order) return 0;
  const total = Number(order.totalAmount ?? order.total ?? 0);
  const returned = Number(order.totalReturned ?? 0);
  const safe = Number.isFinite(total) ? total : 0;
  const safeReturned = Number.isFinite(returned) ? returned : 0;
  if (includeReturned) return safe;
  return Math.max(0, safe - safeReturned);
}

// 주문 배열의 매출 합산 (옵션: VAT 분리)
export function sumRevenue(orders, options = {}) {
  const { includeReturned = false, splitVat = false } = options;
  if (!Array.isArray(orders) || orders.length === 0) {
    return splitVat ? { total: 0, supply: 0, vat: 0 } : 0;
  }
  const total = orders.reduce((acc, o) => acc + orderRevenue(o, { includeReturned }), 0);
  if (!splitVat) return total;
  const supply = Math.round(total / 1.1);
  return { total, supply, vat: total - supply };
}

// 주문 1건의 라인 수량 합산 (반품 미포함, 부가항목은 옵션)
export function orderQuantity(order, { excludeCustom = false } = {}) {
  if (!order?.items || !Array.isArray(order.items)) return 0;
  return order.items.reduce((acc, it) => {
    if (excludeCustom && it?.isCustom) return acc;
    const q = Number(it?.quantity);
    return acc + (Number.isFinite(q) ? q : 0);
  }, 0);
}

// 거래처별 그룹핑 (key = customerName 소문자, 빈 이름은 '__unknown')
export function groupByCustomer(orders) {
  const map = new Map();
  if (!Array.isArray(orders)) return map;
  for (const o of orders) {
    const name = (o?.customerName || '').trim();
    const key = name.toLowerCase() || '__unknown';
    if (!map.has(key)) {
      map.set(key, { name: name || '(이름없음)', orders: [], _key: key });
    }
    map.get(key).orders.push(o);
  }
  return map;
}

// 제품별 그룹핑 — items 펼쳐서 productId로 묶음
// 반환: Map<productId, { productId, name, lines: [{order, item}], qty, revenue }>
export function groupByProduct(orders, { excludeCustom = true } = {}) {
  const map = new Map();
  if (!Array.isArray(orders)) return map;
  for (const o of orders) {
    if (!o?.items || !Array.isArray(o.items)) continue;
    for (const item of o.items) {
      if (excludeCustom && item?.isCustom) continue;
      const pid = item?.id ?? `__no_id_${item?.name || 'unknown'}`;
      if (!map.has(pid)) {
        map.set(pid, {
          productId: pid,
          name: item?.name || '(이름없음)',
          lines: [],
          qty: 0,
          revenue: 0,
        });
      }
      const slot = map.get(pid);
      slot.lines.push({ order: o, item });
      const q = Number(item?.quantity) || 0;
      const p = Number(item?.price) || 0;
      slot.qty += q;
      slot.revenue += q * p;
    }
  }
  return map;
}

// 카테고리별 그룹핑 (productId → products 마스터에서 카테고리 lookup)
export function groupByCategory(orders, products, { excludeCustom = true } = {}) {
  const productMap = new Map((products || []).map((p) => [p.id, p]));
  const map = new Map();
  if (!Array.isArray(orders)) return map;
  for (const o of orders) {
    if (!o?.items || !Array.isArray(o.items)) continue;
    for (const item of o.items) {
      if (excludeCustom && item?.isCustom) continue;
      const product = productMap.get(item?.id);
      const cat = (product?.category || '미분류').trim() || '미분류';
      if (!map.has(cat)) {
        map.set(cat, { category: cat, qty: 0, revenue: 0, productIds: new Set() });
      }
      const slot = map.get(cat);
      const q = Number(item?.quantity) || 0;
      const p = Number(item?.price) || 0;
      slot.qty += q;
      slot.revenue += q * p;
      if (item?.id != null) slot.productIds.add(item.id);
    }
  }
  return map;
}

// 월별 시계열 생성 — 입력 기준일에서 과거 N개월
// 반환: [{ month: 'YYYY-MM', orders: [...], revenue, count }]
export function monthlyTrend(orders, months = 6, today = getTodayKST()) {
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = offsetMonthKST(today, -i);
    const month = monthStart.slice(0, 7); // 'YYYY-MM'
    buckets.push({ month, orders: [], revenue: 0, count: 0 });
  }
  if (!Array.isArray(orders) || orders.length === 0) return buckets;
  const indexByMonth = new Map(buckets.map((b, i) => [b.month, i]));
  for (const o of orders) {
    if (!o?.createdAt) continue;
    const d = toDateKST(o.createdAt);
    if (!d) continue;
    const month = d.slice(0, 7);
    const idx = indexByMonth.get(month);
    if (idx == null) continue;
    buckets[idx].orders.push(o);
    buckets[idx].revenue += orderRevenue(o);
    buckets[idx].count += 1;
  }
  return buckets;
}

// 일자별 시계열 (최근 N일)
export function dailyTrend(orders, days = 30, today = getTodayKST()) {
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = offsetDateKST(today, -i);
    buckets.push({ date, orders: [], revenue: 0, count: 0 });
  }
  if (!Array.isArray(orders) || orders.length === 0) return buckets;
  const indexByDate = new Map(buckets.map((b, i) => [b.date, i]));
  for (const o of orders) {
    if (!o?.createdAt) continue;
    const d = toDateKST(o.createdAt);
    const idx = indexByDate.get(d);
    if (idx == null) continue;
    buckets[idx].orders.push(o);
    buckets[idx].revenue += orderRevenue(o);
    buckets[idx].count += 1;
  }
  return buckets;
}

// 평균 주문가 (AOV) = 총매출 / 주문수
export function averageOrderValue(orders) {
  if (!Array.isArray(orders) || orders.length === 0) return 0;
  const rev = sumRevenue(orders);
  return Math.round(rev / orders.length);
}

// 변화율 계산 (current vs prev). prev=0이면 null 반환
export function percentChange(current, prev) {
  const c = Number(current) || 0;
  const p = Number(prev) || 0;
  if (p === 0) return null;
  return Math.round(((c - p) / p) * 100);
}

// 변화율 라벨 (UI 표시용, '↑35%' / '↓12%' / '→')
export function formatChangeLabel(pct) {
  if (pct == null) return '→';
  if (pct > 0) return `↑${pct}%`;
  if (pct < 0) return `↓${Math.abs(pct)}%`;
  return '→';
}

// 이전 기간 동일 길이 산출 (현재 기간 비교용)
// 예: period='1M' → 1개월 전 시작 ~ 1개월 전 끝
export function previousPeriodRange(period = '1M', today = getTodayKST()) {
  if (period === 'ALL') return null;
  const { start, end } = periodToRange(period, today);
  // 길이만큼 한 번 더 과거로 이동
  const diffDays = Math.round((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24));
  const prevEnd = offsetDateKST(start, -1);
  const prevStart = offsetDateKST(prevEnd, -diffDays);
  return { start: prevStart, end: prevEnd };
}

// 마지막 주문일로부터 경과일 (Recency)
export function daysSinceLastOrder(customerOrders, today = getTodayKST()) {
  if (!Array.isArray(customerOrders) || customerOrders.length === 0) return null;
  let latest = '';
  for (const o of customerOrders) {
    const d = toDateKST(o?.createdAt);
    if (d && d > latest) latest = d;
  }
  if (!latest) return null;
  const diff = Math.round((new Date(today) - new Date(latest)) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}
