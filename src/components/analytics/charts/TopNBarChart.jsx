// TOP N 막대 차트 (거래처 매출 / 제품 매출) — JARVIS 스타일
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatPrice } from '@/lib/utils';
import { JARVIS_CHART_COLORS } from '@/lib/jarvisTheme';

const COLORS = JARVIS_CHART_COLORS;

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
    <div className="rounded-lg px-3 py-2 text-xs" style={{
      background: 'rgba(5, 11, 24, 0.95)',
      border: '1px solid rgba(0, 212, 255, 0.5)',
      boxShadow: '0 0 16px rgba(0, 212, 255, 0.3), 0 4px 16px rgba(0,0,0,0.5)',
      color: '#e8f4fd',
      backdropFilter: 'blur(12px)',
    }}>
      <div className="font-semibold mb-1 break-keep" style={{ color: '#00d4ff' }}>{item.name}</div>
      <div>{valueLabel}: <span className="font-bold tabular-nums">{valueKey === 'revenue' ? formatPrice(item[valueKey]) + '원' : item[valueKey]}</span></div>
      {item.count != null && <div>주문: <span className="tabular-nums">{item.count}건</span></div>}
      {item.changePct != null && (
        <div>변화: <span style={{ color: item.changePct > 0 ? '#00ff88' : item.changePct < 0 ? '#ff3860' : '#7fa3c8' }}>
          {item.changePct > 0 ? '↑' : item.changePct < 0 ? '↓' : '→'}{Math.abs(item.changePct)}%
        </span></div>
      )}
    </div>
  );
}

export default function TopNBarChart({ data = [], dataKey = 'revenue', label, title }) {
  if (!Array.isArray(data) || data.length === 0) return null;
  const valueLabel = label || (dataKey === 'revenue' ? '매출' : dataKey === 'count' ? '주문수' : '수량');

  return (
    <div className="w-full jarvis-glass rounded-lg p-3 sm:p-4">
      {title && <div className="text-sm font-semibold mb-2 break-keep" style={{ color: '#e8f4fd' }}>{title}</div>}
      <ResponsiveContainer width="100%" height={Math.max(240, data.length * 32)}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
          <XAxis type="number" tickFormatter={(v) => dataKey === 'revenue' ? fmtKRW(v) : v} fontSize={11} stroke="#7fa3c8" tick={{ fill: '#7fa3c8' }} />
          <YAxis type="category" dataKey="name" width={100} fontSize={11} interval={0} stroke="#7fa3c8" tick={{ fill: '#7fa3c8' }} />
          <Tooltip content={<TooltipBox valueKey={dataKey} valueLabel={valueLabel} />} cursor={{ fill: 'rgba(0,212,255,0.08)' }} />
          <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} animationDuration={800}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} style={{ filter: `drop-shadow(0 0 4px ${COLORS[i % COLORS.length]}88)` }} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
