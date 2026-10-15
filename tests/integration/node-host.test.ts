import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createGameServer } from '../../src/server/node/server';

async function host() {
  const app = await createGameServer({ directory: null, allowedOrigins: ['https://nasi-friends.pages.dev'], fastTimers: true, maxRooms: 2 });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  return { app, url: `http://127.0.0.1:${address.port}` };
}

describe('portable host and separate frontend', () => {
  it('allows the configured Pages origin, including preflight, and rejects other origins', async () => {
    const { app, url } = await host();
    try {
      const preflight = await fetch(`${url}/api/rooms`, { method: 'OPTIONS', headers: { Origin: 'https://nasi-friends.pages.dev', 'access-control-request-method': 'POST' } });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get('access-control-allow-origin')).toBe('https://nasi-friends.pages.dev');
      const room = await fetch(`${url}/api/rooms`, { method: 'POST', headers: { Origin: 'https://nasi-friends.pages.dev', 'content-type': 'application/json' }, body: JSON.stringify({ name: '华人朋友' }) });
      expect(room.status).toBe(201);
      expect(room.headers.get('access-control-allow-origin')).toBe('https://nasi-friends.pages.dev');
      const { code } = await room.json() as { code: string };
      const denied = await fetch(`${url}/api/rooms/${code}`, { headers: { Origin: 'https://stranger.example' } });
      expect(denied.status).toBe(403);
      const rejected = await new Promise<number>((resolve, reject) => {
        const ws = new WebSocket(`${url.replace('http', 'ws')}/api/rooms/${code}/ws`, { origin: 'https://stranger.example' });
        ws.on('unexpected-response', (_request, response) => { response.resume(); resolve(response.statusCode!); ws.terminate(); });
        ws.on('error', () => undefined);
        ws.on('open', () => { ws.close(); reject(new Error('Untrusted origin connected')); });
      });
      expect(rejected).toBe(403);
    } finally { await app.stop(); }
  });

  it('caps room allocation and does not allocate unknown lookup codes', async () => {
    const { app, url } = await host();
    try {
      for (let i = 0; i < 10; i++) expect((await fetch(`${url}/api/rooms/ZZZZZZ`)).status).toBe(404);
      for (let i = 0; i < 2; i++) expect((await fetch(`${url}/api/rooms`, { method: 'POST', body: JSON.stringify({ name: `Friend ${i}` }) })).status).toBe(201);
      const full = await fetch(`${url}/api/rooms`, { method: 'POST', body: JSON.stringify({ name: 'Another' }) });
      expect(full.status).toBe(503);
      expect(await full.json()).toEqual({ error: 'server-full' });
      expect(await (await fetch(`${url}/api/health`)).json()).toMatchObject({ ok: true, backend: 'node' });
    } finally { await app.stop(); }
  });
});
