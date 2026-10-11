import type { CreateRoomResponse, JoinRoomResponse, RoomInfoResponse } from '../../shared/protocol';

export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError('network');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(body.error ?? `http-${res.status}`);
  return body as T;
}

export function createRoom(name: string): Promise<CreateRoomResponse> {
  return call('/api/rooms', { method: 'POST', body: JSON.stringify({ name }) });
}

export function joinRoom(code: string, name: string): Promise<JoinRoomResponse> {
  return call(`/api/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', body: JSON.stringify({ name }) });
}

export function roomInfo(code: string): Promise<RoomInfoResponse> {
  return call(`/api/rooms/${encodeURIComponent(code)}`);
}
