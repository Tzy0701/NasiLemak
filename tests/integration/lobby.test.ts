import { describe, expect, inject, it } from 'vitest';
import { OFFICIAL_BASE } from '../../src/game/rules/config';
import { TestPlayer, expectOk, makeRoom, readyAll } from './client';

const base = inject('baseUrl');

async function post(path: string, body: unknown) {
  return fetch(`${base}${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

describe('rooms and lobby', () => {
  it('create → join by code → room info, host indicator, ready states', async () => {
    const [host, guest] = await makeRoom(base, 2);
    expect(host!.code).toMatch(/^[A-Z2-9]{6}$/);
    const info = await (await fetch(`${base}/api/rooms/${host!.code}`)).json();
    expect(info).toMatchObject({ code: host!.code, status: 'lobby', players: 2, maxPlayers: 7 });
    expect(host!.room!.hostId).toBe(host!.playerId);
    expect(guest!.room!.members.find((m) => m.id === host!.playerId)!.isHost).toBe(true);
    expect(guest!.me!.ready).toBe(false);
    expectOk(await guest!.lobby({ op: 'setReady', ready: true }));
    await host!.waitFor(() => host!.room!.members.find((m) => m.id === guest!.playerId)!.ready, 5000, 'ready');
    host!.close();
    guest!.close();
  });

  it('rejects bad names, unknown rooms, and room-code junk', async () => {
    expect((await post('/api/rooms', { name: '   ' })).status).toBe(400);
    expect((await post('/api/rooms', { name: 'x'.repeat(5000) })).status).toBe(400);
    expect((await post('/api/rooms/ZZZZZZ/join', { name: 'Bob' })).status).toBe(404);
    expect((await fetch(`${base}/api/rooms/..%2F..%2Fetc`)).status).toBe(404);
    expect((await fetch(`${base}/api/rooms/abc`)).status).toBe(404);
  });

  it('names are sanitised and made unique', async () => {
    const host = await TestPlayer.create(base, '  Ah\u0000 Boy  ');
    const twin = await TestPlayer.join(base, host.code, 'ah boy');
    expect(host.me!.name).toBe('Ah Boy');
    expect(twin.me!.name).toBe('ah boy 2');
    host.close();
    twin.close();
  });

  it('only the host can change settings, start, kick, add bots', async () => {
    const [host, guest] = await makeRoom(base, 2);
    for (const op of [
      { op: 'setMode', mode: 'custom' },
      { op: 'start' },
      { op: 'kick', playerId: host!.playerId },
      { op: 'addBot', bot: 'random' },
      { op: 'setCustomConfig', config: {} },
      { op: 'transferHost', playerId: guest!.playerId },
    ] as const) {
      expect(await guest!.lobby(op as never)).toEqual({ ok: false, error: 'host-only' });
    }
    host!.close();
    guest!.close();
  });

  it('start requires everyone ready and a legal player count for the mode', async () => {
    const [host, guest] = await makeRoom(base, 2);
    expect(await host!.lobby({ op: 'start' })).toEqual({ ok: false, error: 'players-not-ready' });
    await readyAll([host!, guest!]);
    expectOk(await host!.lobby({ op: 'setMode', mode: 'classic-rendang' })); // resets ready
    await readyAll([host!, guest!]);
    expect(await host!.lobby({ op: 'start' })).toEqual({ ok: false, error: 'bad-player-count' });
    host!.close();
    guest!.close();
  });

  it('official modes cannot be modified: custom edits only affect Custom mode', async () => {
    const [host] = await makeRoom(base, 1);
    expectOk(await host!.lobby({ op: 'setCustomConfig', config: { handSize: 3, actions: { fly: 15 } } }));
    await host!.waitFor(() => host!.room!.version > 2, 3000, 'v');
    expect(host!.room!.mode).toBe('classic-base');
    expect(host!.room!.config.handSize).toBe(OFFICIAL_BASE.handSize);
    expect(host!.room!.config.actions.fly).toBe(OFFICIAL_BASE.actions.fly);
    expectOk(await host!.lobby({ op: 'setMode', mode: 'custom' }));
    await host!.waitFor(() => host!.room!.mode === 'custom', 3000, 'mode');
    expect(host!.room!.config.handSize).toBe(3);
    expect(host!.room!.config.actions.fly).toBe(15);
    expectOk(await host!.lobby({ op: 'applyPreset', preset: 'official-base' }));
    await host!.waitFor(() => host!.room!.config.handSize === 7, 3000, 'reset');
    host!.close();
  });

  it('kick removes a player and closes their connection', async () => {
    const [host, guest] = await makeRoom(base, 2);
    expectOk(await host!.lobby({ op: 'kick', playerId: guest!.playerId }));
    await guest!.waitFor(() => guest!.kicked === 'kicked', 5000, 'kicked');
    await host!.waitFor(() => host!.room!.members.length === 1, 5000, 'removed');
    // The kicked token no longer works.
    const again = new TestPlayer(base, 'ghost', guest!.code, guest!.playerId, guest!.token);
    await again.connect(guest!.token).catch(() => undefined);
    await again.waitFor(() => again.errors.includes('bad-token'), 5000, 'bad token');
    host!.close();
  });

  it('host leaving transfers host to another player; last human leaving closes the room', async () => {
    const [host, guest] = await makeRoom(base, 2);
    expectOk(await host!.lobby({ op: 'leave' }));
    await guest!.waitFor(() => guest!.room!.hostId === guest!.playerId, 5000, 'host transfer');
    expect(guest!.room!.members).toHaveLength(1);
    expectOk(await guest!.lobby({ op: 'leave' }));
    const r = await fetch(`${base}/api/rooms/${guest!.code}`);
    expect(r.status).toBe(404);
  });

  it('host transfer by the host, and automatic transfer when the host disconnects', async () => {
    const [host, guest, third] = await makeRoom(base, 3);
    expectOk(await host!.lobby({ op: 'transferHost', playerId: guest!.playerId }));
    await third!.waitFor(() => third!.room!.hostId === guest!.playerId, 5000, 'manual transfer');
    guest!.drop();
    // FAST_TIMERS: host transfer after ~2.5s of disconnection.
    await third!.waitFor(() => third!.room!.hostId !== guest!.playerId, 15_000, 'auto transfer');
    expect([host!.playerId, third!.playerId]).toContain(third!.room!.hostId);
    host!.close();
    third!.close();
  });

  it('room is limited to 7 players and closed to new joins during a game', async () => {
    const players = await makeRoom(base, 7);
    const r = await post(`/api/rooms/${players[0]!.code}/join`, { name: 'Eighth' });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe('room-full');
    const host = players[0]!;
    expectOk(await host.lobby({ op: 'kick', playerId: players[6]!.playerId }));
    expectOk(await host.lobby({ op: 'setMode', mode: 'classic-rendang' }));
    await readyAll(players.slice(0, 6));
    expectOk(await host.lobby({ op: 'start' }));
    const late = await post(`/api/rooms/${host.code}/join`, { name: 'Late' });
    expect(late.status).toBe(409);
    expect((await late.json()).error).toBe('game-in-progress');
    players.forEach((p) => p.close());
  });
});
