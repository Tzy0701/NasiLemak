import { describe, expect, inject, it } from 'vitest';
import { TestPlayer, expectOk, makeRoom, readyAll } from './client';
import { assertConsistent } from './driver';

const base = inject('baseUrl');

async function startedRoom(n: number) {
  const players = await makeRoom(base, n);
  await readyAll(players);
  expectOk(await players[0]!.lobby({ op: 'start' }));
  for (const p of players) await p.waitFor(() => p.game?.status === 'playing', 5000, 'start');
  const current = players.find((p) => p.playerId === p.game!.turn.playerId)!;
  const others = players.filter((p) => p !== current);
  return { players, current, others };
}

describe('server authority and abuse resistance', () => {
  it('rejects actions from players whose turn it is not', async () => {
    const { players, others } = await startedRoom(3);
    for (const o of others) {
      expect(await o.act({ type: 'endTurn' })).toEqual({ ok: false, error: 'not-your-turn' });
    }
    players.forEach((p) => p.close());
  });

  it('rejects stale intents (wrong turn number)', async () => {
    const { players, current } = await startedRoom(2);
    expect(await current.act({ type: 'endTurn' }, current.game!.turn.number - 1)).toEqual({ ok: false, error: 'stale-state' });
    expect(await current.act({ type: 'endTurn' }, 999)).toEqual({ ok: false, error: 'stale-state' });
    players.forEach((p) => p.close());
  });

  it('a duplicated request id is executed only once', async () => {
    const { players, current } = await startedRoom(2);
    const turn = current.game!.turn.number;
    const a = await current.act({ type: 'endTurn' }, turn, 'dup-1');
    const b = await current.act({ type: 'endTurn' }, turn, 'dup-1');
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    await current.waitFor(() => current.game!.turn.number === turn + 1, 3000, 'turn');
    await new Promise((r) => setTimeout(r, 300));
    expect(current.game!.turn.number).toBe(turn + 1);
    players.forEach((p) => p.close());
  });

  it('simultaneous actions: only the legal one wins, all clients converge', async () => {
    const { players, current, others } = await startedRoom(4);
    const turn = current.game!.turn.number;
    const results = await Promise.all([
      current.act({ type: 'endTurn' }, turn),
      ...others.map((o) => o.act({ type: 'endTurn' }, turn)),
      current.act({ type: 'endTurn' }, turn),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const v = Math.max(...players.map((p) => p.room!.version));
    for (const p of players) await p.waitFor(() => p.room!.version >= v, 5000, 'converge');
    assertConsistent(players);
    players.forEach((p) => p.close());
  });

  it('cannot play cards that are not in your hand or forge targets', async () => {
    const { players, current, others } = await startedRoom(2);
    const victimCard = (others[0]!.game!.hand[0] ?? { id: 'c1' }).id;
    expect(await current.act({ type: 'make', cardIds: [victimCard, 'c2', 'c3', 'c4', 'c5'] })).toMatchObject({ ok: false });
    expect(await current.act({ type: 'play', cardId: victimCard, card: 'thief' })).toEqual({ ok: false, error: 'card-not-in-hand' });
    expect(await current.act({ type: 'officerTake', cardIds: [victimCard] })).toEqual({ ok: false, error: 'nothing-pending' });
    expect(await current.act({ nonsense: true } as never)).toEqual({ ok: false, error: 'bad-request' });
    players.forEach((p) => p.close());
  });

  it('WebSocket requires a valid token; unauthenticated messages are refused', async () => {
    const [host] = await makeRoom(base, 1);
    const bad = new TestPlayer(base, 'intruder', host!.code, 'x', 'not-a-real-token');
    await bad.connect('not-a-real-token').catch(() => undefined);
    await bad.waitFor(() => bad.errors.includes('bad-token'), 5000, 'bad token');
    expect(bad.room).toBeNull();

    const ws = new WebSocket(base.replace('http', 'ws') + `/api/rooms/${host!.code}/ws`);
    const got: string[] = [];
    await new Promise<void>((res) => {
      ws.onopen = () => ws.send(JSON.stringify({ t: 'lobby', id: 'x', body: { op: 'start' } }));
      ws.onmessage = (e) => got.push(String(e.data));
      ws.onclose = () => res();
      setTimeout(res, 4000);
    });
    expect(got.join()).toContain('auth-required');
    expect(got.join()).not.toContain('"t":"state"');
    host!.close();
  });

  it('rejects malformed and oversized messages without crashing the room', async () => {
    const [host] = await makeRoom(base, 1);
    host!.sendRaw('{not json');
    host!.sendRaw(JSON.stringify({ t: 'lobby', id: 'a', body: { op: 'setReady', ready: true }, pad: 'x'.repeat(10000) }));
    host!.sendRaw(JSON.stringify({ t: 'what' }));
    await host!.waitFor(() => host!.errors.filter((e) => e === 'bad-message').length >= 3, 5000, 'errors');
    expectOk(await host!.lobby({ op: 'setReady', ready: true }));
    host!.close();
  });

  it('floods are rate-limited (and answered), the connection stays usable', async () => {
    const [host] = await makeRoom(base, 1);
    const acks = await Promise.all(Array.from({ length: 80 }, () => host!.lobby({ op: 'setReady', ready: true })));
    expect(acks.some((a) => a.error === 'rate-limited')).toBe(true);
    await new Promise((r) => setTimeout(r, 2500));
    expectOk(await host!.lobby({ op: 'setReady', ready: false }));
    host!.close();
  });

  it('room codes use a large unambiguous space', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const p = await TestPlayer.create(base, `C${i}`);
      codes.add(p.code);
      expect(p.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
      expectOk(await p.lobby({ op: 'leave' }));
    }
    expect(codes.size).toBe(8);
  });
});
