// 시뮬레이션 + 변수 분석 — "If-Then" 시나리오 + 통계 변동성
// - simulatePriceChange: 가격 변동 시 매출/마진 시뮬레이션
// - simulateRestock: 발주 시나리오 (며칠치 재고 / 비용 / 회전 예상)
// - getRevenueVolatility: 매출 변동성 + 트렌드 + 이상치 자동 탐지
// - getCustomerLifetimeValue: 거래처 LTV 추정

const DAY_MS = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────
// 1. 가격 변동 시뮬레이션
// "X 제품 가격 10% 올리면 매출/마진/판매량 어떻게 될까?"
// 가격 탄력성 추정 (과거 가격 변동 vs 판매량 변화) 또는 기본 탄력성 -1.0 사용
// ─────────────────────────────────────────────────
export function simulatePriceChange(productName, orders = [], products = [], opts = {}) {
  if (!productName) return { error: 'productName 필요' };
  const changePct = Number(opts?.changePct || 10); // +10% 기본
  const elasticity = Number(opts?.elasticity || -1.0); // 가격 1% ↑ → 판매량 1% ↓ (기본)
  const periodDays = Number(opts?.periodDays || 30);
  const now = Date.now();
  const cutoff = now - periodDays * DAY_MS;

  const product = products.find((p) => p?.name === productName);
  if (!product) return { error: `제품 "${productName}" 없음` };

  const wholesale = Number(product.wholesale || 0);
  const currentPrice = Number(product.retail || 0);

  // 최근 N일 판매 통계
  let qty = 0, revenue = 0, lineCount = 0;
  orders.forEach((o) => {
    if (!o?.orderDate || new Date(o.orderDate).getTime() < cutoff) return;
    (o.items || []).forEach((it) => {
      if ((it?.name || it?.productName) !== productName) return;
      qty += Number(it?.quantity || 0);
      revenue += Number(it?.unitPrice || it?.price || currentPrice) * Number(it?.quantity || 0);
      lineCount += 1;
    });
  });

  if (qty === 0) return { error: '최근 판매 이력 없음 → 시뮬레이션 불가' };

  const avgPrice = revenue / qty;
  const currentMargin = (avgPrice - wholesale) * qty;
  const currentMarginRate = avgPrice > 0 ? (avgPrice - wholesale) / avgPrice : 0;

  // 시뮬레이션
  const newPrice = avgPrice * (1 + changePct / 100);
  const qtyChangePct = elasticity * changePct;
  const newQty = qty * (1 + qtyChangePct / 100);
  const newRevenue = newPrice * newQty;
  const newMargin = (newPrice - wholesale) * newQty;
  const newMarginRate = newPrice > 0 ? (newPrice - wholesale) / newPrice : 0;

  const revenueDelta = newRevenue - revenue;
  const marginDelta = newMargin - currentMargin;
  const verdict = marginDelta > currentMargin * 0.05 ? '✅ 추천' : marginDelta > 0 ? '⚠️ 미세 개선' : '❌ 비추천';

  return {
    productName, periodDays, changePct, elasticity,
    current: {
      avgPrice: Math.round(avgPrice),
      qty,
      revenue: Math.round(revenue),
      margin: Math.round(currentMargin),
      marginRate: Math.round(currentMarginRate * 1000) / 10,
    },
    simulated: {
      newPrice: Math.round(newPrice),
      newQty: Math.round(newQty * 10) / 10,
      newRevenue: Math.round(newRevenue),
      newMargin: Math.round(newMargin),
      newMarginRate: Math.round(newMarginRate * 1000) / 10,
    },
    delta: {
      revenueDelta: Math.round(revenueDelta),
      marginDelta: Math.round(marginDelta),
      qtyDeltaPct: qtyChangePct,
    },
    verdict,
    note: `탄력성 ${elasticity} 기준. 실제 시장 반응은 달라질 수 있음.`,
  };
}

