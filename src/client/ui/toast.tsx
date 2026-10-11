import { useSyncExternalStore } from 'react';
import { t } from '../i18n';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'good' | 'turn';
}

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const f of listeners) f();
}

export function pushToast(text: string, tone: Toast['tone'] = 'info', ms = 3200): void {
  const toast = { id: ++seq, text, tone };
  toasts = [...toasts.slice(-3), toast];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== toast.id);
    emit();
  }, ms);
}

export function errorMessage(code: string | undefined): string {
  const c = code ?? 'unknown';
  const key = `errors.${c}`;
  const s = t(key);
  return s === key ? t('errors.unknown', { code: c }) : s;
}

export function pushError(code: string | undefined): void {
  pushToast(errorMessage(code), 'error');
}

export function Toasts() {
  const list = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 top-12 z-[70] flex flex-col items-center gap-2 px-3" aria-live="polite">
      {list.map((x) => (
        <div
          key={x.id}
          role={x.tone === 'error' ? 'alert' : 'status'}
          data-testid={`toast-${x.tone}`}
          className={`max-w-md animate-pop rounded-2xl px-4 py-2 text-center text-sm font-bold shadow-soft ${
            x.tone === 'error'
              ? 'bg-sambal-500 text-white'
              : x.tone === 'good'
                ? 'bg-leaf-500 text-white'
                : x.tone === 'turn'
                  ? 'bg-kunyit-400 text-kopi-900'
                  : 'bg-kopi-800 text-santan-50'
          }`}
        >
          {x.text}
        </div>
      ))}
    </div>
  );
}
