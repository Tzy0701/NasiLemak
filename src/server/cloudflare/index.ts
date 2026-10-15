/**
 * Worker entry: tiny JSON API for creating/joining rooms and the WebSocket
 * upgrade. Everything else is served from Workers Static Assets (the React
 * SPA). Each room is one GameRoom Durable Object addressed by its code.
 */
import {
  type CreateRoomResponse,
  isValidRoomCode,
  normaliseRoomCode,
  type RoomInfoResponse,
  sanitiseName,
  isValidAvatar,
} from '../../shared/protocol';
import { randomRoomCode } from '../crypto';
import type { Env } from './env';

export { GameRoom } from './GameRoom';

const SECURITY_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: SECURITY_HEADERS });
}

function errorJson(error: string, status: number): Response {
  return json({ error }, status);
}

// Best-effort per-isolate rate limiting (room-code guessing / spam). Durable
// Objects add their own per-socket limits on top.
const hits = new Map<string, { n: number; reset: number }>();
/** Integration tests hammer the API from one IP; FAST_TIMERS relaxes the limits there. */
let limitScale = 1;
function rateLimited(key: string, baseLimit: number, windowMs: number): boolean {
  const limit = baseLimit * limitScale;
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    }
    return false;
  }
  h.n += 1;
  return h.n > limit;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const len = Number(request.headers.get('content-length') ?? '0');
  try {
    // Drain the stream even when rejecting it, so the local runtime's pooled
    // HTTP connection remains usable. Retain at most 4 KiB of input.
    const reader = request.body?.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes <= 4096) text += decoder.decode(value, { stream: true });
        }
      } finally { reader.releaseLock(); }
    }
    if (len > 4096 || bytes > 4096) return null;
    text += decoder.decode();
    const body = JSON.parse(text || '{}') as unknown;
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function originAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // non-browser clients still need a valid token
  try {
    const o = new URL(origin);
    const self = new URL(request.url);
    if (o.origin === self.origin) return true;
    const extra = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return extra.includes(o.origin);
  } catch {
    return false;
  }
}

function roomStub(env: Env, code: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  limitScale = env.FAST_TIMERS === '1' ? 100 : 1;
  const url = new URL(request.url);
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  if (parts.length === 2 && parts[1] === 'health' && request.method === 'GET') return json({ ok: true, backend: 'cloudflare', now: Date.now() });

  if (parts[1] !== 'rooms' || parts.length > 4) return errorJson('not-found', 404);
  if (!originAllowed(request, env)) return errorJson('bad-origin', 403);

  if (rateLimited(`api:${ip}`, 240, 60_000)) return errorJson('rate-limited', 429);

  // POST /api/rooms -> create
  if (parts.length === 2) {
    if (request.method !== 'POST') return errorJson('method-not-allowed', 405);
    if (rateLimited(`create:${ip}`, 20, 60_000)) return errorJson('rate-limited', 429);
    const body = await readJson(request);
    if (!body) return errorJson('bad-request', 400);
    // Reject invalid creates before invoking a Durable Object.
    if (!sanitiseName(body.name)) return errorJson('bad-name', 400);
    if (body.avatar !== undefined && !isValidAvatar(body.avatar)) return errorJson('bad-request', 400);
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = randomRoomCode();
      const res = await roomStub(env, code).create(code, body.name, body.avatar);
      if (res.ok) return json(res.res satisfies CreateRoomResponse, 201);
      if (res.error !== 'room-exists') return errorJson(res.error, 400);
    }
    return errorJson('try-again', 503);
  }

  const code = normaliseRoomCode(parts[2] ?? '');
  if (!isValidRoomCode(code)) return errorJson('room-not-found', 404);
  const action = parts[3];

  // Room lookups by unknown codes are the brute-force vector – limit harder.
  if (rateLimited(`lookup:${ip}`, 90, 60_000)) return errorJson('rate-limited', 429);

  if (!action && request.method === 'GET') {
    const info: RoomInfoResponse | null = await roomStub(env, code).info();
    return info ? json(info) : errorJson('room-not-found', 404);
  }

  if (action === 'join' && request.method === 'POST') {
    const body = await readJson(request);
    if (!body) return errorJson('bad-request', 400);
    const res = await roomStub(env, code).join(body.name, body.avatar);
    if (res.ok) return json(res.res, 201);
    const status = res.error === 'room-not-found' ? 404 : res.error === 'room-full' || res.error === 'game-in-progress' ? 409 : 400;
    return errorJson(res.error, status);
  }

  if (action === 'ws' && request.method === 'GET') {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return errorJson('expected-websocket', 426);
    if (!originAllowed(request, env)) return errorJson('bad-origin', 403);
    return roomStub(env, code).fetch(request);
  }

  return errorJson('not-found', 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env);
      } catch (e) {
        console.error('api error', e);
        return errorJson('server-error', 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
