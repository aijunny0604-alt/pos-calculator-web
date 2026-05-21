// RFM 세그먼트 파이 차트 (5+1세그먼트)
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SEGMENT_META } from '@/lib/analytics/rfm';

function TooltipBox({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-white border border-[var(--border)] rounded-lg px-3 py-2 shadow-md text-xs">
      <div className="font-semibold mb-1">{p.label || p.name}</div>
      <div className="tabular-nums">{p.count}명 ({p.percent}%)</div>
      {p.action && <div className="mt-1 text-[var(--muted-foreground)] break-keep max-w-[200px]">{p.action}</div>}
    </div>
  );
}

export default function SegmentPieChart({ segments = {}, title }) {
  // segments = { Champion: { count, members: [...] }, Loyal: {...}, ... }
  const entries = Object.entries(segments).filter(([, v]) => v?.count > 0);
  if (entries.length === 0) return null;
  const total = entries.reduce((acc, [, v]) => acc + v.count, 0);
  const data = entries.map(([key, v]) => {
    const meta = SEGMENT_META[key] || { label: key, color: '#94a3b8', action: '' };
    return {
      name: key,
      label: meta.label,
      count: v.count,
      percent: total > 0 ? Math.round((v.count / total) * 100) : 0,
      color: meta.color,
      action: meta.action,
    };
  });

  return (
    <div className="w-full bg-white rounded-lg border border-[var(--border)] p-3 sm:p-4">
      {title && <div className="text-sm font-semibold mb-2 break-keep">{title}</div>}
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
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip content={<TooltipBox />} />
          <Legend
            verticalAlign="bottom"
            iconSize={10}
            formatter={(value) => <span className="text-xs">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
