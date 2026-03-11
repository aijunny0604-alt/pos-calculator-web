const variants = {
  pending: { bg: 'color-mix(in srgb, var(--muted-foreground) 15%, transparent)', color: 'var(--muted-foreground)' },
  draft: { bg: 'color-mix(in srgb, var(--muted-foreground) 15%, transparent)', color: 'var(--muted-foreground)' },
  scheduled: { bg: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)' },
  ready: { bg: 'color-mix(in srgb, var(--success) 15%, transparent)', color: 'var(--success)' },
  hold: { bg: 'color-mix(in srgb, var(--warning) 15%, transparent)', color: 'var(--warning)' },
  reservation: { bg: 'color-mix(in srgb, var(--purple) 15%, transparent)', color: 'var(--purple)' },
  urgent: { bg: 'color-mix(in srgb, var(--destructive) 15%, transparent)', color: 'var(--destructive)' },
  high: { bg: 'color-mix(in srgb, var(--warning) 20%, transparent)', color: 'var(--warning)' },
  normal: { bg: 'color-mix(in srgb, var(--muted-foreground) 12%, transparent)', color: 'var(--muted-foreground)' },
  out: { bg: 'color-mix(in srgb, var(--destructive) 15%, transparent)', color: 'var(--destructive)' },
  incoming: { bg: 'color-mix(in srgb, var(--warning) 15%, transparent)', color: 'var(--warning)' },
  blacklist: { bg: 'color-mix(in srgb, var(--destructive) 15%, transparent)', color: 'var(--destructive)' },
};

const defaultVariant = { bg: 'color-mix(in srgb, var(--muted-foreground) 12%, transparent)', color: 'var(--muted-foreground)' };

const labels = {
  pending: '대기',
  draft: '임시저장',
  scheduled: '예약',
  ready: '준비완료',
  hold: '보류',
  reservation: '입고예약',
  urgent: '긴급',
  high: '높음',
  normal: '보통',
  out: '품절',
  incoming: '입고예정',
  blacklist: '블랙리스트',
};

export default function StatusBadge({ status, label, className = '' }) {
  const v = variants[status] || defaultVariant;
  const text = label || labels[status] || status;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold ${className}`}
      style={{ background: v.bg, color: v.color }}
    >
      {text}
    </span>
  );
}
