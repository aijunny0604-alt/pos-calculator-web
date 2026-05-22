// 시뮬레이션 + 변수 분석 — "If-Then" 시나리오 + 통계 변동성
// - simulatePriceChange: 가격 변동 시 매출/마진 (estimateElasticity 기반)
// - simulateRestock: 발주 시나리오 (Codex 조정 임계값: 120일/30일)
// - getRevenueVolatility: 매출 변동성 + 트렌드 + 이상치 + 요일별 + 전주 대비
// - getCustomerLifetimeValue: 거래처 LTV 추정

const DAY_MS = 24 * 60 * 60 * 1000;

// 🎯 가격 탄력성 추정 (과거 가격 변동 vs 판매량 변화) — Codex 제안
export function estimateElasticity(productName, orders = []) {
  if (!productName) return { elasticity: -1.0, confidence: 'low', reason: 'productName 누락' };
  // 주별 평균 가격 + 판매량 수집
  const weekly = new Map();
  orders.forEach((o) => {
    if (!o?.orderDate) return;
    (o.items || []).forEach((it) => {
      if ((it?.name || it?.productName) !== productName) return;
      const d = new Date(o.orderDate);
      const wk = `${d.getFullYear()}-W${String(Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay()) / 7)).padStart(2, '0')}-${d.getMonth()}`;
      const row = weekly.get(wk) || { qty: 0, rev: 0 };
      const q = Number(it.quantity || 0);
      const p = Number(it.unitPrice || it.price || 0);
      row.qty += q;
      row.rev += p * q;
      weekly.set(wk, row);
    });
  });
  const pts = [...weekly.values()].filter((r) => r.qty > 0 && r.rev > 0).map((r) => ({ p: r.rev / r.qty, q: r.qty }));
  if (pts.length < 4) return { elasticity: -1.0, confidence: 'low', reason: '데이터 부족 (주별 4건 미만)', samples: pts.length };
  // 인접 주별 log 차이 → 평균 탄력성
  const pairs = [];
  for (let i = 1; i < pts.length; i++) {
    const dp = Math.log(pts[i].p / pts[i - 1].p);
    const dq = Math.log(pts[i].q / pts[i - 1].q);
    if (Math.abs(dp) >= 0.03) pairs.push({ dp, dq, ratio: dq / dp });
  }
  if (pairs.length < 3) return { elasticity: -1.0, confidence: 'low', reason: '가격 변동 관측치 부족', samples: pairs.length };
  const e = pairs.reduce((s, x) => s + x.ratio, 0) / pairs.length;
  const clamped = Math.max(-5, Math.min(1, e));
  return {
    elasticity: Math.round(clamped * 100) / 100,
    confidence: pairs.length >= 8 ? 'high' : pairs.length >= 5 ? 'med' : 'low',
    samples: pairs.length,
    reason: '과거 가격 변동 vs 판매량 변화 관측치 기반',
  };
}

// ─────────────────────────────────────────────────
// 1. 가격 변동 시뮬레이션
// "X 제품 가격 10% 올리면 매출/마진/판매량 어떻게 될까?"
// 가격 탄력성 추정 (과거 가격 변동 vs 판매량 변화) 또는 기본 탄력성 -1.0 사용
// ─────────────────────────────────────────────────
export function simulatePriceChange(productName, orders = [], products = [], opts = {}) {
  if (!productName) return { error: 'productName 필요' };
  const changePct = Number(opts?.changePct || 10); // +10% 기본
  // 🎯 사용자가 elasticity 명시 안 하면 자동 추정 (Codex 제안)
  const estimated = (opts?.elasticity == null) ? estimateElasticity(productName, orders) : null;
  const elasticity = Number(opts?.elasticity ?? estimated?.elasticity ?? -1.0);
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
    note: `탄력성 ${elasticity} 기준 (${estimated ? `자동 추정 · 신뢰도 ${estimated.confidence} · 샘플 ${estimated.samples}` : '수동 지정'}). 실제 시장 반응은 달라질 수 있음.`,
    elasticityMeta: estimated || null,
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

  // Codex 조정 임계값: 자동차 부품 매장 도메인 (연 3-5회전, 리드타임+안전재고 고려)
  let verdict;
  if (avgDailyQty === 0) verdict = '⚠️ 최근 판매 없음 — 발주 신중';
  else if (daysOfStock > 180) verdict = '🔴 6개월 이상치 — 과잉 발주 (현금 묶임)';
  else if (daysOfStock > 120) verdict = '🟡 4개월 이상치 — 주의 (특수품 외 권장 ↓)';
  else if (daysOfStock < 21) verdict = '🟠 3주 미만 — 곧 또 발주 (리드타임 고려 시 부족)';
  else if (daysOfStock < 30) verdict = '⚠️ 한 달 미만 — 안전 재고 부족 가능';
  else verdict = '✅ 적정 발주량 (3-4개월치, 정상 회전)';

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

  // 🎯 요일별 패턴 (Codex 제안) — 평일 vs 주말 분리
  const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
  const byDow = {};
  Object.entries(dailyRevenue).forEach(([d, v]) => {
    const dow = new Date(d).getDay();
    if (!byDow[dow]) byDow[dow] = [];
    byDow[dow].push(v);
  });
  const dayPattern = Object.entries(byDow).map(([dow, vs]) => {
    const m = vs.reduce((s, x) => s + x, 0) / vs.length;
    return { day: DAY_NAMES[Number(dow)], avg: Math.round(m), samples: vs.length };
  });

  // 🎯 전주 vs 이전 주 변화율 (Codex 제안 — 직관적 비교)
  const last7Days = sortedDates.slice(-7);
  const prev7Days = sortedDates.slice(-14, -7);
  const last7Total = last7Days.reduce((s, d) => s + dailyRevenue[d], 0);
  const prev7Total = prev7Days.reduce((s, d) => s + dailyRevenue[d], 0);
  const last7vsPrev7Pct = prev7Total > 0 ? Math.round(((last7Total - prev7Total) / prev7Total) * 1000) / 10 : 0;

  // 🎯 중앙값 + MAD (대형 단체주문 끌림 보완)
  const sortedVals = [...values].sort((a, b) => a - b);
  const median = sortedVals[Math.floor(n / 2)];
  const mad = sortedVals.reduce((s, v) => s + Math.abs(v - median), 0) / n;

  return {
    periodDays,
    mean: Math.round(mean),
    median: Math.round(median),
    stddev: Math.round(stddev),
    mad: Math.round(mad),
    cv: Math.round(cv * 1000) / 10, // %
    trend,
    trendSlope: Math.round(slope),
    last7vsPrev7Pct,
    last7Total: Math.round(last7Total),
    prev7Total: Math.round(prev7Total),
    dayPattern,
    outliers,
    dailyRevenue: sortedDates.map((d) => ({ date: d, revenue: Math.round(dailyRevenue[d]) })),
    insight: cv > 0.5
      ? '매출 변동성이 높습니다 — 일별 차이가 큼 (median 사용 권장)'
      : cv > 0.3
        ? '매출이 다소 들쭉날쭉합니다 — 요일별 패턴 확인'
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
