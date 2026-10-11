import { type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../client/i18n';

interface Props {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  testId?: string;
  /** Non-dismissable (e.g. a required choice). */
  required?: boolean;
}

/**
 * Bottom sheet on phones, centred dialog on larger screens. The body scrolls,
 * header and footer stay visible so action buttons are never off-screen.
 */
export function Modal({ open, onClose, title, children, footer, wide, testId, required }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      // A card preview can sit above the reference dialog. Only the top dialog
      // should handle keyboard input; Escape must not close both at once.
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (e.key === 'Escape' && !required) closeRef.current?.();
      if (e.key === 'Tab') {
        const controls = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])]
          .filter((el) => el.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) { e.preventDefault(); ref.current?.focus(); }
        else if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open, required]);
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-kopi-900/55 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={() => !required && onClose?.()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        className={`panel heritage-modal flex max-h-[92dvh] w-full animate-slide-up flex-col overflow-hidden rounded-b-none outline-none sm:rounded-3xl ${
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        }`}
      >
        {(title || (onClose && !required)) && (
          <div className="modal-header flex shrink-0 items-center justify-between gap-3 px-5 py-3">
            <h2 id={titleId} className="min-w-0 break-words text-xl font-semibold">{title}</h2>
            {onClose && !required && (
              <button className="btn-ghost btn-sm shrink-0" onClick={onClose} aria-label={t('common.close')}>
                ✕
              </button>
            )}
          </div>
        )}
        <div className="modal-body min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="modal-footer safe-bottom flex shrink-0 flex-wrap justify-end gap-2 border-t border-santan-300 bg-santan-100 px-5 py-3">{footer}</div>}
      </div>
    </div>, document.body
  );
}
