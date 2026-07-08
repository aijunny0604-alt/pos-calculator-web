// 재고 분석 도구 — 부족/품절/입고대기/재주문 추천
// products 마스터의 stock, stock_status 필드 기반

import { filterByPeriod, groupByProduct, sumRevenue } from './aggregations';
import { getTodayKST } from '../utils';

// 재고 부족 제품 (stock <= threshold)
// params: { threshold, limit, includeOutOfStock }
export function getLowStockProducts(products, orders, { threshold = 5, limit = 30, includeOutOfStock = true } = {}) {
  if (!Array.isArray(products) || products.length === 0) {
    return { threshold, total: 0, results: [], message: '제품 데이터가 없습니다.' };
  }
  // 최근 1개월 판매량으로 시급도 추가
  const recentOrders = filterByPeriod(orders, '1M');
  const salesByProduct = groupByProduct(recentOrders, { excludeCustom: true });

  const rows = [];
  for (const p of products) {
    const stock = Number(p?.stock);
    const status = p?.stock_status || 'normal';
    // out 상태 또는 stock <= threshold
    const isOut = status === 'out' || stock === 0;
    const isLow = Number.isFinite(stock) && stock > 0 && stock <= threshold;
    if (!isLow && !(includeOutOfStock && isOut)) continue;
    const sales = salesByProduct.get(p.id);
    rows.push({
      productId: p.id,
      name: p.name,
      category: p.category || '미분류',
      stock: Number.isFinite(stock) ? stock : 0,
      stockStatus: status,
      wholesale: p.wholesale || 0,
      retail: p.retail || 0,
      recentSoldQty: sales?.qty || 0,
      recentRevenue: sales?.revenue || 0,
    });
  }
  // 정렬: 최근 판매량 ↓ → 재고 ↑ (잘 팔리는데 부족한 게 먼저)
  rows.sort((a, b) => b.recentSoldQty - a.recentSoldQty || a.stock - b.stock);
  return {
    threshold,
    total: rows.length,
    results: rows.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r })),
  };
}

// 전체 재고 현황 요약
// params: { lowThreshold }
export function getStockSummary(products, { lowThreshold = 5 } = {}) {
  if (!Array.isArray(products) || products.length === 0) {
    return {
      total: 0,
      normal: 0,
      low: 0,
      out: 0,
      incoming: 0,
      totalStockUnits: 0,
      totalStockValueWholesale: 0,
      totalStockValueRetail: 0,
      byCategory: [],
      message: '제품 데이터가 없습니다.',
    };
  }
  let normal = 0, low = 0, out = 0, incoming = 0;
  let totalUnits = 0, valueW = 0, valueR = 0;
  const catMap = new Map();
  for (const p of products) {
    const stock = Number(p?.stock) || 0;
    const status = p?.stock_status || 'normal';
    const wholesale = Number(p?.wholesale) || 0;
    const retail = Number(p?.retail) || 0;
    totalUnits += stock;
    valueW += stock * wholesale;
    valueR += stock * retail;

    if (status === 'incoming') incoming++;
    else if (status === 'out' || stock === 0) out++;
    else if (stock <= lowThreshold) low++;
    else normal++;

    const cat = p.category || '미분류';
    if (!catMap.has(cat)) {
      catMap.set(cat, { category: cat, count: 0, units: 0, valueWholesale: 0 });
    }
    const slot = catMap.get(cat);
    slot.count++;
    slot.units += stock;
    slot.valueWholesale += stock * wholesale;
  }
  const byCategory = Array.from(catMap.values()).sort((a, b) => b.valueWholesale - a.valueWholesale);
  return {
    total: products.length,
    normal,
    low,
    out,
    incoming,
    lowThreshold,
    totalStockUnits: totalUnits,
    totalStockValueWholesale: Math.round(valueW),
    totalStockValueRetail: Math.round(valueR),
    byCategory,
  };
}

// 상태별 제품 조회 (incoming/out/normal)
// params: { status, limit }
export function getProductsByStockStatus(products, { status = 'incoming', limit = 50 } = {}) {
  if (!Array.isArray(products) || products.length === 0) {
    return { status, total: 0, results: [], message: '제품 데이터가 없습니다.' };
  }
  const filtered = products.filter((p) => {
    const s = p?.stock_status || 'normal';
    if (status === 'out') return s === 'out' || Number(p?.stock) === 0;
    if (status === 'incoming') return s === 'incoming';
    return s === 'normal' && Number(p?.stock) > 0;
  });
  const rows = filtered.map((p) => ({
    productId: p.id,
    name: p.name,
    category: p.category || '미분류',
    stock: Number(p?.stock) || 0,
    stockStatus: p?.stock_status || 'normal',
    wholesale: p?.wholesale || 0,
    retail: p?.retail || 0,
  }));
  rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return {
    status,
    total: rows.length,
    results: rows.slice(0, limit),
  };
}

