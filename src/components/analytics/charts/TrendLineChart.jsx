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
    <div className="rounded-lg px-3 py-2 text-xs" style={{
      background: 'rgba(5, 11, 24, 0.95)',
      border: '1px solid rgba(0, 212, 255, 0.5)',
      boxShadow: '0 0 16px rgba(0, 212, 255, 0.3)',
      color: '#e8f4fd',
      backdropFilter: 'blur(12px)',
    }}>
      <div className="font-semibold mb-1" style={{ color: '#00d4ff' }}>{label}</div>
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
    <div className="w-full jarvis-glass rounded-lg p-3 sm:p-4">
      {title && <div className="text-sm font-semibold mb-2 break-keep" style={{ color: '#e8f4fd' }}>{title}</div>}
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,255,0.12)" />
          <XAxis dataKey={xKey} fontSize={11} stroke="#7fa3c8" tick={{ fill: '#7fa3c8' }} />
          <YAxis tickFormatter={fmtKRW} fontSize={11} stroke="#7fa3c8" tick={{ fill: '#7fa3c8' }} />
          <Tooltip content={<TooltipBox />} cursor={{ stroke: 'rgba(0,212,255,0.4)', strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="revenue"
            name="매출"
            stroke="#00d4ff"
            strokeWidth={2.5}
            dot={{ fill: '#00d4ff', r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6, fill: '#4dffff', stroke: '#00d4ff', strokeWidth: 2 }}
            animationDuration={1200}
            style={{ filter: 'drop-shadow(0 0 6px rgba(0,212,255,0.6))' }}
          />
          {showQty && (
            <Line
              type="monotone"
              dataKey="qty"
              name="수량"
              stroke="#a855f7"
              strokeWidth={2.5}
              dot={{ fill: '#a855f7', r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: '#c084fc' }}
              animationDuration={1400}
              style={{ filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.6))' }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
