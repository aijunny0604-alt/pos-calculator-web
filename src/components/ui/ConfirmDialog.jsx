import { useEffect, useId, useRef } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';

export default function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel, confirmText = '확인', cancelText = '취소', destructive = false }) {
  const panel = useRef(null), cancel = useRef(onCancel);
  const titleId = useId(), messageId = useId();
  cancel.current = onCancel;
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement;
    const first = panel.current?.querySelector('[data-cancel]');
    first?.focus({ preventScroll: true });
    const key = e => {
      if (!panel.current?.contains(document.activeElement)) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel.current?.(); }
      if (e.key === 'Tab') {
        const controls = [...panel.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];
        const first = controls[0], last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [isOpen]);
  if (!isOpen) return null;
  return <div className="move-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0" onClick={onCancel} />
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={message ? messageId : undefined} className="move-dialog move-confirm relative border">
      <div className="move-confirm-heading">
        <span className={`move-confirm-icon ${destructive ? 'is-danger' : ''}`} aria-hidden="true">{destructive ? <AlertTriangle size={21}/> : <Info size={21}/>}</span>
        <h3 id={titleId}>{title || '확인해주세요'}</h3>
        <button type="button" className="move-close" onClick={onCancel} aria-label="닫기"><X size={18}/></button>
      </div>
      {message && <div id={messageId} className="move-confirm-body">{message}</div>}
      <div className="move-confirm-footer">
        <button type="button" data-cancel onClick={onCancel}>{cancelText}</button>
        <button type="button" className={destructive ? 'move-danger' : 'move-primary'} onClick={onConfirm}>{confirmText}</button>
      </div>
    </section>
  </div>;
}