// 재주문 추천 — 재고 부족 + 최근 판매 활발 (우선순위 점수)
// params: { stockThreshold, salesPeriod, limit }
// 점수 = (최근 판매량 / 재고+1) * 가중치 — 잘 팔리는데 재고 적은 순
// 안 나가는 재고(데드스톡) — 재고는 있는데 최근 N개월 판매가 없거나 매우 적은 제품
// params: { months(기본3), minStock(기본1), limit }
export function getDeadStock(products, orders, { months = 3, minStock = 1, limit = 20 } = {}) {
  if (!Array.isArray(products) || products.length === 0) {
    return { total: 0, results: [], message: '제품 데이터가 없습니다.' };
  }
  const period = `${Math.max(1, Math.round(months))}M`;
  const recentOrders = filterByPeriod(orders, period);
  const salesByProduct = groupByProduct(recentOrders, { excludeCustom: true });
  const rows = [];
  for (const p of products) {
    const stock = Number(p?.stock) || 0;
    if (stock < minStock) continue;               // 재고 있는 것만
    const recentQty = salesByProduct.get(p.id)?.qty || 0;
    if (recentQty > 0) continue;                  // 최근 판매 있으면 데드 아님
    const wholesale = Number(p?.wholesale) || 0;
    rows.push({
      productId: p.id,
      name: p.name,
      category: p.category || '미분류',
      stock,
      wholesale,
      tiedUpValue: stock * wholesale,             // 묶인 금액(재고×도매가)
    });
  }
  rows.sort((a, b) => b.tiedUpValue - a.tiedUpValue);
  const totalTiedUp = rows.reduce((s, r) => s + r.tiedUpValue, 0);
  return {
    total: rows.length,
    periodMonths: months,
    totalTiedUp,
    results: rows.slice(0, limit),
    message: rows.length === 0
      ? `최근 ${months}개월 안 나간 재고 없음 — 회전 양호합니다.`
      : `최근 ${months}개월 판매 0건인 재고 ${rows.length}종 (묶인 금액 약 ${totalTiedUp.toLocaleString('ko-KR')}원). 상위 제품 정리·할인·반품 검토 추천.`,
  };
}

export function getRestockRecommendations(products, orders, { stockThreshold = 5, salesPeriod = '1M', limit = 20 } = {}) {
  if (!Array.isArray(products) || products.length === 0) {
    return { total: 0, results: [], message: '제품 데이터가 없습니다.' };
  }
  const recentOrders = filterByPeriod(orders, salesPeriod);
  const salesByProduct = groupByProduct(recentOrders, { excludeCustom: true });

  const rows = [];
  for (const p of products) {
    const stock = Number(p?.stock) || 0;
    const status = p?.stock_status || 'normal';
    const sales = salesByProduct.get(p.id);
    const recentQty = sales?.qty || 0;
    const recentRev = sales?.revenue || 0;
    // 후보 기준: 재고 부족 OR 품절 OR 판매 대비 재고 적음
    const lowStock = stock <= stockThreshold || status === 'out';
    const sellingFast = recentQty > 0 && stock < recentQty * 2; // 판매량의 2배 미만 재고
    if (!lowStock && !sellingFast) continue;
    // 시급도 점수: 판매량 가중치 + 재고 부족 가중치
    const urgency = Math.round((recentQty / Math.max(1, stock)) * 100);
    // 추천 수량 (대략): 최근 판매량의 2~3배
    const suggestedRestock = Math.max(stockThreshold * 2, Math.round(recentQty * 2.5));
    rows.push({
      productId: p.id,
      name: p.name,
      category: p.category || '미분류',
      stock,
      stockStatus: status,
      recentSoldQty: recentQty,
      recentRevenue: recentRev,
      wholesale: p?.wholesale || 0,
      urgency,
      suggestedRestock,
      reason: status === 'out' ? '품절'
            : stock === 0 ? '재고 0'
            : recentQty > stock * 2 ? '판매량 대비 재고 부족'
            : stock <= stockThreshold ? '재고 임계 이하'
            : '회전율 높음',
    });
  }
  rows.sort((a, b) => b.urgency - a.urgency || b.recentSoldQty - a.recentSoldQty);
  return {
    stockThreshold,
    salesPeriod,
    total: rows.length,
    results: rows.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r })),
  };
}
