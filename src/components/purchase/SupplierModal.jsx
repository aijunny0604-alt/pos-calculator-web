import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import ViewportModal from '@/components/ui/ViewportModal';

// JSR 상세·편집·확인 창에 같은 뷰포트, 포커스, 입퇴장 모션을 적용한다.
export default function SupplierModal({ title, subtitle, onClose, children, footer, busy = false, compact = false }) {
  const titleId = useId();
  const dialog = useRef(null);
  const close = useRef(onClose);
  const locked = useRef(busy);
  close.current = onClose;
  locked.current = busy;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus({ preventScroll: true });
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!locked.current) close.current();
      }
      if (event.key !== 'Tab') return;
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <ViewportModal animated className="move-dialog-backdrop fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6" onClick={() => !busy && onClose()}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
      className={`move-dialog w-full ${compact ? 'max-w-lg' : 'max-w-5xl'} max-h-full min-h-0 flex flex-col rounded-2xl border overflow-hidden outline-none`}
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }} onClick={event => event.stopPropagation()}>
      <header className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="min-w-0 flex-1"><h2 id={titleId} className="text-xl sm:text-2xl font-bold">{title}</h2>{subtitle && <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>{subtitle}</p>}</div>
        <button aria-label="닫기" disabled={busy} onClick={onClose}><X size={22} /></button>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5">{children}</div>
      {footer && <footer className="move-dialog-footer shrink-0 flex flex-wrap items-center justify-end gap-2 px-4 sm:px-6 py-4 border-t" style={{ borderColor: 'var(--border)' }}>{footer}</footer>}
    </section>
  </ViewportModal>;
}
