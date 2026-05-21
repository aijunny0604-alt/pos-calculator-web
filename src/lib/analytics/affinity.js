// 거래처 ↔ 제품 어피니티 분석
// 특정 거래처가 자주 사는 제품/카테고리, 업셀 기회 도출

import { groupByProduct, groupByCategory, sumRevenue } from './aggregations';

// 특정 거래처가 자주 사는 제품 + 카테고리
// params: { customerId?, customerName?, limit: 10 }
export function getCustomerProductAffinity(orders, products, customers, { customerId, customerName, limit = 10 } = {}) {
  let target = null;
  if (customerId != null) target = (customers || []).find((c) => c.id === customerId);
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
      totalOrders: 0,
      totalRevenue: 0,
      topProducts: [],
      topCategories: [],
      message: '주문 기록이 없습니다.',
    };
  }
  const productGroups = groupByProduct(customerOrders, { excludeCustom: true });
  const categoryGroups = groupByCategory(customerOrders, products, { excludeCustom: true });
  const productMap = new Map((products || []).map((p) => [p.id, p]));
  const topProducts = [];
  for (const [pid, slot] of productGroups.entries()) {
    const product = productMap.get(pid);
    topProducts.push({
      productId: pid,
      name: slot.name,
      category: product?.category || '미분류',
      qty: slot.qty,
      revenue: slot.revenue,
      orderCount: slot.lines.length,
    });
  }
  topProducts.sort((a, b) => b.revenue - a.revenue);
  const topCategories = [];
  for (const [cat, slot] of categoryGroups.entries()) {
    topCategories.push({
      category: cat,
      qty: slot.qty,
      revenue: slot.revenue,
      productCount: slot.productIds.size,
    });
  }
  topCategories.sort((a, b) => b.revenue - a.revenue);
  return {
    name: target?.name || customerName,
    customerId: target?.id ?? null,
    phone: target?.phone || '',
    totalOrders: customerOrders.length,
    totalRevenue: sumRevenue(customerOrders),
    topProducts: topProducts.slice(0, limit),
    topCategories: topCategories.slice(0, Math.min(limit, 10)),
  };
}
