import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import { isValidRoomCode, MAX_MESSAGE_BYTES, normaliseRoomCode } from '../../shared/protocol';
import { randomRoomCode } from '../crypto';
import { NodeSocket, RoomHost } from './host';

export interface ServerOptions { directory?: string | null; assets?: string; allowedOrigins?: string[]; fastTimers?: boolean; maxRooms?: number }
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

export async function createGameServer(options: ServerOptions = {}) {
  const env = { FAST_TIMERS: options.fastTimers ? '1' : undefined };
  const directory = options.directory === undefined ? resolve('.room-data') : options.directory;
  const rooms = await RoomHost.load(directory, env);
  const hits = new Map<string, { count: number; until: number }>();
  const assets = resolve(options.assets ?? 'dist/client');
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES * 2 });
  let shuttingDown = false;
  function limited(ip: string, category: string, limit: number): boolean {
    const now = Date.now(), key = `${category}:${ip}`, hit = hits.get(key);
    if (hit && hit.until > now) return ++hit.count > limit * (options.fastTimers ? 100 : 1);
    if (hits.size >= 5000) { for (const [k, h] of hits) if (h.until <= now) hits.delete(k); if (hits.size >= 5000) return true; }
    hits.set(key, { count: 1, until: now + 60_000 }); return false;
  }
  function originAllowed(req: IncomingMessage): boolean {
    if (!req.headers.origin) return true;
    try { const origin = new URL(req.headers.origin); return origin.host === req.headers.host || (options.allowedOrigins ?? []).includes(origin.origin); }
    catch { return false; }
  }
  function json(req: IncomingMessage, res: ServerResponse, body: unknown, status = 200) {
    const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
    if (req.headers.origin && originAllowed(req)) Object.assign(headers, { 'access-control-allow-origin': req.headers.origin, vary: 'Origin', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' });
    res.writeHead(status, headers).end(JSON.stringify(body));
  }
  async function body(req: IncomingMessage): Promise<Record<string, unknown> | null> {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of req) { bytes += Buffer.byteLength(chunk); if (bytes <= 4096) chunks.push(Buffer.from(chunk)); if (bytes > 65536) { req.destroy(); return null; } }
    if (bytes > 4096) return null;
    const text = Buffer.concat(chunks).toString('utf8');
    try { const value: unknown = JSON.parse(text || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; } catch { return null; }
  }
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const fail = (error: string, status = 400) => json(req, res, { error }, status);
      if (url.pathname.startsWith('/api/')) {
        if (!originAllowed(req)) return fail('bad-origin', 403);
        if (req.method === 'OPTIONS') return json(req, res, {}, 204);
        if (url.pathname === '/api/health') return json(req, res, { ok: true, now: Date.now(), backend: 'node' });
        if (shuttingDown) return fail('try-again', 503);
        const ip = req.socket.remoteAddress ?? 'local';
        if (limited(ip, 'api', 240)) return fail('rate-limited', 429);
        if (url.pathname === '/api/rooms') {
          if (req.method !== 'POST') return fail('method-not-allowed', 405);
          if (limited(ip, 'create', 20)) return fail('rate-limited', 429);
          const data = await body(req); if (!data) return fail('bad-request');
          for (const [code, host] of rooms) if (host.empty) rooms.delete(code);
          if (rooms.size >= (options.maxRooms ?? 300)) return fail('server-full', 503);
          let code: string; do { code = randomRoomCode(); } while (rooms.has(code));
          const host = new RoomHost(code, directory, null, env); rooms.set(code, host);
          const result = await host.run(room => room.create(code, data.name, data.avatar));
          if (!result.ok) { rooms.delete(code); return fail(result.error); }
          return json(req, res, result.res, 201);
        }
        const match = /^\/api\/rooms\/([A-Za-z2-9]{6})(?:\/(join|ws))?$/.exec(url.pathname);
        if (!match || !isValidRoomCode(normaliseRoomCode(match[1]!))) return fail('room-not-found', 404);
        if (limited(ip, 'lookup', 90)) return fail('rate-limited', 429);
        const host = rooms.get(normaliseRoomCode(match[1]!)); if (!host) return fail('room-not-found', 404);
        if (!match[2] && req.method === 'GET') { const info = await host.run(room => room.info()); return info ? json(req, res, info) : fail('room-not-found', 404); }
        if (match[2] === 'join' && req.method === 'POST') {
          const data = await body(req); if (!data) return fail('bad-request');
          const result = await host.run(room => room.join(data.name, data.avatar));
          if (result.ok) return json(req, res, result.res, 201);
          return fail(result.error, result.error === 'room-not-found' ? 404 : ['room-full', 'game-in-progress'].includes(result.error) ? 409 : 400);
        }
        return fail(match[2] === 'ws' ? 'expected-websocket' : 'not-found', match[2] === 'ws' ? 426 : 404);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return fail('method-not-allowed', 405);
      const path = resolve(assets, `.${decodeURIComponent(url.pathname)}`);
      if (path !== assets && !path.startsWith(assets + sep)) return fail('not-found', 404);
      let filename = path, file = await stat(filename).catch(() => null);
      if (!file?.isFile()) { if (extname(url.pathname)) return fail('not-found', 404); filename = resolve(assets, 'index.html'); file = await stat(filename).catch(() => null); }
      if (!file?.isFile()) return fail('not-found', 404);
      res.writeHead(200, { 'content-type': MIME[extname(filename)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': filename.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'public, max-age=300' });
      if (req.method === 'HEAD') res.end(); else createReadStream(filename).on('error', () => res.destroy()).pipe(res);
    })().catch(error => { console.error('http request failed', error); if (!res.headersSent) json(req, res, { error: 'server-error' }, 500); else res.destroy(); });
  });
  server.on('upgrade', (req, socket, head) => {
    void (async () => {
      const reject = (status: number) => { socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`); };
      if (shuttingDown) return reject(503);
      if (!originAllowed(req)) return reject(403);
      if (limited(req.socket.remoteAddress ?? 'local', 'upgrade', 120)) return reject(429);
      const match = /^\/api\/rooms\/([A-Z2-9]{6})\/ws$/.exec((req.url ?? '').split('?')[0]!);
      const host = match ? rooms.get(match[1]!) : null;
      if (!host || !await host.run(room => room.info())) return reject(404);
      if (host.connectionCount >= 64) return reject(429);
      sockets.handleUpgrade(req, socket, head, ws => {
        const client = new NodeSocket(ws), connected = host.connect(client);
        ws.on('message', (data, binary) => {
          void connected.then(ok => ok ? host.run(room => room.webSocketMessage(client, binary ? new ArrayBuffer(0) : data.toString())) : undefined)
            .catch(error => { console.error('socket request failed', host.code, error); ws.close(1011, 'server error'); });
        });
        ws.on('close', code => { void host.disconnected(client, code).catch(error => console.error('disconnect failed', host.code, error)); });
        ws.on('error', () => ws.close());
        void connected.then(ok => { if (!ok) ws.close(4004, 'room closed'); }).catch(() => ws.close(1011, 'server error'));
      });
    })().catch(error => { console.error('upgrade failed', error); socket.destroy(); });
  });
  return { server, async stop() { shuttingDown = true; await Promise.all([...rooms.values()].map(host => host.stop())); for (const ws of sockets.clients) ws.terminate(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
