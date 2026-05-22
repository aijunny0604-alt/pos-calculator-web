// 자율 이상 탐지 — 사용자가 묻지 않아도 시스템이 자동으로 패턴/이상 감지
// 매장 데이터에서 "주목해야 할 이상 신호" 발견 시 알림 메시지 자동 생성

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 매장 데이터에서 이상 신호 자동 탐지
 * @param {object} context — { products, customers, orders, paymentRecords, customerReturns }
 * @returns {Array<{level: 'critical'|'warning'|'info', icon: string, title: string, detail: string, suggestion?: string}>}
 */
export function detectAnomalies(context = {}) {
  const { products = [], customers = [], orders = [], paymentRecords = [], customerReturns = [] } = context;
  const anomalies = [];
  const now = Date.now();

  // ─── 1. 매출 급감 (최근 7일 vs 이전 7일) ───
  const recent7 = orders.filter((o) => {
    const t = o?.orderDate ? new Date(o.orderDate).getTime() : 0;
    return t >= now - 7 * DAY_MS;
  });
  const prev7 = orders.filter((o) => {
    const t = o?.orderDate ? new Date(o.orderDate).getTime() : 0;
    return t >= now - 14 * DAY_MS && t < now - 7 * DAY_MS;
  });
  const r7 = recent7.reduce((s, o) => s + Number(o.total || 0), 0);
  const p7 = prev7.reduce((s, o) => s + Number(o.total || 0), 0);
  if (p7 > 100000 && r7 < p7 * 0.6) {
    const drop = Math.round((1 - r7 / p7) * 100);
    anomalies.push({
      level: 'warning',
      icon: '📉',
      title: '매출 급감 감지',
      detail: `최근 7일 매출 ${Math.round(r7 / 10000).toLocaleString()}만원 — 이전 7일 대비 ${drop}% ↓ (이전 ${Math.round(p7 / 10000).toLocaleString()}만원)`,
      suggestion: '휴면 거래처 컴백 프로모션 또는 신제품 안내 검토',
    });
  } else if (p7 > 100000 && r7 > p7 * 1.5) {
    const grow = Math.round((r7 / p7 - 1) * 100);
    anomalies.push({
      level: 'info',
      icon: '📈',
      title: '매출 급증',
      detail: `최근 7일 매출 ${Math.round(r7 / 10000).toLocaleString()}만원 — 이전 7일 대비 ${grow}% ↑`,
      suggestion: '인기 제품 재고 보강 + 동일 카테고리 추가 입고 고려',
    });
  }

  // ─── 2. 미수금 임계 초과 ───
  const totalOverdue = paymentRecords.reduce((s, r) => s + Math.max(0, Number(r?.balance || 0)), 0);
  if (totalOverdue >= 5000000) {
    anomalies.push({
      level: 'critical',
      icon: '💸',
      title: '미수금 임계 초과',
      detail: `총 미수금 ${Math.round(totalOverdue / 10000).toLocaleString()}만원 (500만원 이상)`,
      suggestion: '미수 TOP 거래처 회수 우선순위 작성 + 60일 이상 지연 분 즉시 연락',
    });
  } else if (totalOverdue >= 2000000) {
    anomalies.push({
      level: 'warning',
      icon: '💸',
      title: '미수금 누적 중',
      detail: `총 미수금 ${Math.round(totalOverdue / 10000).toLocaleString()}만원`,
      suggestion: '주요 미수 거래처 입금 일정 확인',
    });
  }

  // ─── 3. 품절 인기 제품 (재고 0 + 최근 판매 있음) ───
  const popularOutOfStock = products.filter((p) => {
    if (Number(p?.stock || 0) > 0) return false;
    const recentSold = orders
      .filter((o) => {
        const t = o?.orderDate ? new Date(o.orderDate).getTime() : 0;
        return t >= now - 30 * DAY_MS;
      })
      .some((o) => (o?.items || []).some((it) => it?.name === p?.name && Number(it?.quantity || 0) > 0));
    return recentSold;
  });
  if (popularOutOfStock.length > 0) {
    anomalies.push({
      level: popularOutOfStock.length >= 5 ? 'critical' : 'warning',
      icon: '📦',
      title: `품절 인기 제품 ${popularOutOfStock.length}건`,
      detail: `최근 30일 판매된 적 있는 품절 제품: ${popularOutOfStock.slice(0, 3).map((p) => p.name).join(', ')}${popularOutOfStock.length > 3 ? ` 외 ${popularOutOfStock.length - 3}건` : ''}`,
      suggestion: '즉시 발주 검토 — 기회 손실 발생 중',
    });
  }

  // ─── 4. 휴면 위험 거래처 (이전 정기 구매처가 최근 N일 무주문) ───
  const customerActivity = {};
  orders.forEach((o) => {
    const k = o?.customerName || o?.customerId;
    if (!k || !o?.orderDate) return;
    const t = new Date(o.orderDate).getTime();
    if (!customerActivity[k]) customerActivity[k] = { last: t, count: 0 };
    customerActivity[k].last = Math.max(customerActivity[k].last, t);
    customerActivity[k].count += 1;
  });
  const dormantRisk = Object.entries(customerActivity)
    .filter(([, info]) => info.count >= 3 && (now - info.last) > 45 * DAY_MS && (now - info.last) < 90 * DAY_MS)
    .map(([k, info]) => ({ name: k, daysSince: Math.floor((now - info.last) / DAY_MS), orderCount: info.count }));
  if (dormantRisk.length > 0) {
    anomalies.push({
      level: 'warning',
      icon: '⚠️',
      title: `휴면 위험 거래처 ${dormantRisk.length}곳`,
      detail: `45~90일 무주문이지만 과거 정기 구매: ${dormantRisk.slice(0, 3).map((c) => `${c.name}(${c.daysSince}일)`).join(', ')}${dormantRisk.length > 3 ? ` 외 ${dormantRisk.length - 3}곳` : ''}`,
      suggestion: '컴백 프로모션 또는 안부 연락 권장',
    });
  }

  // ─── 5. 반품률 급증 (최근 30일 반품/주문 비율) ───
  const recentOrders = orders.filter((o) => {
    const t = o?.orderDate ? new Date(o.orderDate).getTime() : 0;
    return t >= now - 30 * DAY_MS;
  });
  const recentReturns = customerReturns.filter((r) => {
    const d = r?.returnDate || r?.created_at;
    const t = d ? new Date(d).getTime() : 0;
    return t >= now - 30 * DAY_MS;
  });
  if (recentOrders.length >= 30 && recentReturns.length / recentOrders.length > 0.15) {
    const rate = Math.round((recentReturns.length / recentOrders.length) * 100);
    anomalies.push({
      level: 'warning',
      icon: '↩️',
      title: `반품률 ${rate}%`,
      detail: `최근 30일 주문 ${recentOrders.length}건 · 반품 ${recentReturns.length}건 (반품률 ${rate}%, 임계 15% 초과)`,
      suggestion: '반품 사유 패턴 분석 + 자주 반품되는 제품 품질 점검',
    });
  }

  // ─── 6. 재고 가치 변동 — 입고 대량 감지 ───
  const outgoingHeavy = customers.length > 0 && recentOrders.length > 0 && (() => {
    const totalQty = recentOrders.reduce((s, o) => s + (o?.items || []).reduce((q, it) => q + Number(it?.quantity || 0), 0), 0);
    return totalQty > customers.length * 5;
  })();
  if (outgoingHeavy) {
    anomalies.push({
      level: 'info',
      icon: '🚚',
      title: '대량 출고 진행 중',
      detail: '최근 30일 출고량이 평소 대비 높음',
      suggestion: '주요 인기 제품 재주문 추천 리스트 확인',
    });
  }

  return anomalies;
}

/**
 * 이상 탐지 결과를 시스템 메시지 markdown으로 포맷
 */
export function formatAnomalies(anomalies = []) {
  if (anomalies.length === 0) return null;
  // 심각도 순 정렬
  const order = { critical: 0, warning: 1, info: 2 };
  const sorted = [...anomalies].sort((a, b) => order[a.level] - order[b.level]);
  let md = `🤖 **MOVIS 자율 분석** — ${sorted.length}건 주목 신호\n\n`;
  sorted.forEach((a) => {
    const badge = a.level === 'critical' ? '🔴 긴급' : a.level === 'warning' ? '🟡 주의' : '🔵 정보';
    md += `### ${a.icon} ${a.title} · ${badge}\n`;
    md += `- ${a.detail}\n`;
    if (a.suggestion) md += `- 💡 ${a.suggestion}\n`;
    md += '\n';
  });
  return md.trim();
}
