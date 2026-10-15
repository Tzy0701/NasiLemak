import { useSyncExternalStore } from 'react';
import { isValidAvatar } from '../shared/protocol';
import { setLocale, type Locale } from './i18n';

/** Per-device preferences and room sessions (localStorage). */
export interface Prefs {
  language: Locale;
  avatar?: number;
  sound: boolean;
  reducedMotion: boolean;
  lastName: string;
  muteSocial?: boolean;
  handSort?: 'category' | 'count' | 'name';
}

const PREFS_KEY = 'nl.prefs.v1';
const SESSION_KEY = 'nl.sessions.v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

const defaultLanguage: Locale = typeof navigator !== 'undefined' && navigator.language.startsWith('zh') ? 'zh' : 'en';
let prefs: Prefs = read<Prefs>(PREFS_KEY, { language: defaultLanguage, sound: true, reducedMotion: false, lastName: '' });
if (prefs.language !== 'zh' && prefs.language !== 'en') prefs.language = defaultLanguage;
setLocale(prefs.language);
if (!isValidAvatar(prefs.avatar)) delete prefs.avatar;
const listeners = new Set<() => void>();

export function getPrefs(): Prefs {
  return prefs;
}

export function setPrefs(patch: Partial<Prefs>): void {
  prefs = { ...prefs, ...patch };
  setLocale(prefs.language);
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode */
  }
  for (const f of listeners) f();
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => prefs,
  );
}

export interface RoomSession {
  code: string;
  playerId: string;
  token: string;
  savedAt: number;
}

function readSessions(): Record<string, RoomSession> {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}') as Record<string, RoomSession>;
  } catch {
    return {};
  }
}

export function getSession(code: string): RoomSession | null {
  return readSessions()[code] ?? null;
}

export function saveSession(s: Omit<RoomSession, 'savedAt'>): void {
  const all = readSessions();
  all[s.code] = { ...s, savedAt: Date.now() };
  // Keep the 10 most recent rooms.
  const entries = Object.values(all).sort((a, b) => b.savedAt - a.savedAt).slice(0, 10);
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(Object.fromEntries(entries.map((e) => [e.code, e]))));
  } catch {
    /* ignore */
  }
}

export function clearSession(code: string): void {
  const all = readSessions();
  delete all[code];
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function latestSession(): RoomSession | null {
  const list = Object.values(readSessions()).sort((a, b) => b.savedAt - a.savedAt);
  return list[0] ?? null;
}
