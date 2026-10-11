import { afterEach, expect, inject, test } from 'vitest';
import { TestPlayer } from './client';

const base = inject('baseUrl');
const players: TestPlayer[] = [];
afterEach(() => { for (const player of players.splice(0)) player.close(); });

test('chosen avatars sync, survive reconnect and rematch, and reject invalid indices', async () => {
  const host = await TestPlayer.create(base, 'Avatar host', 8); players.push(host);
  const guest = await TestPlayer.join(base, host.code, 'Avatar guest', 23); players.push(guest);
  await host.waitFor(() => host.room!.members.length === 2);
  expect(host.me?.avatar).toBe(8);
  expect(host.room!.members.find(m => m.id === guest.playerId)?.avatar).toBe(23);
  expect(await guest.lobby({ op: 'setAvatar', avatar: 12 })).toEqual({ ok: true });
  await host.waitFor(() => host.room!.members.find(m => m.id === guest.playerId)?.avatar === 12);
  for (const avatar of [-1, 24, 1.5, '8', null]) {
    expect(await guest.request({ t: 'lobby', body: { op: 'setAvatar', avatar } })).toEqual({ ok: false, error: 'bad-request' });
  }
  expect(guest.me?.avatar).toBe(12);
  guest.drop(); await new Promise(r => setTimeout(r, 100)); await guest.connect();
  expect(guest.me?.avatar).toBe(12);
  await guest.lobby({ op: 'setReady', ready: true });
  expect(await host.lobby({ op: 'start' })).toEqual({ ok: true });
  expect(await guest.lobby({ op: 'setAvatar', avatar: 15 })).toEqual({ ok: true });
  await host.waitFor(() => host.room!.members.find(m => m.id === guest.playerId)?.avatar === 15);
  await host.lobby({ op: 'abort' });
  expect(await host.lobby({ op: 'rematch' })).toEqual({ ok: true });
  await guest.waitFor(() => guest.room!.gamesPlayed === 2);
  expect(guest.me?.avatar).toBe(15);
  const invalidJoin = await fetch(`${base}/api/rooms/${host.code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Invalid', avatar: 24 }) });
  expect(invalidJoin.status).toBe(400);
});
