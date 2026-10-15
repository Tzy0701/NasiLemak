import { describe, expect, inject, it } from 'vitest';
import { TestPlayer } from './client';

describe.runIf(process.env.TEST_BACKEND === 'cloudflare')('Cloudflare host', () => {
  const base = inject('baseUrl');

  it('serves the frontend, SPA routes and API from the same Worker', async () => {
    expect(await (await fetch(`${base}/api/health`)).json()).toMatchObject({ ok: true, backend: 'cloudflare' });
    const page = await fetch(`${base}/room/TEST23`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('<div id="root">');
    const missing = await fetch(`${base}/api/not-a-real-route`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'not-found' });
  });

  it('handles browser heartbeat with the hibernation auto-response and no new snapshot', async () => {
    const player = await TestPlayer.create(base, 'Heartbeat');
    try {
      const version = player.room!.version;
      player.ws!.send('{"t":"ping"}');
      await player.waitFor(() => player.received.some(r => r.msg.t === 'pong' && r.msg.now === 0));
      expect(player.room!.version).toBe(version);
    } finally { player.close(); }
  });
});
