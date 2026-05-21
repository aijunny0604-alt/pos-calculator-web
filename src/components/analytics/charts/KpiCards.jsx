// 종합 KPI 그리드 (CompositeSummary 결과 렌더링)
import { formatPrice } from '@/lib/utils';

function ChangeBadge({ pct }) {
  if (pct == null) return <span className="text-[10px] text-[var(--muted-foreground)]">→</span>;
  const color = pct > 0 ? 'text-[var(--success)]' : pct < 0 ? 'text-[var(--destructive)]' : 'text-[var(--muted-foreground)]';
  const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
  return <span className={`text-[10px] font-semibold ${color} tabular-nums`}>{arrow}{Math.abs(pct)}%</span>;
}

function Card({ label, value, hint, change, color }) {
  return (
    <div className="bg-white border border-[var(--border)] rounded-lg p-3 flex flex-col min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] sm:text-xs text-[var(--muted-foreground)] font-medium uppercase tracking-wide truncate">{label}</span>
        {change !== undefined && <ChangeBadge pct={change} />}
      </div>
      <div className="text-xl sm:text-2xl font-black tabular-nums break-all" style={color ? { color } : undefined}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5 break-keep">{hint}</div>}
    </div>
  );
}

function fmtKRW(v) {
  if (!Number.isFinite(v)) return '0원';
  if (v >= 100000000) return `${(v / 100000000).toFixed(2)}억`;
  if (v >= 10000000) return `${(v / 10000).toFixed(0)}만`;
  return formatPrice(v) + '원';
}

export default function KpiCards({ summary, title }) {
  if (!summary?.current) return null;
  const { current, changes = {} } = summary;
  const rev = current.revenue || { total: 0, supply: 0, vat: 0 };

  return (
    <div className="w-full">
      {title && <div className="text-sm font-semibold mb-2 break-keep">{title}</div>}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        <Card label="총 매출 (VAT 포함)" value={fmtKRW(rev.total)} hint={`공급가 ${fmtKRW(rev.supply)} · 부가세 ${fmtKRW(rev.vat)}`} change={changes.revenue} color="#10b981" />
        <Card label="주문 건수" value={`${current.orderCount}건`} change={changes.orderCount} color="#3b82f6" />
        <Card label="평균 주문가" value={fmtKRW(current.avgOrderValue)} change={changes.avgOrderValue} color="#8b5cf6" />
        <Card label="활성 거래처" value={`${current.activeCustomers}곳`} change={changes.activeCustomers} color="#f59e0b" />
        <Card label="신규 거래처" value={`${current.newCustomers}곳`} change={changes.newCustomers} color="#06b6d4" />
        <Card label="반품률" value={`${current.returnRate}%`} hint={`반품액 ${fmtKRW(current.totalReturned)}`} color="#ef4444" />
        <Card label="부가항목 사용률" value={`${current.extraItemRate}%`} hint="택배비/퀵비 포함 주문 비율" color="#84cc16" />
      </div>
    </div>
  );
}
