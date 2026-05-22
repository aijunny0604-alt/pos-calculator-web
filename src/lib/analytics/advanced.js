// 고급 분석 도구 (Codex 제안 5종)
// - getCollectionPlan: 미수 회수 액션 플래너
// - getStockCoverageForecast: 품절 예상일 + 재고 커버리지
// - getNextBestOffers: 고객별 다음 판매 제안
// - getProductBundleSuggestions: 묶음 판매 추천
// - getMarginLeakage: 마진 누수 점검

const DAY_MS = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────
// 1. 미수 회수 액션 플래너
// 거래처별 미수금 + 경과일 + 최근 거래 관계 → 회수 우선순위 + 톤별 연락 문구
// ─────────────────────────────────────────────────
export function getCollectionPlan(paymentRecords = [], customers = [], orders = [], opts = {}) {
  const limit = Number(opts?.limit || 15);
  const now = Date.now();

  // 거래처별 미수금 집계
  const byCustomer = {};
  paymentRecords.forEach((r) => {
    const balance = Number(r?.balance || 0);
    if (balance <= 0) return;
    const cid = r?.customer_id || r?.customerId;
    const cname = r?.customer_name || r?.customerName;
    if (!cid && !cname) return;
    const key = cname || `cid:${cid}`;
    if (!byCustomer[key]) {
      byCustomer[key] = { name: cname, customerId: cid, totalBalance: 0, recordCount: 0, oldestDays: 0, recentRevenue: 0 };
    }
    byCustomer[key].totalBalance += balance;
    byCustomer[key].recordCount += 1;
    const invDate = r?.invoice_date || r?.invoiceDate || r?.created_at;
    if (invDate) {
      const days = Math.floor((now - new Date(invDate).getTime()) / DAY_MS);
      if (days > byCustomer[key].oldestDays) byCustomer[key].oldestDays = days;
    }
  });

  // 최근 30일 매출 (관계 강도 가중치)
  const recentCutoff = now - 30 * DAY_MS;
  orders.forEach((o) => {
    if (!o?.orderDate || new Date(o.orderDate).getTime() < recentCutoff) return;
    const k = o?.customerName;
    if (byCustomer[k]) byCustomer[k].recentRevenue += Number(o.total || 0);
  });

  // 우선순위 점수 = 미수금 × 0.6 + 경과일 × 10000 + 최근 매출 × 0.15
  const items = Object.values(byCustomer).map((c) => {
    const priority = c.totalBalance * 0.6 + c.oldestDays * 10000 + c.recentRevenue * 0.15;
    // 톤 결정 (경과일 + 미수금 + 최근 관계 기반)
    let tone, suggestedMessage;
    if (c.oldestDays >= 60 && c.totalBalance >= 500000) {
      tone = '단호';
      suggestedMessage = `안녕하세요, ${c.name} 사장님. ${c.oldestDays}일째 미수 ${Math.round(c.totalBalance / 10000)}만원이 남아있어 다음 주 내로 일정 잡아주시면 감사하겠습니다.`;
    } else if (c.oldestDays >= 30 || c.totalBalance >= 1000000) {
      tone = '정중';
      suggestedMessage = `${c.name} 사장님, 안녕하세요. 미수 ${Math.round(c.totalBalance / 10000)}만원 확인 부탁드립니다. 편하실 때 입금 일정 알려주시면 감사하겠습니다.`;
    } else if (c.recentRevenue > 0) {
      tone = '친근';
      suggestedMessage = `${c.name} 사장님, 안녕하세요! 최근 주문 감사드리고, 미수 ${Math.round(c.totalBalance / 10000)}만원 확인 한 번 부탁드릴게요.`;
    } else {
      tone = '안부';
      suggestedMessage = `${c.name} 사장님, 한참 못 뵈었네요. 미수 ${Math.round(c.totalBalance / 10000)}만원 정리해주실 수 있을까요?`;
    }
    return { ...c, priority, tone, suggestedMessage };
  });

  items.sort((a, b) => b.priority - a.priority);
  const top = items.slice(0, limit).map((c, i) => ({ ...c, rank: i + 1 }));
  return {
    results: top,
    totalOverdue: items.reduce((s, c) => s + c.totalBalance, 0),
    customerCount: items.length,
  };
}

