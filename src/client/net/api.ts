import type { CreateRoomResponse, JoinRoomResponse, RoomInfoResponse } from '../../shared/protocol';

import { getPrefs } from '../prefs';
import { apiUrl } from './endpoint';

export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new ApiError('network');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(body.error ?? `http-${res.status}`);
  return body as T;
}

export function createRoom(name: string): Promise<CreateRoomResponse> {
  return call('/api/rooms', { method: 'POST', body: JSON.stringify({ name, avatar: getPrefs().avatar }) });
}

export function joinRoom(code: string, name: string): Promise<JoinRoomResponse> {
  return call(`/api/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', body: JSON.stringify({ name, avatar: getPrefs().avatar }) });
}

export function roomInfo(code: string): Promise<RoomInfoResponse> {
  return call(`/api/rooms/${encodeURIComponent(code)}`);
}
