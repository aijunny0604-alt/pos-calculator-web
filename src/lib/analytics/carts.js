// 저장된 장바구니 (saved_carts) 분석
// 출고예정일, 우선순위, 대기 상태 기반

import { toDateKST, getTodayKST } from '../utils';

const STATUS_LABELS = {
  draft: '초안',
  ready: '준비됨',
  pending: '대기 중',
  in_progress: '진행 중',
  done: '완료',
  hold: '보류',
};

// 저장 카트 현황 (대기 주문 분석)
// params: { onlyUpcoming: true (오늘 이후 출고예정만), limit }
export function getPendingCarts(savedCarts = [], { onlyUpcoming = false, limit = 50 } = {}) {
  if (!Array.isArray(savedCarts) || savedCarts.length === 0) {
    return { total: 0, results: [], message: '저장된 장바구니가 없습니다.' };
  }
  const today = getTodayKST();
  const rows = [];
  let totalAmount = 0;
  let upcomingCount = 0;
  let overdueCount = 0;

  for (const c of savedCarts) {
    const deliveryDate = c?.delivery_date || null;
    const status = c?.status || 'draft';
    const priority = c?.priority || 'normal';
    const items = Array.isArray(c?.items) ? c.items : [];
    const amount = items.reduce((acc, it) => acc + (Number(it?.price) || 0) * (Number(it?.quantity) || 1), 0);
    totalAmount += amount;
    let overdue = false;
    let upcoming = false;
    if (deliveryDate) {
      if (deliveryDate < today) overdue = true;
      else if (deliveryDate >= today) upcoming = true;
    }
    if (onlyUpcoming && !upcoming) continue;
    if (overdue) overdueCount++;
    if (upcoming) upcomingCount++;
    rows.push({
      id: c.id,
      cartName: c?.cart_name || c?.customer_name || '(이름없음)',
      customerName: c?.customer_name || '',
      status,
      statusLabel: STATUS_LABELS[status] || status,
      priority,
      deliveryDate,
      itemCount: items.length,
      amount,
      overdue,
      upcoming,
      createdAt: toDateKST(c?.created_at),
    });
  }
  // 정렬: overdue 먼저, 그 다음 deliveryDate 가까운 순
  rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.deliveryDate && b.deliveryDate) return a.deliveryDate.localeCompare(b.deliveryDate);
    if (a.deliveryDate) return -1;
    if (b.deliveryDate) return 1;
    return 0;
  });
  return {
    total: rows.length,
    totalAmount,
    upcomingCount,
    overdueCount,
    results: rows.slice(0, limit),
  };
}
