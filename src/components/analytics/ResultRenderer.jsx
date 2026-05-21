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
    default:
      return null;
  }
}

// 표 컴포넌트 (단순 케이스)
function DormantTable({ data, threshold }) {
  return (
    <div className="bg-white border border-[var(--border)] rounded-lg p-3 sm:p-4 overflow-x-auto">
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
    <div className="bg-white border border-[var(--border)] rounded-lg p-3 sm:p-4">
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
    <div className="bg-white border border-[var(--border)] rounded-lg p-3 sm:p-4">
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
