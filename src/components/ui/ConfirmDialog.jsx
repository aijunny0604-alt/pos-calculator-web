export default function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel, confirmText = '확인', cancelText = '취소', destructive = false }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-[var(--card)] rounded-lg shadow-xl max-w-sm w-full p-6">
        {title && <h3 className="text-lg font-bold mb-2">{title}</h3>}
        {message && <p className="text-sm text-[var(--muted-foreground)] mb-4">{message}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-[var(--border)] hover:bg-[var(--accent)] transition-colors">
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-lg font-medium text-white transition-colors ${
              destructive ? 'bg-[var(--destructive)] hover:opacity-90' : 'bg-[var(--primary)] hover:opacity-90'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