// ─────────────────────────────────────────────────
// 2. 발주 시뮬레이션
// "X 제품 N개 발주하면 며칠치 재고? 비용? 예상 매출?"
// ─────────────────────────────────────────────────
export function simulateRestock(productName, restockQty, orders = [], products = [], opts = {}) {
  if (!productName || !restockQty) return { error: 'productName, restockQty 필요' };
  const periodDays = Number(opts?.periodDays || 30);
  const now = Date.now();
  const cutoff = now - periodDays * DAY_MS;

  const product = products.find((p) => p?.name === productName);
  if (!product) return { error: `제품 "${productName}" 없음` };

  const wholesale = Number(product.wholesale || 0);
  const retail = Number(product.retail || 0);
  const currentStock = Number(product.stock || 0);

  // 최근 판매량
  let qty = 0;
  orders.forEach((o) => {
    if (!o?.orderDate || new Date(o.orderDate).getTime() < cutoff) return;
    (o.items || []).forEach((it) => {
      if ((it?.name || it?.productName) !== productName) return;
      qty += Number(it?.quantity || 0);
    });
  });
  const avgDailyQty = qty / periodDays;

  const totalStockAfter = currentStock + restockQty;
  const daysOfStock = avgDailyQty > 0 ? Math.floor(totalStockAfter / avgDailyQty) : null;
  const restockCost = wholesale * restockQty;
  const expectedRevenue = retail * restockQty;
  const expectedMargin = (retail - wholesale) * restockQty;
  const expectedROI = restockCost > 0 ? (expectedMargin / restockCost) * 100 : 0;
  const runoutDate = daysOfStock != null ? new Date(now + daysOfStock * DAY_MS).toISOString().slice(0, 10) : null;

  let verdict;
  if (avgDailyQty === 0) verdict = '⚠️ 최근 판매 없음 — 발주 신중';
  else if (daysOfStock > 180) verdict = '⚠️ 6개월 이상치 — 과잉 발주 가능';
  else if (daysOfStock < 14) verdict = '⚠️ 2주 미만 — 곧 또 발주 필요';
  else verdict = '✅ 적정 발주량';

  return {
    productName, restockQty, periodDays,
    current: { stock: currentStock, wholesale, retail, avgDailyQty: Math.round(avgDailyQty * 10) / 10 },
    afterRestock: {
      totalStock: totalStockAfter,
      daysOfStock,
      runoutDate,
      restockCost,
      expectedRevenue,
      expectedMargin,
      expectedROI: Math.round(expectedROI * 10) / 10,
    },
    verdict,
  };
}

// ─────────────────────────────────────────────────
// 3. 매출 변동성 + 트렌드 + 이상치
// 일별/주별 매출의 평균/표준편차/이상치 탐지
// ─────────────────────────────────────────────────
export function getRevenueVolatility(orders = [], opts = {}) {
  const periodDays = Number(opts?.periodDays || 30);
  const now = Date.now();
  const cutoff = now - periodDays * DAY_MS;

  // 일별 매출
  const dailyRevenue = {};
  for (let i = 0; i < periodDays; i++) {
    const d = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
    dailyRevenue[d] = 0;
  }
  orders.forEach((o) => {
    if (!o?.orderDate) return;
    const t = new Date(o.orderDate).getTime();
    if (t < cutoff) return;
    const d = new Date(o.orderDate).toISOString().slice(0, 10);
    if (dailyRevenue[d] !== undefined) {
      dailyRevenue[d] += Number(o.total || 0);
    }
  });

  const values = Object.values(dailyRevenue);
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const cv = mean > 0 ? stddev / mean : 0; // 변동계수

  // 이상치 (mean ± 2σ)
  const outliers = Object.entries(dailyRevenue)
    .filter(([, v]) => Math.abs(v - mean) > 2 * stddev)
    .map(([date, value]) => ({
      date,
      revenue: Math.round(value),
      type: value > mean ? '급증' : '급감',
      zScore: stddev > 0 ? Math.round(((value - mean) / stddev) * 10) / 10 : 0,
    }));

  // 트렌드 (단순 선형 회귀 slope)
  const sortedDates = Object.keys(dailyRevenue).sort();
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  sortedDates.forEach((d, i) => {
    sumX += i;
    sumY += dailyRevenue[d];
    sumXY += i * dailyRevenue[d];
    sumXX += i * i;
  });
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) || 0;
  const trend = slope > mean * 0.02 ? '↑ 상승' : slope < -mean * 0.02 ? '↓ 하락' : '→ 안정';

  return {
    periodDays,
    mean: Math.round(mean),
    stddev: Math.round(stddev),
    cv: Math.round(cv * 1000) / 10, // %
    trend,
    trendSlope: Math.round(slope),
    outliers,
    dailyRevenue: sortedDates.map((d) => ({ date: d, revenue: Math.round(dailyRevenue[d]) })),
    insight: cv > 0.5
      ? '매출 변동성이 높습니다 — 일별 차이가 큼'
      : cv > 0.3
        ? '매출이 다소 들쭉날쭉합니다'
        : '매출이 안정적입니다',
  };
}

