// 월별/일별 시계열 라인 차트
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatPrice } from '@/lib/utils';

function fmtKRW(v) {
  if (!Number.isFinite(v)) return '0';
  if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억`;
  if (v >= 10000) return `${(v / 10000).toFixed(0)}만`;
  return formatPrice(v);
}

function TooltipBox({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[var(--border)] rounded-lg px-3 py-2 shadow-md text-xs">
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: <span className="font-bold tabular-nums">
            {p.dataKey === 'revenue' ? formatPrice(p.value) + '원' : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function TrendLineChart({ data = [], xKey = 'month', title, showQty = false }) {
  if (!Array.isArray(data) || data.length === 0) return null;

  return (
    <div className="w-full bg-white rounded-lg border border-[var(--border)] p-3 sm:p-4">
      {title && <div className="text-sm font-semibold mb-2 break-keep">{title}</div>}
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey={xKey} fontSize={11} />
          <YAxis tickFormatter={fmtKRW} fontSize={11} />
          <Tooltip content={<TooltipBox />} />
          <Line
            type="monotone"
            dataKey="revenue"
            name="매출"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ fill: '#10b981', r: 3 }}
            activeDot={{ r: 5 }}
          />
          {showQty && (
            <Line
              type="monotone"
              dataKey="qty"
              name="수량"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 3 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
