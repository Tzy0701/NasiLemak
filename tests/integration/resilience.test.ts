import { describe, expect, inject, it } from 'vitest';
import { isTradeable } from '../../src/game/cards/catalog';
import { TestPlayer, expectOk, makeRoom, readyAll } from './client';
import { auditHiddenInfo, playGame } from './driver';

const base = inject('baseUrl');

async function startedRoom(n: number, mode: 'classic-base' | 'classic-rendang' = 'classic-base') {
  const players = await makeRoom(base, n);
  expectOk(await players[0]!.lobby({ op: 'setMode', mode }));
  await readyAll(players);
  expectOk(await players[0]!.lobby({ op: 'start' }));
  for (const p of players) await p.waitFor(() => p.game?.status === 'playing', 5000, 'start');
  return players;
}

describe('disconnects, refreshes and reconnection', () => {
  it('freezes the game when all humans disconnect, then resumes the same turn and hands', async () => {
    const players = await startedRoom(3);
    const current = players.find((p) => p.playerId === p.game!.turn.playerId)!;
    const before = players.map((p) => ({ id: p.playerId, hand: p.game!.hand.map((c) => c.id).sort(), turn: p.game!.turn.number }));
    const reconnected: TestPlayer[] = [];
    try {
      players.forEach((p) => p.drop());
      // Longer than both FAST_TIMERS host-transfer and AFK deadlines.
      await new Promise((resolve) => setTimeout(resolve, 6_000));
      for (const p of [current, ...players.filter((p) => p !== current)]) {
        const again = new TestPlayer(base, p.name, p.code, p.playerId, p.token);
        reconnected.push(again);
        await again.connect();
        const expected = before.find((x) => x.id === p.playerId)!;
        expect(again.game!.turn.number).toBe(expected.turn);
        expect(again.game!.hand.map((c) => c.id).sort()).toEqual(expected.hand);
        expect(again.game!.log.some((e) => e.key === 'turn-skipped-afk')).toBe(false);
      }
      auditHiddenInfo(reconnected);
      expectOk(await reconnected[0]!.act({ type: 'endTurn' }));
      await reconnected[1]!.waitFor(() => reconnected[1]!.game!.turn.number > before[0]!.turn, 5_000, 'play resumes');
    } finally {
      players.forEach((p) => p.close());
      reconnected.forEach((p) => p.close());
    }
  });

  it('pauses a bot game when its only human leaves and continues when they reconnect', async () => {
    const host = await TestPlayer.create(base, 'Pause bot game');
    let again: TestPlayer | null = null;
    try {
      expectOk(await host.lobby({ op: 'addBot', bot: 'collector' }));
      expectOk(await host.lobby({ op: 'start' }));
      await host.waitFor(() => host.game?.status === 'playing' && host.game.turn.playerId === host.playerId, 15_000, 'human turn');
      const before = { turn: host.game!.turn.number, hand: host.game!.hand.map((c) => c.id).sort(), draw: host.game!.drawCount };
      host.drop();
      await new Promise((resolve) => setTimeout(resolve, 6_000));
      again = new TestPlayer(base, host.name, host.code, host.playerId, host.token);
      await again.connect();
      expect(again.game!.turn.number).toBe(before.turn);
      expect(again.game!.hand.map((c) => c.id).sort()).toEqual(before.hand);
      expect(again.game!.drawCount).toBe(before.draw);
      expectOk(await again.act({ type: 'endTurn' }));
      const resumed = again;
      await resumed.waitFor(() => resumed.game!.turn.number >= before.turn + 2 && resumed.game!.turn.playerId === resumed.playerId, 15_000, 'bot resumes');
    } finally {
      host.close();
      again?.close();
    }
  });

  it('freezes a pending trade while everybody is away', async () => {
    const players = await startedRoom(2);
    const current = players.find((p) => p.playerId === p.game!.turn.playerId)!;
    const other = players.find((p) => p !== current)!;
    const reconnected: TestPlayer[] = [];
    try {
      const offer = current.game!.hand.find((c) => isTradeable(c.kind));
      expect(offer).toBeDefined();
      expectOk(await current.act({ type: 'proposeTrade', targetId: other.playerId, offerCardIds: [offer!.id], wantKinds: { nasi: 1 } }));
      await other.waitFor(() => other.game!.turn.trade?.awaitingId === other.playerId, 5_000, 'trade seen');
      const tradeId = other.game!.turn.trade!.id;
      players.forEach((p) => p.drop());
      // Longer than the trade timeout (5s) and disconnect grace (1.5s).
      await new Promise((resolve) => setTimeout(resolve, 6_000));
      for (const p of [other, current]) {
        const again = new TestPlayer(base, p.name, p.code, p.playerId, p.token);
        reconnected.push(again);
        await again.connect();
        expect(again.game!.turn.trade?.id).toBe(tradeId);
      }
      expectOk(await reconnected[0]!.act({ type: 'respondTrade', tradeId, response: 'reject' }));
      await reconnected[1]!.waitFor(() => reconnected[1]!.game!.turn.trade === null, 5_000, 'trade resumes');
    } finally {
      players.forEach((p) => p.close());
      reconnected.forEach((p) => p.close());
    }
  });

  it('expires a fully disconnected lobby after the reconnect window', async () => {
    const players = await makeRoom(base, 2);
    const code = players[0]!.code;
    players.forEach((p) => p.drop());
    // FAST_TIMERS uses a 30s reconnect window; production uses 30 minutes.
    await new Promise((resolve) => setTimeout(resolve, 31_000));
    expect((await fetch(`${base}/api/rooms/${code}`)).status).toBe(404);
    const host = players[0]!;
    const again = new TestPlayer(base, host.name, code, host.playerId, host.token);
    await expect(again.connect()).rejects.toThrow('ws error');
    again.close();
  });

  it('preserves the remaining custom turn timer across an all-human disconnect', async () => {
    const players = await makeRoom(base, 2);
    const reconnected: TestPlayer[] = [];
    try {
      expectOk(await players[0]!.lobby({ op: 'setMode', mode: 'custom' }));
      expectOk(await players[0]!.lobby({ op: 'setCustomConfig', config: { turnTimerSec: 20 } }));
      await readyAll(players);
      expectOk(await players[0]!.lobby({ op: 'start' }));
      for (const p of players) await p.waitFor(() => p.game?.status === 'playing', 5_000, 'start timer game');
      const current = players.find((p) => p.playerId === p.game!.turn.playerId)!;
      const deadline = current.game!.turn.deadline!;
      const turn = current.game!.turn.number;
      players.forEach((p) => p.drop());
      await new Promise((resolve) => setTimeout(resolve, 6_000));
      for (const p of [current, ...players.filter((p) => p !== current)]) {
        const again = new TestPlayer(base, p.name, p.code, p.playerId, p.token);
        reconnected.push(again);
        await again.connect();
        expect(again.game!.turn.number).toBe(turn);
        expect(again.game!.turn.deadline! - deadline).toBeGreaterThan(5_000);
        expect(again.game!.turn.deadline! - Date.now()).toBeGreaterThan(15_000);
      }
    } finally {
      players.forEach((p) => p.close());
      reconnected.forEach((p) => p.close());
    }
  });

  it('a player who reconnects (page refresh) gets the same seat, same hand, same game', async () => {
    const players = await startedRoom(3);
    // Play a few actions first.
    await playGame(players, ['collector', 'trader', 'aggressive'], { maxActions: 12, stopWhen: () => (players[0]!.game?.turn.number ?? 0) >= 3 });
    // Drop someone who is not on turn (an absent active player gets AFK-skipped).
    const idx = players.findIndex((p) => p.playerId !== players[0]!.game!.turn.playerId);
    const p1 = players[idx]!;
    const handBefore = p1.game!.hand.map((c) => c.id).sort();
    const turnBefore = p1.game!.turn.number;
    const watcher = players.find((p) => p !== p1)!;
    p1.drop();
    await watcher.waitFor(() => !watcher.room!.members.find((m) => m.id === p1.playerId)!.connected, 5000, 'seen offline');
    // "Refresh": a brand-new socket with the same stored token.
    const again = new TestPlayer(base, p1.name, p1.code, p1.playerId, p1.token);
    await again.connect();
    expect(again.game!.hand.map((c) => c.id).sort()).toEqual(handBefore);
    expect(again.game!.turn.number).toBe(turnBefore);
    expect(again.game!.youId).toBe(p1.playerId);
    await watcher.waitFor(() => watcher.room!.members.find((m) => m.id === p1.playerId)!.connected, 5000, 'seen online');
    players[idx] = again;
    await playGame(players, ['collector', 'trader', 'aggressive']);
    expect(again.game!.status).toBe('finished');
    auditHiddenInfo(players);
    players.forEach((p) => p.close());
  });

  it('the others keep playing while someone is offline: their turn is skipped after the AFK delay', async () => {
    const players = await startedRoom(3);
    const current = players.find((p) => p.playerId === p.game!.turn.playerId)!;
    const watcher = players.find((p) => p !== current)!;
    const turn = watcher.game!.turn.number;
    current.drop();
    await watcher.waitFor(() => watcher.game!.turn.number > turn, 20_000, 'afk skip');
    expect(watcher.game!.log.some((e) => e.key === 'turn-skipped-afk')).toBe(true);
    players.forEach((p) => p.close());
  });

  it('a pending trade is cancelled if the other side disconnects', async () => {
    const players = await startedRoom(2);
    const current = players.find((p) => p.playerId === p.game!.turn.playerId)!;
    const other = players.find((p) => p !== current)!;
    const offer = current.game!.hand.find((c) => isTradeable(c.kind));
    if (!offer) return; // extremely unlikely with 9 cards; nothing to test
    expectOk(await current.act({ type: 'proposeTrade', targetId: other.playerId, offerCardIds: [offer.id], wantKinds: { nasi: 1 } }));
    await other.waitFor(() => other.game!.turn.trade?.awaitingId === other.playerId, 5000, 'offer seen');
    // Only the two parties see the offer contents.
    expect(other.game!.turn.trade!.offerCards![0]!.id).toBe(offer.id);
    other.drop();
    await current.waitFor(() => current.game!.turn.trade === null, 15_000, 'trade cancelled');
    expect(current.game!.log.some((e) => e.key === 'trade-expired-disconnect')).toBe(true);
    // The trade cost no move.
    expect(current.game!.turn.movesUsed).toBe(0);
    players.forEach((p) => p.close());
  });

  it('full trade negotiation over the network: propose → counter → accept', async () => {
    const players = await startedRoom(3);
    const a = players.find((p) => p.playerId === p.game!.turn.playerId)!;
    const b = players.find((p) => p !== a)!;
    const c = players.find((p) => p !== a && p !== b)!;
    const offer = a.game!.hand.find((x) => isTradeable(x.kind));
    const bGive = b.game!.hand.find((x) => isTradeable(x.kind));
    if (!offer || !bGive) return;
    expectOk(await a.act({ type: 'proposeTrade', targetId: b.playerId, offerCardIds: [offer.id], wantKinds: { [bGive.kind]: 1 } }));
    await c.waitFor(() => c.game!.turn.trade !== null, 5000, 'bystander sees trade');
    expect(c.game!.turn.trade!.offerCards).toBeUndefined();
    await b.waitFor(() => b.game!.turn.trade?.awaitingId === b.playerId, 5000, 'b sees');
    expectOk(await b.act({ type: 'counterTrade', tradeId: b.game!.turn.trade!.id, offerCardIds: [bGive.id], wantKinds: { [offer.kind]: 1 } }));
    await a.waitFor(() => a.game!.turn.trade?.awaitingId === a.playerId, 5000, 'a sees counter');
    expectOk(await a.act({ type: 'respondTrade', tradeId: a.game!.turn.trade!.id, response: 'accept' }));
    await b.waitFor(() => b.game!.hand.some((x) => x.id === offer.id), 5000, 'b got card');
    expect(a.game!.hand.some((x) => x.id === bGive.id)).toBe(true);
    expect(a.game!.turn.movesUsed).toBe(1);
    // Bystander never saw the concrete cards.
    for (const r of c.received) {
      if (r.msg.t !== 'state' || !r.msg.game) continue;
      expect(r.msg.game.hand.some((x) => x.id === offer.id || x.id === bGive.id)).toBe(false);
      expect(r.msg.game.turn.trade?.offerCards).toBeUndefined();
    }
    players.forEach((p) => p.close());
  });

  it('a player who leaves mid-game is removed; the game continues with the rest', async () => {
    const players = await startedRoom(3);
    const leaver = players[2]!;
    expectOk(await leaver.lobby({ op: 'leave' }));
    await players[0]!.waitFor(() => players[0]!.game!.players.find((p) => p.id === leaver.playerId)!.gone, 5000, 'gone');
    const rest = players.slice(0, 2);
    await playGame(rest, ['collector', 'trader']);
    expect(rest[0]!.game!.status).toBe('finished');
    expect(rest[0]!.game!.result!.winnerIds).not.toContain(leaver.playerId);
    rest.forEach((p) => p.close());
  });
});
