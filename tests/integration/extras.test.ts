import { describe, expect, inject, it } from 'vitest';
import { TestPlayer, expectOk, makeRoom, readyAll } from './client';
import { playGame } from './driver';
import { startServer } from './server';

const base = inject('baseUrl');

async function findThief(url: string) {
  const players = await makeRoom(url, 3);
  await readyAll(players);
  expectOk(await players[0]!.lobby({ op: 'start' }));
  for (const p of players) await p.waitFor(() => p.game?.status === 'playing');
  for (let step = 0; step < 100; step++) {
    const actor = players.find(p => p.playerId === players[0]!.game!.turn.playerId)!;
    const thief = actor.game!.hand.find(card => card.kind === 'thief');
    if (thief) {
      expectOk(await actor.act({ type: 'play', card: 'thief', cardId: thief.id }));
      for (const p of players) await p.waitFor(() => p.game!.turn.pending?.type === 'thief');
      return { players, actor };
    }
    const turn = actor.game!.turn.number;
    expectOk(await actor.act({ type: 'endTurn' }));
    for (const p of players) await p.waitFor(() => p.game!.turn.number > turn);
  }
  players.forEach(p => p.close());
  throw new Error('No Thief appeared in the full deck');
}

describe('table extras over real Node WebSockets', () => {
  it('broadcasts preset-only targeted reactions, with no game moves or room snapshots', async () => {
    const [host, guest] = await makeRoom(base, 2);
    try {
      const version = host!.room!.version;
      expectOk(await host!.request({ t: 'social', kind: 'sticker', preset: 'cat', targetId: guest!.playerId }, 'social-one'));
      await guest!.waitFor(() => guest!.received.some(r => r.msg.t === 'social'));
      const event = guest!.received.find(r => r.msg.t === 'social')!.msg;
      expect(event).toMatchObject({ t: 'social', event: { senderId: host!.playerId, targetId: guest!.playerId, kind: 'sticker', preset: 'cat' } });
      expect(host!.room!.version).toBe(version);
      expectOk(await host!.request({ t: 'social', kind: 'sticker', preset: 'cat', targetId: guest!.playerId }, 'social-one'));
      expect(await host!.request({ t: 'social', kind: 'phrase', preset: 'thanks' })).toEqual({ ok: false, error: 'social-rate-limited' });
      await new Promise(resolve => setTimeout(resolve, 2100));
      expectOk(await host!.request({ t: 'social', kind: 'phrase', preset: 'thanks' }));
      await guest!.waitFor(() => guest!.received.filter(r => r.msg.t === 'social').length === 2);
      expect(await host!.request({ t: 'social', kind: 'sticker', preset: '<script>bad</script>' })).toMatchObject({ ok: false, error: 'bad-request' });
      expect(await host!.request({ t: 'social', kind: 'sticker', preset: 'cat', targetId: 'stranger' })).toMatchObject({ ok: false, error: 'bad-request' });
    } finally { host!.close(); guest!.close(); }
  });

  it('lets the Thief choose exactly one anonymous back per opponent and rejects duplicate picks', async () => {
    const { players, actor } = await findThief(base);
    try {
      const moves = actor.game!.turn.movesUsed;
      const handCount = actor.game!.hand.length;
      const original = actor.game!.turn.pending!;
      const victims = (original.remaining?.length ?? 0) + 1;
      let selected = 0;
      while (actor.game!.turn.pending?.type === 'thief') {
        const pending = actor.game!.turn.pending;
        const target = players.find(p => p.playerId === pending.targetId)!;
        const version = actor.room!.version;
        expect(pending.targetHand).toBeUndefined();
        for (const p of players.filter(p => p !== actor)) {
          await p.waitFor(() => p.room!.version >= version);
          expect(p.game!.turn.pending?.choices).toBeUndefined();
        }
        const choiceId = pending.choices![0]!;
        expect(await actor.act({ type: 'thiefTake', targetId: pending.targetId, choiceId: target.game!.hand[0]!.id })).toMatchObject({ ok: false, error: 'invalid-thief-choice' });
        expectOk(await actor.act({ type: 'thiefTake', targetId: pending.targetId, choiceId }));
        selected++;
        expect(actor.game!.hand.length).toBe(handCount + selected);
        expect(actor.game!.turn.movesUsed).toBe(moves);
        expect((await actor.act({ type: 'thiefTake', targetId: pending.targetId, choiceId })).ok).toBe(false);
      }
      expect(selected).toBe(victims);
    } finally { players.forEach(p => p.close()); }
  });

  it('finishes remaining Thief choices on timeout without getting stuck', async () => {
    const { players, actor } = await findThief(base);
    try {
      const expected = actor.game!.hand.length + (actor.game!.turn.pending!.remaining?.length ?? 0) + 1;
      await actor.waitFor(() => actor.game!.turn.pending === null, 12000, 'automatic Thief completion');
      expect(actor.game!.hand.length).toBe(expected);
    } finally { players.forEach(p => p.close()); }
  });

  it('records completed games once and accumulates rematches; aborted games are excluded', async () => {
    const players = await makeRoom(base, 2);
    const host = players[0]!;
    try {
      await readyAll(players);
      expectOk(await host.lobby({ op: 'start' }));
      for (const p of players) await p.waitFor(() => p.game?.status === 'playing');
      await playGame(players, ['collector', 'aggressive']);
      const first = structuredClone(host.room!.tableScores!);
      expect(first).toHaveLength(2);
      expect(first.every(score => score.games === 1)).toBe(true);
      for (const score of first) expect(score.wins).toBe(host.game!.result!.winnerIds.includes(score.playerId) ? 1 : 0);
      const again = new TestPlayer(base, host.name, host.code, host.playerId, host.token);
      await again.connect();
      expect(again.room!.tableScores).toEqual(first);
      again.close();
      expectOk(await host.lobby({ op: 'rematch' }));
      for (const p of players) await p.waitFor(() => p.game?.status === 'playing');
      await playGame(players, ['collector', 'aggressive']);
      expect(host.room!.tableScores!.every(score => score.games === 2)).toBe(true);
      const beforeAbort = structuredClone(host.room!.tableScores);
      expectOk(await host.lobby({ op: 'rematch' }));
      expectOk(await host.lobby({ op: 'abort' }));
      expect(host.room!.tableScores).toEqual(beforeAbort);
    } finally { players.forEach(p => p.close()); }
  });

  it('keeps the same Thief choice handles and seat tokens across a local process restart', async () => {
    let server = await startServer(8794);
    let players: TestPlayer[] = [];
    const again: TestPlayer[] = [];
    try {
      const initial = await findThief(server.url);
      players = initial.players;
      const pending = structuredClone(initial.actor.game!.turn.pending);
      await server.stop();
      players.forEach(p => p.drop());
      server = await startServer(8794);
      for (const p of [initial.actor, ...players.filter(p => p !== initial.actor)]) {
        const client = new TestPlayer(server.url, p.name, p.code, p.playerId, p.token);
        again.push(client);
        await client.connect();
      }
      expect(again[0]!.game!.turn.pending).toEqual(pending);
      expectOk(await again[0]!.act({ type: 'thiefTake', targetId: pending!.targetId, choiceId: pending!.choices![0]! }));
    } finally { players.forEach(p => p.close()); again.forEach(p => p.close()); await server.stop(); }
  });
});