// ─────────────────────────────────────────────────
// 2. 품절 예상일 + 재고 커버리지
// 평균 일일 판매량 기반으로 현재 재고가 며칠 갈지 예측
// ─────────────────────────────────────────────────
export function getStockCoverageForecast(products = [], orders = [], opts = {}) {
  const periodDays = Number(opts?.periodDays || 30);
  const maxDaysLeft = Number(opts?.maxDaysLeft || 14); // 14일 이내 품절 예상만
  const now = Date.now();
  const cutoff = now - periodDays * DAY_MS;

  // 제품별 최근 N일 판매량 합계
  const soldByProduct = {};
  orders.forEach((o) => {
    if (!o?.orderDate) return;
    const t = new Date(o.orderDate).getTime();
    if (t < cutoff) return;
    (o.items || []).forEach((it) => {
      const k = it?.name || it?.productName;
      if (!k) return;
      soldByProduct[k] = (soldByProduct[k] || 0) + Number(it?.quantity || 0);
    });
  });

  const items = products.map((p) => {
    const stock = Number(p?.stock || 0);
    const soldQty = soldByProduct[p?.name] || 0;
    const avgDailyQty = soldQty / periodDays;
    const daysLeft = avgDailyQty > 0 ? Math.floor(stock / avgDailyQty) : null;
    const expectedRunoutDate = daysLeft != null && daysLeft >= 0
      ? new Date(now + daysLeft * DAY_MS).toISOString().slice(0, 10)
      : null;
    return {
      name: p.name,
      category: p.category || '미분류',
      stock,
      soldQty,
      avgDailyQty: Math.round(avgDailyQty * 10) / 10,
      daysLeft,
      expectedRunoutDate,
      suggestedRestock: avgDailyQty > 0 ? Math.ceil(avgDailyQty * 30) : 0, // 30일치
    };
  })
  .filter((p) => p.daysLeft != null && p.daysLeft <= maxDaysLeft && p.avgDailyQty > 0);

  items.sort((a, b) => a.daysLeft - b.daysLeft);
  return {
    periodDays,
    maxDaysLeft,
    results: items.slice(0, 30).map((p, i) => ({ ...p, rank: i + 1 })),
    count: items.length,
  };
}

