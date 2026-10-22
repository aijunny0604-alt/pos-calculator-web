// 주문 채널 분류 (Codex Major D fix - Task #110)
// 옛 엠파츠 단일 거래처 + 새 분산 거래처(buyer별, category='엠파츠') 둘 다 일관되게 식별
// 모든 곳에서 동일 로직 사용 — OrderHistory, AIAnalytics, SmartStoreOrders, Dashboard

const NAVER_MEMO_RX = /\[\s*엠\s*파\s*츠\s*\]|\[\s*네\s*이\s*버/i;

const normalizeName = (value) => String(value || '').normalize('NFKC').replace(/\s/g, '').toLowerCase();

// 고객 분류는 ID 우선, 이름은 정확히 일치하는 거래처가 하나일 때만 사용한다.
export function resolveOrderCustomer(order, customers = []) {
  if (!order) return null;
  const id = order.customer_id ?? order.customerId ?? order.customer?.id;
  if (id != null) {
    return customers.find((c) => String(c.id) === String(id)) || order.customer || null;
  }
  if (order.customer) return order.customer;
  const name = normalizeName(order.customerName || order.customer_name);
  if (!name) return null;
  const matches = customers.filter((c) => normalizeName(c.name) === name);
  return matches.length === 1 ? matches[0] : null;
}

// 고객 카테고리만으로 외부 주문을 추정하지 않는다. 병합된 여러 주문도 자동 발송하지 않는다.
export function getNaverDispatchOrderId(order) {
  const ids = new Set([...String(order?.memo || '').matchAll(/\[\s*네\s*이\s*버[^\]]*\]\s*(\d+)/g)].map((m) => m[1]));
  return ids.size === 1 ? [...ids][0] : null;
}

/**
 * 주문 객체에서 채널 식별
 * @param {object} order - { memo, customerName, customer_name, customer? }
 * @returns {'naver' | 'general'}
 */
export function classifyOrderChannel(order, customers = []) {
  if (!order) return 'general';
  const memo = order.memo || '';
  if (NAVER_MEMO_RX.test(memo)) return 'naver';
  const name = (order.customerName || order.customer_name || '').trim();
  if (name === '엠파츠') return 'naver'; // 옛 단일 거래처 호환
  // 거래처 객체가 함께 오면 category로 분류
  if (resolveOrderCustomer(order, customers)?.category === '엠파츠') return 'naver';
  return 'general';
}

/**
 * 주문 배열에서 채널별 매출 집계
 * @param {object[]} orders - 주문 배열
 * @param {object[]} customers - (선택) 거래처 배열. category 매칭에 사용
 * @returns {{ naver: { count, revenue }, general: { count, revenue }, total: { count, revenue } }}
 */
export function aggregateByChannel(orders, customers = []) {
  const acc = {
    naver: { count: 0, revenue: 0 },
    general: { count: 0, revenue: 0 },
    total: { count: 0, revenue: 0 },
  };
  for (const o of orders || []) {
    const channel = classifyOrderChannel(o, customers || []);
    const amount = Number(o.totalAmount ?? o.total_amount ?? o.total ?? 0);
    acc[channel].count += 1;
    acc[channel].revenue += amount;
    acc.total.count += 1;
    acc.total.revenue += amount;
  }
  return acc;
}

/**
 * 주문 메모에서 실제 구매자 이름 추출 (네이버 주문)
 * @returns {string | null}
 */
export function extractNaverBuyer(order) {
  if (!order) return null;
  const memo = order.memo || '';
  const m = memo.match(/구매자:\s*([^/\n]+?)(?:\s*\/|\n|$)/);
  return m?.[1]?.trim() || null;
}
