import { describe, expect, inject, it } from 'vitest';
import type { BotKind } from '../../src/game/bots/bots';
import { TestPlayer, expectOk, makeRoom, readyAll } from './client';
import { assertConsistent, auditHiddenInfo, playGame } from './driver';

const base = inject('baseUrl');
const MIX: BotKind[] = ['collector', 'trader', 'aggressive', 'random', 'collector', 'trader', 'aggressive'];

async function fullGame(n: number, mode: 'classic-base' | 'classic-rendang' | 'custom', setup?: (host: TestPlayer) => Promise<void>) {
  const players = await makeRoom(base, n);
  const host = players[0]!;
  expectOk(await host.lobby({ op: 'setMode', mode }));
  if (setup) await setup(host);
  await readyAll(players);
  expectOk(await host.lobby({ op: 'start' }));
  for (const p of players) await p.waitFor(() => p.game?.status === 'playing', 10_000, 'game start');
  // Everyone was dealt their own hand.
  for (const p of players) expect(p.game!.hand.length).toBeGreaterThanOrEqual(p.game!.config.handSize);
  const stats = await playGame(players, MIX.slice(0, n));
  for (const p of players) await p.waitFor(() => p.game?.status === 'finished', 10_000, 'finish broadcast');
  assertConsistent(players);
  const audited = auditHiddenInfo(players);
  expect(audited).toBeGreaterThan(n * 10);
  const result = host.game!.result!;
  expect(result.winnerIds.length).toBeGreaterThan(0);
  // Every client sees the same winner and the fully revealed standings.
  for (const p of players) {
    expect(p.game!.result!.winnerIds).toEqual(result.winnerIds);
    expect(Object.keys(p.game!.result!.revealed)).toHaveLength(n);
  }
  if (result.reason === 'target') {
    const w = result.standings.find((s) => s.playerId === result.winnerIds[0])!;
    expect(w.packs).toBeGreaterThanOrEqual(host.game!.config.targetPacks);
  }
  return { players, stats, result };
}

describe('complete online games over real WebSockets', () => {
  it('2-player Classic Base game, then Rematch', async () => {
    const { players, stats } = await fullGame(2, 'classic-base');
    expect(stats.actions).toBeGreaterThan(5);
    const host = players[0]!;
    const firstHand = players[1]!.game!.hand.map((c) => c.id).join();
    expectOk(await host.lobby({ op: 'rematch' }));
    for (const p of players) await p.waitFor(() => p.room?.gamesPlayed === 2 && p.game?.status === 'playing', 10_000, 'rematch');
    expect(players[1]!.game!.turn.number).toBe(1);
    expect(players[1]!.game!.hand.map((c) => c.id).join()).not.toBe(firstHand);
    await playGame(players, ['trader', 'aggressive']);
    expect(host.game!.status).toBe('finished');
    players.forEach((p) => p.close());
  });

  it('4-player Classic Base game', async () => {
    const { players } = await fullGame(4, 'classic-base');
    players.forEach((p) => p.close());
  });

  it('5-player Classic Rendang Expansion game (Crows + Si Oyen)', async () => {
    const { players } = await fullGame(5, 'classic-rendang');
    const g = players[0]!.game!;
    expect(g.config.crows).toBe(2);
    expect(g.config.rendang).toBe(6);
    players.forEach((p) => p.close());
  });

  it('6-player online game (Rendang) with everyone on separate connections', async () => {
    const { players } = await fullGame(6, 'classic-rendang');
    expect(new Set(players.map((p) => p.playerId)).size).toBe(6);
    players.forEach((p) => p.close());
  });

  it('7-player Custom House Rules game (Recommended Balanced preset + tweaks)', async () => {
    const { players } = await fullGame(7, 'custom', async (host) => {
      expectOk(await host.lobby({ op: 'applyPreset', preset: 'balanced' }));
      await host.waitFor(() => host.room!.config.nlTwoPack === 9, 5000, 'preset');
      const cfg = host.room!.config;
      expectOk(await host.lobby({ op: 'setCustomConfig', config: { ...cfg, movesPerTurn: 4, targetPacks: 6 } }));
      await host.waitFor(() => host.room!.config.movesPerTurn === 4, 5000, 'config');
    });
    const g = players[0]!.game!;
    expect(g.mode).toBe('custom');
    expect(g.config.movesPerTurn).toBe(4);
    expect(g.config.targetPacks).toBe(6);
    players.forEach((p) => p.close());
  });

  it('long game (alternative ending) runs until the Nasi Lemak pile is empty', async () => {
    const { players, result } = await fullGame(3, 'classic-base', async (host) => {
      expectOk(await host.lobby({ op: 'setLength', length: 'long' }));
    });
    expect(result.reason).toBe('nl-depleted');
    expect(players[0]!.game!.nlPileCount).toBe(0);
    players.forEach((p) => p.close());
  });

  it('host can fill seats with server-side bots that play by themselves', async () => {
    const host = await TestPlayer.create(base, 'Solo');
    expectOk(await host.lobby({ op: 'setMode', mode: 'classic-rendang' }));
    for (const b of ['collector', 'trader', 'aggressive'] as const) expectOk(await host.lobby({ op: 'addBot', bot: b }));
    await host.waitFor(() => host.room!.members.length === 4, 5000, 'bots');
    expectOk(await host.lobby({ op: 'start' }));
    await host.waitFor(() => host.game?.status === 'playing', 5000, 'start');
    await playGame([host], ['collector']);
    expect(host.game!.status).toBe('finished');
    host.close();
  });
});
