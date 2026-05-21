// TOP N 막대 차트 (거래처 매출 / 제품 매출)
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatPrice } from '@/lib/utils';

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#ec4899', '#14b8a6', '#6366f1'];

function fmtKRW(v) {
  if (!Number.isFinite(v)) return '0원';
  if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억`;
  if (v >= 10000) return `${(v / 10000).toFixed(0)}만`;
  return formatPrice(v) + '원';
}

function TooltipBox({ active, payload, valueKey, valueLabel }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  return (
    <div className="bg-white border border-[var(--border)] rounded-lg px-3 py-2 shadow-md text-xs">
      <div className="font-semibold mb-1 break-keep">{item.name}</div>
      <div>{valueLabel}: <span className="font-bold tabular-nums">{valueKey === 'revenue' ? formatPrice(item[valueKey]) + '원' : item[valueKey]}</span></div>
      {item.count != null && <div>주문: <span className="tabular-nums">{item.count}건</span></div>}
      {item.changePct != null && (
        <div>변화: <span className={item.changePct > 0 ? 'text-[var(--success)]' : item.changePct < 0 ? 'text-[var(--destructive)]' : ''}>
          {item.changePct > 0 ? '↑' : item.changePct < 0 ? '↓' : '→'}{Math.abs(item.changePct)}%
        </span></div>
      )}
    </div>
  );
}

export default function TopNBarChart({ data = [], dataKey = 'revenue', label, title }) {
  if (!Array.isArray(data) || data.length === 0) return null;
  // data는 results 배열: [{ rank, name, revenue, count, qty, changePct }]
  const valueLabel = label || (dataKey === 'revenue' ? '매출' : dataKey === 'count' ? '주문수' : '수량');

  return (
    <div className="w-full bg-white rounded-lg border border-[var(--border)] p-3 sm:p-4">
      {title && <div className="text-sm font-semibold mb-2 break-keep">{title}</div>}
      <ResponsiveContainer width="100%" height={Math.max(240, data.length * 32)}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
          <XAxis type="number" tickFormatter={(v) => dataKey === 'revenue' ? fmtKRW(v) : v} fontSize={11} />
          <YAxis type="category" dataKey="name" width={100} fontSize={11} interval={0} />
          <Tooltip content={<TooltipBox valueKey={dataKey} valueLabel={valueLabel} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar dataKey={dataKey} radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
