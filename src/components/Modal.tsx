import { type ReactNode, useEffect, useRef } from 'react';
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !required) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, required]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-kopi-900/55 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={() => !required && onClose?.()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        className={`panel flex max-h-[92dvh] w-full animate-slide-up flex-col overflow-hidden rounded-b-none outline-none sm:rounded-3xl ${
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        }`}
      >
        {(title || (onClose && !required)) && (
          <div className="flex items-center justify-between gap-3 border-b border-santan-300 bg-santan-100 px-5 py-3">
            <h2 className="text-xl font-semibold text-kopi-900">{title}</h2>
            {onClose && !required && (
              <button className="btn-ghost btn-sm" onClick={onClose} aria-label={t('common.close')}>
                ✕
              </button>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="safe-bottom flex flex-wrap justify-end gap-2 border-t border-santan-300 bg-santan-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
