import { useSyncExternalStore } from 'react';

/** Tiny history-based router: "/" and "/r/:code". */
const listeners = new Set<() => void>();

function emit(): void {
  for (const f of listeners) f();
}

if (typeof window !== 'undefined') window.addEventListener('popstate', emit);

export function navigate(path: string, replace = false): void {
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  emit();
}

export function usePath(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => location.pathname,
  );
}

export function roomUrl(code: string): string {
  return `${location.origin}/r/${code}`;
}
