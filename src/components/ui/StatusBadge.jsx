const variants = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  ready: 'bg-green-100 text-green-700',
  hold: 'bg-yellow-100 text-yellow-700',
  reservation: 'bg-purple-100 text-purple-700',
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  normal: 'bg-gray-100 text-gray-600',
  out: 'bg-red-100 text-red-700',
  incoming: 'bg-yellow-100 text-yellow-700',
  blacklist: 'bg-red-100 text-red-700',
};

const labels = {
  draft: '임시저장',
  scheduled: '배송예정',
  ready: '준비완료',
  hold: '보류',
  reservation: '예약',
  urgent: '긴급',
  high: '높음',
  normal: '보통',
  out: '품절',
  incoming: '입고예정',
  blacklist: '블랙리스트',
};

export default function StatusBadge({ status, label, className = '' }) {
  const style = variants[status] || 'bg-gray-100 text-gray-600';
  const text = label || labels[status] || status;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold ${style} ${className}`}>
      {text}
    </span>
  );
}
