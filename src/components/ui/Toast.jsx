import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap = {
  success: { bg: 'var(--success)', text: '#fff' },
  error: { bg: 'var(--destructive)', text: '#fff' },
  warning: { bg: 'var(--warning)', text: '#fff' },
  info: { bg: 'var(--primary)', text: '#fff' },
};

export default function Toast({ message, type = 'info', onClose, duration = 3000 }) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  if (!message) return null;
  const Icon = icons[type] || Info;
  const colors = colorMap[type] || colorMap.info;

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in">
      <div
        className="flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg"
        style={{ background: colors.bg, color: colors.text }}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        <span className="text-sm font-medium">{message}</span>
        <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">&times;</button>
      </div>
    </div>
  );
}
