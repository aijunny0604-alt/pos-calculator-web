import { AlertTriangle, Info } from 'lucide-react';

export default function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel, confirmText = '확인', cancelText = '취소', destructive = false }) {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-modal-backdrop"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
    >
      <div className="absolute inset-0" onClick={onCancel} />
      <div
        className="relative rounded-2xl shadow-2xl max-w-md w-full p-6 border animate-modal-up"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-start gap-4 mb-4">
          <div
            className="p-3 rounded-xl flex-shrink-0"
            style={{
              background: destructive
                ? 'color-mix(in srgb, var(--destructive) 12%, transparent)'
                : 'color-mix(in srgb, var(--primary) 12%, transparent)',
            }}
          >
            {destructive
              ? <AlertTriangle className="w-6 h-6" style={{ color: 'var(--destructive)' }} />
              : <Info className="w-6 h-6" style={{ color: 'var(--primary)' }} />
            }
          </div>
          <div>
            {title && (
              <h3 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
                {title}
              </h3>
            )}
            {message && (
              <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
                {message}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm rounded-xl font-medium border transition-colors hover:bg-[var(--accent)]"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 text-sm rounded-xl font-medium text-white transition-colors hover:opacity-90"
            style={{
              background: destructive ? 'var(--destructive)' : 'var(--primary)',
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