// ─────────────────────────────────────────────────
// 3. 고객별 다음 판매 제안 (Next Best Offer)
// 거래처의 과거 구매 + 재주문 주기 + 현재 재고 → 권할 만한 제품
// ─────────────────────────────────────────────────
export function getNextBestOffers(customerName, orders = [], products = [], opts = {}) {
  if (!customerName) return { error: 'customerName 필요' };
  const now = Date.now();
  const myOrders = orders.filter((o) => o?.customerName === customerName);
  if (myOrders.length === 0) return { customerName, results: [], message: '거래 이력 없음' };

  // 제품별 통계
  const stat = {};
  myOrders.forEach((o) => {
    const t = new Date(o.orderDate || now).getTime();
    (o.items || []).forEach((it) => {
      const k = it?.name || it?.productName;
      if (!k) return;
      if (!stat[k]) stat[k] = { qty: 0, count: 0, lastT: 0, intervals: [], prevT: 0 };
      stat[k].qty += Number(it?.quantity || 0);
      stat[k].count += 1;
      if (stat[k].prevT > 0 && t > stat[k].prevT) {
        stat[k].intervals.push((t - stat[k].prevT) / DAY_MS);
      }
      stat[k].prevT = t;
      if (t > stat[k].lastT) stat[k].lastT = t;
    });
  });

  // 점수 = 친밀도 × 2 + 재고 적합 + 재주문 시점 임박
  const productMap = {};
  products.forEach((p) => { productMap[p.name] = p; });
  const items = Object.entries(stat)
    .filter(([, s]) => s.count >= 2) // 2회 이상 산 제품만
    .map(([name, s]) => {
      const p = productMap[name];
      if (!p) return null;
      const stock = Number(p.stock || 0);
      if (stock <= 0) return null; // 재고 없으면 제안 불가
      const avgInterval = s.intervals.length > 0 ? s.intervals.reduce((a, b) => a + b, 0) / s.intervals.length : 30;
      const daysSinceLast = (now - s.lastT) / DAY_MS;
      const intervalScore = Math.max(0, 1 - Math.abs(daysSinceLast - avgInterval) / avgInterval); // 재주문 시점 임박
      const stockFit = Math.min(1, stock / 30);
      const score = s.qty * 2 + stockFit * 50 + intervalScore * 100;
      return {
        name, category: p.category || '미분류',
        stock, wholesale: Number(p.wholesale || 0), retail: Number(p.retail || 0),
        historyQty: s.qty, historyCount: s.count,
        daysSinceLastOrder: Math.round(daysSinceLast),
        avgIntervalDays: Math.round(avgInterval),
        suggestionScore: Math.round(score),
        reason: intervalScore > 0.6 ? '재주문 시점 도래' : stockFit > 0.5 ? '재고 충분' : '단골 제품',
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.suggestionScore - a.suggestionScore);
  return {
    customerName,
    results: items.slice(0, 10).map((p, i) => ({ ...p, rank: i + 1 })),
    totalRecommended: items.length,
  };
}

// ─────────────────────────────────────────────────
// 4. 묶음 판매 추천 (Bundle Suggestion)
// 동시 구매 패턴 분석 → 제품 X 구매 고객에게 같이 권할 Y, Z
// ─────────────────────────────────────────────────
export function getProductBundleSuggestions(productName, orders = [], opts = {}) {
  if (!productName) return { error: 'productName 필요' };
  const minSupport = Number(opts?.minSupport || 2);

  let baseCount = 0;
  const coOccur = {};
  orders.forEach((o) => {
    const items = (o.items || []).map((it) => it?.name || it?.productName).filter(Boolean);
    if (!items.includes(productName)) return;
    baseCount += 1;
    items.forEach((other) => {
      if (other === productName) return;
      coOccur[other] = (coOccur[other] || 0) + 1;
    });
  });

  if (baseCount === 0) return { productName, baseOrderCount: 0, results: [], message: '해당 제품 주문 이력 없음' };

  const items = Object.entries(coOccur)
    .filter(([, c]) => c >= minSupport)
    .map(([name, count]) => ({
      name,
      pairCount: count,
      confidence: Math.round((count / baseCount) * 100), // %
    }))
    .sort((a, b) => b.confidence - a.confidence);

  return {
    productName,
    baseOrderCount: baseCount,
    results: items.slice(0, 8).map((p, i) => ({ ...p, rank: i + 1 })),
  };
}

// ─────────────────────────────────────────────────
// 5. 마진 누수 점검 (Margin Leakage)
// 도매가 이하 판매 또는 마진율 너무 낮은 제품 탐지
// ─────────────────────────────────────────────────
export function getMarginLeakage(orders = [], products = [], opts = {}) {
  const period = Number(opts?.periodDays || 30);
  const minMargin = Number(opts?.minMarginRate || 0.10); // 10% 미만 = 누수
  const now = Date.now();
  const cutoff = now - period * DAY_MS;

  const productMap = {};
  products.forEach((p) => { productMap[p.name] = p; });

  // 제품별 판매 통계
  const stat = {};
  orders.forEach((o) => {
    if (!o?.orderDate || new Date(o.orderDate).getTime() < cutoff) return;
    (o.items || []).forEach((it) => {
      const k = it?.name || it?.productName;
      if (!k) return;
      const qty = Number(it?.quantity || 0);
      const price = Number(it?.unitPrice || it?.price || 0);
      const lineTotal = price * qty;
      if (!stat[k]) stat[k] = { qty: 0, revenue: 0, count: 0 };
      stat[k].qty += qty;
      stat[k].revenue += lineTotal;
      stat[k].count += 1;
    });
  });

  const items = Object.entries(stat).map(([name, s]) => {
    const p = productMap[name];
    if (!p) return null;
    const wholesale = Number(p.wholesale || 0);
    const cost = wholesale * s.qty;
    const margin = s.revenue - cost;
    const marginRate = s.revenue > 0 ? margin / s.revenue : 0;
    const avgPrice = s.qty > 0 ? s.revenue / s.qty : 0;
    return {
      name, category: p.category || '미분류',
      qty: s.qty, revenue: s.revenue, cost,
      margin, marginRate: Math.round(marginRate * 1000) / 10, // %
      avgPrice: Math.round(avgPrice),
      wholesale,
      retail: Number(p.retail || 0),
      severity: marginRate < 0 ? '손해' : marginRate < 0.05 ? '심각' : marginRate < minMargin ? '주의' : '정상',
    };
  })
  .filter((p) => p && p.marginRate < minMargin && p.qty > 0);

  items.sort((a, b) => a.marginRate - b.marginRate); // 마진 낮은 순

  return {
    periodDays: period,
    minMarginRate: minMargin * 100,
    results: items.slice(0, 20).map((p, i) => ({ ...p, rank: i + 1 })),
    totalLeakage: items.reduce((s, p) => s + (p.wholesale * p.qty * minMargin - p.margin), 0),
  };
}
