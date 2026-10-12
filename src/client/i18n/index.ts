import { useSyncExternalStore } from 'react';
import { en } from './en';
import { zh } from './zh';

/**
 * Minimal i18n: dotted keys + {param} interpolation. Add more locales to
 * `LOCALES` (same shape as `en`) – missing keys fall back to English.
 */
export type Locale = 'en' | 'zh';
const LOCALES: Record<Locale, unknown> = { en, zh };
export const AVAILABLE_LOCALES: { id: Locale; label: string }[] = [{ id: 'zh', label: '简体中文' }, { id: 'en', label: 'English' }];

let current: Locale = 'en';
const listeners = new Set<() => void>();

export function setLocale(l: Locale): void {
  if (current === l) return;
  current = l;
  for (const f of listeners) f();
}

export function getLocale(): Locale { return current; }

export function useLocale(): Locale {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

function lookup(dict: unknown, key: string): unknown {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else return undefined;
  }
  return cur;
}

export type Params = Record<string, string | number | undefined>;

export function t(key: string, params?: Params): string {
  const raw = lookup(LOCALES[current], key) ?? lookup(en, key);
  if (typeof raw !== 'string') return key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] === undefined ? `{${k}}` : String(params[k])));
}

export function tList(key: string): string[] {
  const raw = lookup(LOCALES[current], key) ?? lookup(en, key);
  return Array.isArray(raw) ? (raw as string[]) : [];
}

export function has(key: string): boolean {
  return typeof (lookup(LOCALES[current], key) ?? lookup(en, key)) === 'string';
}
