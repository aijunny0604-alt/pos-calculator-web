// 반품 분석 도구
// orders.returns: [{ return_id, items: [...], total_returned, returned_at, reason }]
// 또는 customer_returns 테이블

import { filterByPeriod, sumRevenue } from './aggregations';
import { toDateKST, getTodayKST } from '../utils';

// 반품 통계 (기간 내)
// params: { period }
export function getReturnAnalysis(orders = [], customerReturns = [], { period = '3M' } = {}) {
  const periodOrders = filterByPeriod(orders, period);
  // 기간 내 반품된 주문
  let totalReturnedAmount = 0;
  let returnedOrderCount = 0;
  let totalRevenue = sumRevenue(periodOrders);
  const productReturnMap = new Map();
  const customerReturnMap = new Map();
  for (const o of periodOrders) {
    const returned = Number(o?.totalReturned) || 0;
    if (returned > 0) {
      returnedOrderCount++;
      totalReturnedAmount += returned;
    }
    // returns 배열 분석
    if (Array.isArray(o?.returns) && o.returns.length > 0) {
      const cname = (o?.customerName || '').trim();
      for (const r of o.returns) {
        // 거래처별
        if (cname && !customerReturnMap.has(cname)) {
          customerReturnMap.set(cname, { name: cname, returnCount: 0, amount: 0 });
        }
        if (cname) {
          const slot = customerReturnMap.get(cname);
          slot.returnCount++;
          slot.amount += Number(r?.total_returned) || 0;
        }
        // 제품별
        if (Array.isArray(r?.items)) {
          for (const item of r.items) {
            const pid = item?.id ?? `__no_id_${item?.name}`;
            if (!productReturnMap.has(pid)) {
              productReturnMap.set(pid, { productId: pid, name: item?.name || '(이름없음)', qty: 0, amount: 0 });
            }
            const slot = productReturnMap.get(pid);
            slot.qty += Number(item?.quantity) || 0;
            slot.amount += (Number(item?.price) || 0) * (Number(item?.quantity) || 0);
          }
        }
      }
    }
  }
  const topReturnedProducts = Array.from(productReturnMap.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
  const topReturnedCustomers = Array.from(customerReturnMap.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
  return {
    period,
    totalRevenue,
    totalReturnedAmount,
    returnedOrderCount,
    returnRate: totalRevenue > 0 ? Math.round((totalReturnedAmount / totalRevenue) * 1000) / 10 : 0,
    topReturnedProducts,
    topReturnedCustomers,
  };
}