// ─────────────────────────────────────────────────
// 4. 거래처 LTV (Lifetime Value)
// 거래처별 누적 매출 + 평균 주문가 + 거래 기간 + 예상 미래 가치
// ─────────────────────────────────────────────────
export function getCustomerLifetimeValue(orders = [], opts = {}) {
  const limit = Number(opts?.limit || 20);
  const now = Date.now();

  const stat = {};
  orders.forEach((o) => {
    const k = o?.customerName;
    if (!k || !o?.orderDate) return;
    const t = new Date(o.orderDate).getTime();
    if (!stat[k]) stat[k] = { revenue: 0, count: 0, firstT: t, lastT: t };
    stat[k].revenue += Number(o.total || 0);
    stat[k].count += 1;
    if (t < stat[k].firstT) stat[k].firstT = t;
    if (t > stat[k].lastT) stat[k].lastT = t;
  });

  const items = Object.entries(stat).map(([name, s]) => {
    const tenureDays = Math.max(1, (s.lastT - s.firstT) / DAY_MS);
    const tenureMonths = tenureDays / 30;
    const avgOrderValue = s.revenue / s.count;
    const orderFrequencyMonthly = s.count / Math.max(1, tenureMonths);
    const daysSinceLast = (now - s.lastT) / DAY_MS;
    // 단순 LTV = 평균 주문가 × 월 빈도 × 예상 잔여 개월 (12개월)
    const projectedLTV = daysSinceLast < 60 ? avgOrderValue * orderFrequencyMonthly * 12 : 0;
    return {
      name,
      historicalRevenue: Math.round(s.revenue),
      orderCount: s.count,
      avgOrderValue: Math.round(avgOrderValue),
      tenureMonths: Math.round(tenureMonths * 10) / 10,
      orderFrequencyMonthly: Math.round(orderFrequencyMonthly * 10) / 10,
      daysSinceLast: Math.round(daysSinceLast),
      projectedLTV: Math.round(projectedLTV),
      status: daysSinceLast < 30 ? '활성' : daysSinceLast < 60 ? '주의' : daysSinceLast < 90 ? '휴면 위험' : '휴면',
    };
  });

  items.sort((a, b) => (b.historicalRevenue + b.projectedLTV) - (a.historicalRevenue + a.projectedLTV));
  return {
    results: items.slice(0, limit).map((c, i) => ({ ...c, rank: i + 1 })),
    totalCustomers: items.length,
    totalHistoricalRevenue: items.reduce((s, c) => s + c.historicalRevenue, 0),
    totalProjectedLTV: items.reduce((s, c) => s + c.projectedLTV, 0),
  };
}
