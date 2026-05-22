// 도구 호출 결과 → 적절한 차트/표 자동 라우팅
// toolCalls 배열에서 각 호출의 name으로 차트 선택
//
// 매핑:
//   getTopCustomers / getTopProducts (byCategory=false) → TopNBarChart
//   getTopProducts (byCategory=true) → TopNBarChart (data.results 그대로 가능)
//   getCustomerTrend / getProductTrend → TrendLineChart
//   getCustomerSegments → SegmentPieChart
//   getCompositeSummary → KpiCards
//   getDormantCustomers / getCustomerProductAffinity / getRepeatPurchaseGap → 단순 표

import { lazy, Suspense } from 'react';

const TopNBarChart = lazy(() => import('./charts/TopNBarChart'));
const TrendLineChart = lazy(() => import('./charts/TrendLineChart'));
const SegmentPieChart = lazy(() => import('./charts/SegmentPieChart'));
const KpiCards = lazy(() => import('./charts/KpiCards'));

const FALLBACK = <div className="text-xs text-[var(--muted-foreground)] py-2">차트 로드 중...</div>;

function renderOne(tc) {
  if (!tc?.result?.ok) return null;
  const data = tc.result.data;
  if (!data) return null;
  const { name, args = {} } = tc;

  switch (name) {
    case 'getTopCustomers': {
      if (!data.results?.length) return null;
      const sortBy = data.sortBy || 'revenue';
      const period = data.period || '기간';
      return (
        <Suspense fallback={FALLBACK}>
          <TopNBarChart
            data={data.results}
            dataKey={sortBy}
            title={`📊 거래처 TOP ${data.results.length} (${period})`}
            label={sortBy === 'revenue' ? '매출' : sortBy === 'count' ? '주문수' : '수량'}
          />
        </Suspense>
      );
    }
    case 'getTopProducts': {
      if (!data.results?.length) return null;
      const sortBy = data.sortBy || 'revenue';
      const isCat = data.byCategory;
      const period = data.period || '기간';
      // 카테고리 모드일 땐 name 필드가 없음 → category로 매핑
      const items = isCat
        ? data.results.map((r) => ({ ...r, name: r.category }))
        : data.results;
      return (
        <Suspense fallback={FALLBACK}>
          <TopNBarChart
            data={items}
            dataKey={sortBy}
            title={`📦 ${isCat ? '카테고리' : '제품'} TOP ${items.length} (${period})`}
            label={sortBy === 'revenue' ? '매출' : '수량'}
          />
        </Suspense>
      );
    }
    case 'getCustomerTrend': {
      if (!data.months?.length) return null;
      return (
        <Suspense fallback={FALLBACK}>
          <TrendLineChart
            data={data.months}
            title={`📈 ${data.name} 월별 추이`}
            showQty
          />
        </Suspense>
      );
    }
    case 'getProductTrend': {
      if (!data.months?.length) return null;
      return (
        <Suspense fallback={FALLBACK}>
          <TrendLineChart
            data={data.months}
            title={`📈 ${data.name} 판매 추이`}
            showQty
          />
        </Suspense>
      );
    }
    case 'getCustomerSegments': {
      if (!data.segments) return null;
      return (
        <Suspense fallback={FALLBACK}>
          <SegmentPieChart segments={data.segments} title={`🎯 RFM 세그먼트 (${data.period || ''}, 총 ${data.totalCustomers}명)`} />
        </Suspense>
      );
    }
    case 'getCompositeSummary': {
      return (
        <Suspense fallback={FALLBACK}>
          <KpiCards summary={data} title={`📊 종합 KPI (${data.period || ''})`} />
        </Suspense>
      );
    }
    case 'getDormantCustomers': {
      if (!data.results?.length) return null;
      return (
        <DormantTable data={data.results} threshold={data.daysThreshold} />
      );
    }
    case 'getCustomerProductAffinity': {
      if (!data.topProducts?.length) return null;
      return <AffinityCards data={data} />;
    }
    case 'getRepeatPurchaseGap': {
      if (data.avgGapDays == null) return null;
      return <RepeatGapCard data={data} />;
    }
    case 'getLowStockProducts': {
      if (!data.results?.length) return null;
      return <LowStockTable data={data.results} threshold={data.threshold} />;
    }
    case 'getStockSummary': {
      return <StockSummaryCards data={data} />;
    }
    case 'getProductsByStockStatus': {
      if (!data.results?.length) return null;
      return <StockStatusTable data={data.results} status={data.status} />;
    }
    case 'getRestockRecommendations': {
      if (!data.results?.length) return null;
      return <RestockTable data={data.results} period={data.salesPeriod} />;
    }
    case 'getPaymentSummary':
      return <PaymentSummaryCards data={data} />;
    case 'getOverdueCustomers': {
      if (!data.results?.length) return null;
      return <OverdueTable data={data.results} />;
    }
    case 'getPaymentInflow':
      return <InflowCards data={data} />;
    case 'getReturnAnalysis':
      return <ReturnAnalysisCards data={data} />;
    case 'getPendingCarts': {
      if (!data.results?.length) return null;
      return <PendingCartsTable data={data} />;
    }
    case 'getLearningStats':
      return <LearningStatsCards data={data} />;
    // === Codex 제안 5종 ===
    case 'getCollectionPlan':
      if (!data.results?.length) return null;
      return <CollectionPlanTable data={data} />;
    case 'getStockCoverageForecast':
      if (!data.results?.length) return null;
      return <StockCoverageTable data={data} />;
    case 'getNextBestOffers':
      if (!data.results?.length) return null;
      return <NextBestOffersCards data={data} />;
    case 'getProductBundleSuggestions':
      if (!data.results?.length) return null;
      return <BundleSuggestionsCards data={data} />;
    case 'getMarginLeakage':
      if (!data.results?.length) return null;
      return <MarginLeakageTable data={data} />;
    default:
      return null;
  }
}

