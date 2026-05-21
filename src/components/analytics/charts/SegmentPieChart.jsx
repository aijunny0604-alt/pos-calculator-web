// RFM 세그먼트 파이 차트 (5+1세그먼트) — JARVIS 톤
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SEGMENT_META } from '@/lib/analytics/rfm';
import { JARVIS_SEGMENT_COLORS } from '@/lib/jarvisTheme';

function TooltipBox({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{
      background: 'rgba(5, 11, 24, 0.95)',
      border: '1px solid rgba(0, 212, 255, 0.5)',
      boxShadow: '0 0 16px rgba(0, 212, 255, 0.3)',
      color: '#e8f4fd',
      backdropFilter: 'blur(12px)',
    }}>
      <div className="font-semibold mb-1" style={{ color: '#00d4ff' }}>{p.label || p.name}</div>
      <div className="tabular-nums">{p.count}명 ({p.percent}%)</div>
      {p.action && <div className="mt-1 break-keep max-w-[200px]" style={{ color: '#7fa3c8' }}>{p.action}</div>}
    </div>
  );
}

export default function SegmentPieChart({ segments = {}, title }) {
  const entries = Object.entries(segments).filter(([, v]) => v?.count > 0);
  if (entries.length === 0) return null;
  const total = entries.reduce((acc, [, v]) => acc + v.count, 0);
  const data = entries.map(([key, v]) => {
    const meta = SEGMENT_META[key] || { label: key, color: '#94a3b8', action: '' };
    const jarvisColor = JARVIS_SEGMENT_COLORS[key] || meta.color;
    return {
      name: key,
      label: meta.label,
      count: v.count,
      percent: total > 0 ? Math.round((v.count / total) * 100) : 0,
      color: jarvisColor,
      action: meta.action,
    };
  });

  return (
    <div className="w-full jarvis-glass rounded-lg p-3 sm:p-4">
      {title && <div className="text-sm font-semibold mb-2 break-keep" style={{ color: '#e8f4fd' }}>{title}</div>}
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            paddingAngle={2}
            label={({ percent, label }) => `${label.split(' ')[0]} ${percent}%`}
            labelLine={false}
            fontSize={11}
            animationDuration={1000}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} stroke="rgba(5,11,24,0.6)" strokeWidth={2} style={{ filter: `drop-shadow(0 0 8px ${d.color}aa)` }} />
            ))}
          </Pie>
          <Tooltip content={<TooltipBox />} />
          <Legend
            verticalAlign="bottom"
            iconSize={10}
            formatter={(value) => <span className="text-xs" style={{ color: '#e8f4fd' }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