// === Codex 제안 시각화 컴포넌트 5종 ===

function CollectionPlanTable({ data }) {
  return (
    <div className="jarvis-glass rounded-lg p-3 sm:p-4 overflow-x-auto">
      <div className="text-sm font-semibold mb-2 break-keep">💸 미수 회수 액션 플래너 ({data.customerCount}곳 · 총 {fmtKRW(data.totalOverdue)}원)</div>
      <div className="space-y-2">
        {data.results.map((c) => (
          <details key={c.rank} className="border border-cyan-400/15 rounded-lg p-2 text-xs">
            <summary className="cursor-pointer flex items-center gap-2">
              <span className="font-bold tabular-nums text-[var(--jarvis-cyan)]">#{c.rank}</span>
              <span className="font-semibold break-keep flex-1">{c.name}</span>
              <span className="tabular-nums font-bold text-[var(--destructive)]">{fmtKRW(c.totalBalance)}원</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.oldestDays >= 60 ? 'bg-red-500/20 text-red-300' : c.oldestDays >= 30 ? 'bg-amber-500/20 text-amber-300' : 'bg-cyan-500/20 text-cyan-300'}`}>
                {c.oldestDays}일
              </span>
              <span className="text-[10px] opacity-70">[{c.tone}]</span>
            </summary>
            <div className="mt-2 pt-2 border-t border-cyan-400/10 break-keep">
              <div className="text-[var(--jarvis-text-muted)] mb-1">💬 추천 연락 문구:</div>
              <div className="bg-cyan-500/5 rounded p-2 italic">{c.suggestedMessage}</div>
              {c.recentRevenue > 0 && (
                <div className="text-[10px] text-[var(--jarvis-text-muted)] mt-1">최근 30일 매출: {fmtKRW(c.recentRevenue)}원 (관계 활성)</div>
              )}
            </div>
          </details>
        ))}
      </div>
      <div className="text-[10px] text-[var(--jarvis-text-muted)] mt-2 break-keep">💡 우선순위 = 미수금 × 0.6 + 경과일 × 10000 + 최근 매출 × 0.15</div>
    </div>
  );
}

function StockCoverageTable({ data }) {
  return (
    <div className="jarvis-glass rounded-lg p-3 sm:p-4 overflow-x-auto">
      <div className="text-sm font-semibold mb-2 break-keep">⏳ 품절 임박 제품 ({data.maxDaysLeft}일 이내 · {data.count}건)</div>
      <table className="w-full text-xs">
        <thead className="text-[var(--muted-foreground)] border-b border-[var(--border)]">
          <tr>
            <th className="text-left py-1.5 pr-2">#</th>
            <th className="text-left py-1.5 pr-2">제품</th>
            <th className="text-right py-1.5 pr-2">재고</th>
            <th className="text-right py-1.5 pr-2 hidden sm:table-cell">일평균</th>
            <th className="text-right py-1.5 pr-2 font-bold">예상 일수</th>
            <th className="text-right py-1.5 hidden sm:table-cell">예상일</th>
            <th className="text-right py-1.5">추천 발주</th>
          </tr>
        </thead>
        <tbody>
          {data.results.map((p) => (
            <tr key={p.rank} className="border-b border-[var(--border)]/50">
              <td className="py-1.5 pr-2 tabular-nums font-semibold">{p.rank}</td>
              <td className="py-1.5 pr-2 break-keep">
                <div>{p.name}</div>
                <div className="text-[10px] opacity-60">{p.category}</div>
              </td>
              <td className="text-right py-1.5 pr-2 tabular-nums">{p.stock}</td>
              <td className="text-right py-1.5 pr-2 tabular-nums hidden sm:table-cell">{p.avgDailyQty}</td>
              <td className={`text-right py-1.5 pr-2 tabular-nums font-bold ${p.daysLeft <= 3 ? 'text-[var(--destructive)]' : p.daysLeft <= 7 ? 'text-amber-500' : ''}`}>
                {p.daysLeft}일
              </td>
              <td className="text-right py-1.5 tabular-nums text-[10px] hidden sm:table-cell">{p.expectedRunoutDate}</td>
              <td className="text-right py-1.5 tabular-nums font-bold text-[var(--success)]">{p.suggestedRestock}개</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[10px] text-[var(--jarvis-text-muted)] mt-2 break-keep">💡 추천 발주 = 일평균 × 30일치. 빨강 = 3일 내, 주황 = 7일 내.</div>
    </div>
  );
}

function NextBestOffersCards({ data }) {
  return (
    <div className="jarvis-glass rounded-lg p-3 sm:p-4">
      <div className="text-sm font-semibold mb-2 break-keep">🎯 {data.customerName} 추천 제품 ({data.totalRecommended}건 중 TOP 10)</div>
      <div className="space-y-1.5">
        {data.results.map((p) => (
          <div key={p.rank} className="flex items-center gap-2 text-xs border border-cyan-400/15 rounded-lg p-2">
            <span className="font-bold tabular-nums text-[var(--jarvis-cyan)] w-6 flex-shrink-0">#{p.rank}</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold break-keep">{p.name}</div>
              <div className="text-[10px] text-[var(--jarvis-text-muted)] break-keep">
                {p.category} · 과거 {p.historyCount}회 / {p.historyQty}개 · 평균 주기 {p.avgIntervalDays}일 · 마지막 {p.daysSinceLastOrder}일 전
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-[10px] opacity-70">재고 {p.stock}</div>
              <div className="text-[10px] tabular-nums">{fmtKRW(p.retail)}원</div>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 flex-shrink-0">{p.reason}</span>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-[var(--jarvis-text-muted)] mt-2 break-keep">💡 점수 = 친밀도(과거 수량×2) + 재고 적합도 + 재주문 시점 임박도</div>
    </div>
  );
}

function BundleSuggestionsCards({ data }) {
  return (
    <div className="jarvis-glass rounded-lg p-3 sm:p-4">
      <div className="text-sm font-semibold mb-2 break-keep">🛒 "{data.productName}" 묶음 추천 (기준 주문 {data.baseOrderCount}건)</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {data.results.map((p) => (
          <div key={p.rank} className="flex items-center gap-2 text-xs border border-cyan-400/15 rounded-lg p-2">
            <span className="font-bold tabular-nums text-[var(--jarvis-cyan)] flex-shrink-0">#{p.rank}</span>
            <span className="font-semibold break-keep flex-1 min-w-0">{p.name}</span>
            <span className="text-[10px] tabular-nums">{p.pairCount}건</span>
            <span className={`text-[10px] tabular-nums font-bold px-1.5 py-0.5 rounded ${p.confidence >= 50 ? 'bg-green-500/20 text-green-300' : p.confidence >= 25 ? 'bg-amber-500/20 text-amber-300' : 'bg-cyan-500/20 text-cyan-300'}`}>
              {p.confidence}%
            </span>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-[var(--jarvis-text-muted)] mt-2 break-keep">💡 신뢰도 = 동시 구매 비율. 50%↑ = 강한 묶음, 25%↑ = 권장.</div>
    </div>
  );
}

function MarginLeakageTable({ data }) {
  return (
    <div className="jarvis-glass rounded-lg p-3 sm:p-4 overflow-x-auto">
      <div className="text-sm font-semibold mb-2 break-keep">💰 마진 누수 점검 (최근 {data.periodDays}일 · 마진 {data.minMarginRate}% 미만)</div>
      <table className="w-full text-xs">
        <thead className="text-[var(--muted-foreground)] border-b border-[var(--border)]">
          <tr>
            <th className="text-left py-1.5 pr-2">#</th>
            <th className="text-left py-1.5 pr-2">제품</th>
            <th className="text-right py-1.5 pr-2">판매</th>
            <th className="text-right py-1.5 pr-2 hidden sm:table-cell">매출</th>
            <th className="text-right py-1.5 pr-2 font-bold">마진율</th>
            <th className="text-right py-1.5 hidden sm:table-cell">평균가</th>
            <th className="text-right py-1.5">권장</th>
          </tr>
        </thead>
        <tbody>
          {data.results.map((p) => (
            <tr key={p.rank} className="border-b border-[var(--border)]/50">
              <td className="py-1.5 pr-2 tabular-nums font-semibold">{p.rank}</td>
              <td className="py-1.5 pr-2 break-keep">
                <div>{p.name}</div>
                <div className="text-[10px] opacity-60">{p.category}</div>
              </td>
              <td className="text-right py-1.5 pr-2 tabular-nums">{p.qty}개</td>
              <td className="text-right py-1.5 pr-2 tabular-nums hidden sm:table-cell">{fmtKRW(p.revenue)}원</td>
              <td className={`text-right py-1.5 pr-2 tabular-nums font-bold ${p.marginRate < 0 ? 'text-[var(--destructive)]' : p.marginRate < 5 ? 'text-amber-500' : 'text-amber-400'}`}>
                {p.marginRate}%
              </td>
              <td className="text-right py-1.5 tabular-nums hidden sm:table-cell">{fmtKRW(p.avgPrice)}원</td>
              <td className="text-right py-1.5 text-[10px]">
                <span className={`px-1.5 py-0.5 rounded ${p.severity === '손해' ? 'bg-red-500/20 text-red-300' : p.severity === '심각' ? 'bg-red-500/15 text-red-200' : 'bg-amber-500/20 text-amber-300'}`}>
                  {p.severity}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[10px] text-[var(--jarvis-text-muted)] mt-2 break-keep">💡 손해/심각 등급은 가격 인상 우선 후보. 도매가 대비 평균가 확인.</div>
    </div>
  );
}

const fmtKRW = (n) => Number(n || 0).toLocaleString('ko-KR');

function PaymentSummaryCards({ data }) {
  return (
    <div className="jarvis-glass rounded-lg p-3 sm:p-4">
      <div className="text-sm font-semibold mb-3 break-keep">💵 결제 현황 ({data.total}건)</div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-green-50 rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-[var(--muted-foreground)]">완납</div>
          <div className="text-lg font-black tabular-nums text-[var(--success)]">{data.paid}</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-[var(--muted-foreground)]">부분</div>
          <div className="text-lg font-black tabular-nums text-amber-600">{data.partial}</div>
        </div>
        <div className="bg-red-50 rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-[var(--muted-foreground)]">미수</div>
          <div className="text-lg font-black tabular-nums text-[var(--destructive)]">{data.unpaid}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="border border-[var(--border)] rounded-lg p-2">
          <div className="text-[var(--muted-foreground)]">총 결제 금액</div>
          <div className="font-bold tabular-nums">{fmtKRW(data.totalAmount)}원</div>
        </div>
        <div className="border border-red-200 bg-red-50 rounded-lg p-2">
          <div className="text-[var(--muted-foreground)]">총 미수금</div>
          <div className="font-bold tabular-nums text-[var(--destructive)]">{fmtKRW(data.totalBalance)}원</div>
        </div>
      </div>
      <div className="text-[10px] text-[var(--muted-foreground)] mt-2">입금률 {data.paidRate}% · 입금 이력 {data.totalHistoryCount}건</div>
    </div>
  );
}

function OverdueTable({ data }) {
  return (
    <div className="jarvis-glass rounded-lg p-3 sm:p-4 overflow-x-auto">
      <div className="text-sm font-semibold mb-2 break-keep">💸 미수 거래처 ({data.length}곳)</div>
      <table className="w-full text-xs">
        <thead className="text-[var(--muted-foreground)] border-b border-[var(--border)]">
          <tr>
            <th className="text-left py-1.5 pr-2">#</th>
            <th className="text-left py-1.5 pr-2">거래처</th>
            <th className="text-right py-1.5 pr-2">미수금</th>
            <th className="text-right py-1.5 pr-2 hidden sm:table-cell">건수</th>
            <th className="text-right py-1.5">최장 경과일</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c, i) => (
            <tr key={i} className="border-b border-[var(--border)]/50">
              <td className="py-1.5 pr-2 tabular-nums font-semibold">{c.rank}</td>
              <td className="py-1.5 pr-2 break-keep">{c.name}</td>
              <td className="text-right py-1.5 pr-2 tabular-nums font-bold text-[var(--destructive)]">{fmtKRW(c.totalBalance)}원</td>
              <td className="text-right py-1.5 pr-2 tabular-nums hidden sm:table-cell">{c.recordCount}</td>
              <td className={`text-right py-1.5 tabular-nums ${c.oldestDays >= 60 ? 'text-[var(--destructive)] font-bold' : c.oldestDays >= 30 ? 'text-amber-600' : ''}`}>
                {c.oldestDays}일
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InflowCards({ data }) {
  return (
    <div className="jarvis-glass rounded-lg p-3 sm:p-4">
      <div className="text-sm font-semibold mb-2 break-keep">💰 입금 이력 ({data.period}, {data.total}건)</div>
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="border border-[var(--border)] rounded-lg p-2">
          <div className="text-[var(--muted-foreground)]">총 입금액</div>
          <div className="font-bold tabular-nums">{fmtKRW(data.totalAmount)}원</div>
        </div>
        <div className="border border-[var(--border)] rounded-lg p-2">
          <div className="text-[var(--muted-foreground)]">평균 입금</div>
          <div className="font-bold tabular-nums">{fmtKRW(data.avgAmount)}원</div>
        </div>
      </div>
      {data.byMethod?.length > 0 && (
        <div>
          <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1">결제 방법별</div>
          <table className="w-full text-xs">
            {data.byMethod.map((m, i) => (
              <tr key={i} className="border-b border-[var(--border)]/30">
                <td className="py-1">{m.method || '미지정'}</td>
                <td className="text-right py-1 tabular-nums">{m.count}건</td>
                <td className="text-right py-1 tabular-nums font-semibold">{fmtKRW(m.amount)}원</td>
              </tr>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}

function ReturnAnalysisCards({ data }) {
  return (
    <div className="jarvis-glass rounded-lg p-3 sm:p-4">
      <div className="text-sm font-semibold mb-2 break-keep">↩️ 반품 분석 ({data.period})</div>
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div className="border border-[var(--border)] rounded-lg p-2">
          <div className="text-[var(--muted-foreground)]">총 매출</div>
          <div className="font-bold tabular-nums">{fmtKRW(data.totalRevenue)}원</div>
        </div>
        <div className="border border-red-200 bg-red-50 rounded-lg p-2">
          <div className="text-[var(--muted-foreground)]">반품액</div>
          <div className="font-bold tabular-nums text-[var(--destructive)]">{fmtKRW(data.totalReturnedAmount)}원</div>
        </div>
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-2">
          <div className="text-[var(--muted-foreground)]">반품률</div>
          <div className="font-bold tabular-nums text-amber-600">{data.returnRate}%</div>
        </div>
      </div>
      {data.topReturnedProducts?.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1">자주 반품되는 제품 TOP 5</div>
          {data.topReturnedProducts.slice(0, 5).map((p, i) => (
            <div key={i} className="flex justify-between text-xs py-0.5">
              <span className="break-keep">{i + 1}. {p.name}</span>
              <span className="tabular-nums">{p.qty}개 / {fmtKRW(p.amount)}원</span>
            </div>
          ))}
        </div>
      )}
      {data.topReturnedCustomers?.length > 0 && (
        <div>
          <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1">반품 많은 거래처 TOP 5</div>
          {data.topReturnedCustomers.slice(0, 5).map((c, i) => (
            <div key={i} className="flex justify-between text-xs py-0.5">
              <span className="break-keep">{i + 1}. {c.name}</span>
              <span className="tabular-nums">{c.returnCount}건 / {fmtKRW(c.amount)}원</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PendingCartsTable({ data }) {
  return (
    <div className="jarvis-glass rounded-lg p-3 sm:p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold break-keep">📋 대기 주문 ({data.total}건)</div>
        <div className="text-[10px] text-[var(--muted-foreground)]">
          예정 {data.upcomingCount} · 지연 <span className="text-[var(--destructive)] font-semibold">{data.overdueCount}</span>
        </div>
      </div>
      <table className="w-full text-xs">
        <thead className="text-[var(--muted-foreground)] border-b border-[var(--border)]">
          <tr>
            <th className="text-left py-1.5 pr-2">카트명</th>
            <th className="text-left py-1.5 pr-2 hidden sm:table-cell">거래처</th>
            <th className="text-right py-1.5 pr-2">예정일</th>
            <th className="text-right py-1.5">금액</th>
          </tr>
        </thead>
        <tbody>
          {data.results.map((c, i) => (
            <tr key={i} className={`border-b border-[var(--border)]/50 ${c.overdue ? 'bg-red-50' : ''}`}>
              <td className="py-1.5 pr-2 break-keep">{c.cartName}</td>
              <td className="py-1.5 pr-2 hidden sm:table-cell text-[var(--muted-foreground)] break-keep">{c.customerName || '-'}</td>
              <td className={`text-right py-1.5 pr-2 tabular-nums ${c.overdue ? 'text-[var(--destructive)] font-semibold' : ''}`}>
                {c.deliveryDate || '-'}
              </td>
              <td className="text-right py-1.5 tabular-nums">{fmtKRW(c.amount)}원</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[10px] text-[var(--muted-foreground)] mt-2">총액: {fmtKRW(data.totalAmount)}원</div>
    </div>
  );
}

function LearningStatsCards({ data }) {
  return (
    <div className="jarvis-glass rounded-lg p-3 sm:p-4">
      <div className="text-sm font-semibold mb-2 break-keep">🧠 AI 학습 데이터 ({data.total}건)</div>
      {data.byProduct?.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1">자주 교정되는 제품 TOP 10</div>
          {data.byProduct.slice(0, 10).map((p, i) => (
            <div key={i} className="flex justify-between text-xs py-0.5">
              <span className="break-keep">{i + 1}. {p.productName}</span>
              <span className="tabular-nums">{p.count}회</span>
            </div>
          ))}
        </div>
      )}
      {data.byReason?.length > 0 && (
        <div>
          <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1">교정 사유별</div>
          {data.byReason.map((r, i) => (
            <div key={i} className="flex justify-between text-xs py-0.5">
              <span className="break-keep text-[var(--muted-foreground)]">{r.reason}</span>
              <span className="tabular-nums">{r.count}회</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 재고 부족 표
function LowStockTable({ data, threshold }) {
  return (
    <div className="jarvis-glass rounded-lg p-3 sm:p-4 overflow-x-auto">
      <div className="text-sm font-semibold mb-2 break-keep">📦 재고 부족 제품 (≤ {threshold}개)</div>
      <table className="w-full text-xs">
        <thead className="text-[var(--muted-foreground)] border-b border-[var(--border)]">
          <tr>
            <th className="text-left py-1.5 pr-2">제품명</th>
            <th className="text-left py-1.5 pr-2 hidden sm:table-cell">카테고리</th>
            <th className="text-right py-1.5 pr-2">현재 재고</th>
            <th className="text-right py-1.5">최근 1개월 판매</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p, i) => (
            <tr key={i} className="border-b border-[var(--border)]/50">
              <td className="py-1.5 pr-2 break-keep">{p.name}</td>
              <td className="py-1.5 pr-2 hidden sm:table-cell text-[var(--muted-foreground)]">{p.category}</td>
              <td className={`text-right py-1.5 pr-2 tabular-nums font-semibold ${p.stock === 0 ? 'text-[var(--destructive)]' : p.stock <= 2 ? 'text-amber-600' : ''}`}>
                {p.stock === 0 ? '품절' : `${p.stock}개`}
              </td>
              <td className="text-right py-1.5 tabular-nums">{p.recentSoldQty}개</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 재고 현황 요약 카드
function StockSummaryCards({ data }) {
  const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
  return (
    <div className="jarvis-glass rounded-lg p-3 sm:p-4">
      <div className="text-sm font-semibold mb-3 break-keep">📦 재고 현황 요약 (총 {data.total}개 제품)</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div className="bg-[var(--accent)] rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-[var(--muted-foreground)]">정상</div>
          <div className="text-lg sm:text-xl font-black tabular-nums text-[var(--success)]">{data.normal}</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-[var(--muted-foreground)]">부족 (≤{data.lowThreshold})</div>
          <div className="text-lg sm:text-xl font-black tabular-nums text-amber-600">{data.low}</div>
        </div>
        <div className="bg-red-50 rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-[var(--muted-foreground)]">품절</div>
          <div className="text-lg sm:text-xl font-black tabular-nums text-[var(--destructive)]">{data.out}</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-2.5 text-center">
          <div className="text-[10px] text-[var(--muted-foreground)]">입고대기</div>
          <div className="text-lg sm:text-xl font-black tabular-nums text-blue-600">{data.incoming}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="border border-[var(--border)] rounded-lg p-2">
          <div className="text-[var(--muted-foreground)]">총 재고 수량</div>
          <div className="font-bold tabular-nums">{fmt(data.totalStockUnits)}개</div>
        </div>
        <div className="border border-[var(--border)] rounded-lg p-2">
          <div className="text-[var(--muted-foreground)]">재고 가치 (도매가 기준)</div>
          <div className="font-bold tabular-nums">{fmt(data.totalStockValueWholesale)}원</div>
        </div>
      </div>
      {data.byCategory?.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-[var(--muted-foreground)] hover:text-[var(--foreground)]">📂 카테고리별 ({data.byCategory.length}개)</summary>
          <table className="w-full mt-2">
            <thead className="text-[var(--muted-foreground)]">
              <tr>
                <th className="text-left py-1">카테고리</th>
                <th className="text-right py-1">제품수</th>
                <th className="text-right py-1">재고합</th>
                <th className="text-right py-1">가치</th>
              </tr>
            </thead>
            <tbody>
              {data.byCategory.map((c, i) => (
                <tr key={i} className="border-b border-[var(--border)]/30">
                  <td className="py-1 break-keep">{c.category}</td>
                  <td className="text-right tabular-nums">{c.count}</td>
                  <td className="text-right tabular-nums">{c.units}</td>
                  <td className="text-right tabular-nums">{fmt(c.valueWholesale)}원</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

// 상태별 재고 표
function StockStatusTable({ data, status }) {
  const label = status === 'incoming' ? '입고대기' : status === 'out' ? '품절' : '정상';
  return (
    <div className="jarvis-glass rounded-lg p-3 sm:p-4 overflow-x-auto">
      <div className="text-sm font-semibold mb-2 break-keep">📦 {label} 제품 ({data.length}개)</div>
      <table className="w-full text-xs">
        <thead className="text-[var(--muted-foreground)] border-b border-[var(--border)]">
          <tr>
            <th className="text-left py-1.5 pr-2">제품명</th>
            <th className="text-left py-1.5 pr-2 hidden sm:table-cell">카테고리</th>
            <th className="text-right py-1.5">재고</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 50).map((p, i) => (
            <tr key={i} className="border-b border-[var(--border)]/50">
              <td className="py-1.5 pr-2 break-keep">{p.name}</td>
              <td className="py-1.5 pr-2 hidden sm:table-cell text-[var(--muted-foreground)]">{p.category}</td>
              <td className="text-right py-1.5 tabular-nums">{p.stock}개</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 재주문 추천 표 (가장 중요한 도구)
function RestockTable({ data, period }) {
  const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
  return (
    <div className="jarvis-glass rounded-lg p-3 sm:p-4 overflow-x-auto">
      <div className="text-sm font-semibold mb-2 break-keep">🔄 재주문 추천 ({period} 판매량 기준)</div>
      <table className="w-full text-xs">
        <thead className="text-[var(--muted-foreground)] border-b border-[var(--border)]">
          <tr>
            <th className="text-left py-1.5 pr-2">#</th>
            <th className="text-left py-1.5 pr-2">제품</th>
            <th className="text-right py-1.5 pr-2">현재 재고</th>
            <th className="text-right py-1.5 pr-2 hidden sm:table-cell">최근 판매</th>
            <th className="text-right py-1.5 pr-2">추천 발주</th>
            <th className="text-left py-1.5 hidden sm:table-cell">사유</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p, i) => (
            <tr key={i} className="border-b border-[var(--border)]/50">
              <td className="py-1.5 pr-2 tabular-nums font-semibold text-[var(--primary)]">{p.rank}</td>
              <td className="py-1.5 pr-2 break-keep">
                <div>{p.name}</div>
                <div className="text-[10px] text-[var(--muted-foreground)]">{p.category}</div>
              </td>
              <td className={`text-right py-1.5 pr-2 tabular-nums font-semibold ${p.stock === 0 ? 'text-[var(--destructive)]' : p.stock <= 3 ? 'text-amber-600' : ''}`}>
                {p.stock === 0 ? '품절' : `${p.stock}개`}
              </td>
              <td className="text-right py-1.5 pr-2 tabular-nums hidden sm:table-cell">{p.recentSoldQty}개</td>
              <td className="text-right py-1.5 pr-2 tabular-nums font-bold text-[var(--success)]">{p.suggestedRestock}개</td>
              <td className="py-1.5 hidden sm:table-cell text-[var(--muted-foreground)]">{p.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[10px] text-[var(--muted-foreground)] mt-2 break-keep">💡 추천 수량 = 최근 판매량 × 2.5배. 시급도 점수 높은 순.</div>
    </div>
  );
}

// 표 컴포넌트 (단순 케이스)
function DormantTable({ data, threshold }) {
  return (
    <div className="jarvis-glass rounded-lg p-3 sm:p-4 overflow-x-auto">
      <div className="text-sm font-semibold mb-2 break-keep">⚠️ 휴면 위험 거래처 ({threshold}일 이상 미주문)</div>
      <table className="w-full text-xs">
        <thead className="text-[var(--muted-foreground)] border-b border-[var(--border)]">
          <tr>
            <th className="text-left py-1.5 pr-2">거래처</th>
            <th className="text-right py-1.5 pr-2">누적 매출</th>
            <th className="text-right py-1.5 pr-2">과거 주문</th>
            <th className="text-right py-1.5">마지막</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c, i) => (
            <tr key={i} className="border-b border-[var(--border)]/50">
              <td className="py-1.5 pr-2 break-keep">{c.name}</td>
              <td className="text-right py-1.5 pr-2 tabular-nums">{c.lifetimeRevenue.toLocaleString('ko-KR')}원</td>
              <td className="text-right py-1.5 pr-2 tabular-nums">{c.pastOrderCount}건</td>
              <td className="text-right py-1.5 tabular-nums text-[var(--destructive)]">{c.lastOrderDays}일 전</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AffinityCards({ data }) {
  return (
    <div className="jarvis-glass rounded-lg p-3 sm:p-4">
      <div className="text-sm font-semibold mb-2 break-keep">🛒 {data.name} 자주 구매 패턴</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1">TOP 제품</div>
          <ul className="space-y-1 text-xs">
            {data.topProducts.slice(0, 8).map((p, i) => (
              <li key={i} className="flex justify-between gap-2 min-w-0">
                <span className="break-keep min-w-0 flex-1">{i + 1}. {p.name}</span>
                <span className="tabular-nums flex-shrink-0">{p.qty}개 / {p.revenue.toLocaleString('ko-KR')}원</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1">TOP 카테고리</div>
          <ul className="space-y-1 text-xs">
            {data.topCategories.slice(0, 8).map((c, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{i + 1}. {c.category}</span>
                <span className="tabular-nums">{c.revenue.toLocaleString('ko-KR')}원</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function RepeatGapCard({ data }) {
  const label = data.productId ? `제품 #${data.productId}` : data.customerName ? `${data.customerName}` : '대상';
  return (
    <div className="jarvis-glass rounded-lg p-3 sm:p-4">
      <div className="text-sm font-semibold mb-2 break-keep">🔄 재주문 주기 — {label}</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[10px] text-[var(--muted-foreground)]">평균</div>
          <div className="text-xl font-black tabular-nums">{data.avgGapDays}일</div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--muted-foreground)]">최단</div>
          <div className="text-xl font-black tabular-nums text-[var(--success)]">{data.minGapDays}일</div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--muted-foreground)]">최장</div>
          <div className="text-xl font-black tabular-nums text-[var(--destructive)]">{data.maxGapDays}일</div>
        </div>
      </div>
      <div className="text-[10px] text-[var(--muted-foreground)] mt-2 text-center">샘플 {data.sampleSize}건 기반</div>
    </div>
  );
}

export default function ResultRenderer({ toolCalls = [] }) {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null;
  const charts = toolCalls.map((tc, i) => {
    const rendered = renderOne(tc);
    if (!rendered) return null;
    return <div key={i} className="mt-3">{rendered}</div>;
  }).filter(Boolean);
  if (charts.length === 0) return null;
  return <div className="w-full">{charts}</div>;
}
