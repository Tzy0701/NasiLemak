import { expect } from 'vitest';
import { type BotKind, botDecide } from '../../src/game/bots/bots';
import { seedFromNumber } from '../../src/game/rng';
import type { GameAction } from '../../src/game/types';
import type { TestPlayer } from './client';

export interface PlayStats {
  actions: number;
  rejected: string[];
  winners: string[];
}

function freshest(players: TestPlayer[]): TestPlayer {
  return players.reduce((a, b) => ((b.room?.version ?? 0) > (a.room?.version ?? 0) ? b : a));
}

/**
 * Drive a game to the end. Every decision is made by the acting player's
 * bot using ONLY that player's own WebSocket view, and sent over that
 * player's own socket.
 */
export async function playGame(
  players: TestPlayer[],
  kinds: BotKind[],
  opts: { maxActions?: number; stopWhen?: () => boolean; seed?: number } = {},
): Promise<PlayStats> {
  const byId = new Map(players.map((p) => [p.playerId, p]));
  const rng = seedFromNumber(opts.seed ?? 99);
  const stats: PlayStats = { actions: 0, rejected: [], winners: [] };
  const max = opts.maxActions ?? 4000;
  while (stats.actions < max) {
    if (opts.stopWhen?.()) return stats;
    const ref = freshest(players);
    const g = ref.game;
    if (!g) throw new Error('no game');
    if (g.status === 'finished') {
      const finalVersion = ref.room!.version;
      // State broadcasts arrive on independent sockets. Seeing the winner on
      // one socket does not imply that every other player has received it yet.
      await Promise.all(players.filter((p) => p.ws?.readyState === WebSocket.OPEN).map((p) =>
        p.waitFor(() => (p.room?.version ?? 0) >= finalVersion && p.game?.status === 'finished', 10_000, 'final state broadcast'),
      ));
      stats.winners = g.result!.winnerIds;
      return stats;
    }
    const tr = g.turn.trade;
    const actorId = tr ? tr.awaitingId : g.turn.playerId;
    const actor = byId.get(actorId);
    const version = ref.room!.version;
    if (!actor || !actor.ws) {
      // Server-side bot or disconnected player: wait for the server to move on.
      await ref.waitFor(() => ref.room!.version > version, 20_000, 'server progress');
      continue;
    }
    await actor.waitFor(() => (actor.room?.version ?? 0) >= version, 10_000, 'sync');
    const view = actor.game!;
    if (view.status !== 'playing') continue;
    const kind = kinds[players.indexOf(actor)] ?? 'collector';
    const action: GameAction = botDecide(kind, view, rng) ?? { type: 'endTurn' };
    const res = await actor.act(action, view.turn.number);
    stats.actions++;
    if (!res.ok) {
      stats.rejected.push(`${kind}:${action.type}:${res.error}`);
      if (res.error === 'stale-state' || res.error === 'game-over') continue;
      if (res.error === 'rate-limited') {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      if (view.turn.trade && view.turn.trade.proposerId === actor.playerId) await actor.act({ type: 'cancelTrade', tradeId: view.turn.trade.id });
      else if (view.turn.trade) await actor.act({ type: 'respondTrade', tradeId: view.turn.trade.id, response: 'reject' });
      else await actor.act({ type: 'endTurn' }, view.turn.number);
    }
  }
  if (opts.maxActions !== undefined) return stats;
  throw new Error(`game did not finish within ${max} actions`);
}

/**
 * Cross-check every state message each player received: it must never
 * contain a card id that sat in ANOTHER player's hand at that version
 * (except the Officer peek / trade offer the rules explicitly allow), and
 * must never include opponents' Nasi Lemak values before the game ends.
 */
export function auditHiddenInfo(players: TestPlayer[]): number {
  const hands = new Map<number, Map<string, Set<string>>>();
  for (const p of players) {
    for (const r of p.received) {
      if (r.msg.t !== 'state' || !r.msg.game) continue;
      const v = r.msg.room.version;
      if (!hands.has(v)) hands.set(v, new Map());
      hands.get(v)!.set(p.playerId, new Set(r.msg.game.hand.map((c) => c.id)));
    }
  }
  let checked = 0;
  for (const p of players) {
    for (const r of p.received) {
      if (r.msg.t !== 'state' || !r.msg.game) continue;
      const g = r.msg.game;
      const allowed = new Set<string>();
      if (g.turn.pending?.targetHand) for (const c of g.turn.pending.targetHand) allowed.add(c.id);
      if (g.turn.trade?.offerCards) for (const c of g.turn.trade.offerCards) allowed.add(c.id);
      if (g.lastReveal) for (const c of g.lastReveal.cards) allowed.add(c.id);
      if (g.discardTop) allowed.add(g.discardTop.id);
      const idsInMsg = new Set([...r.raw.matchAll(/"id":"(c\d+)"/g)].map((m) => m[1]!));
      const at = hands.get(r.msg.room.version);
      if (at) {
        for (const [owner, ids] of at) {
          if (owner === p.playerId) continue;
          for (const id of ids) {
            if (idsInMsg.has(id) && !allowed.has(id)) {
              throw new Error(`${p.name} saw ${owner}'s card ${id} at version ${r.msg.room.version}`);
            }
          }
        }
      }
      if (g.status === 'playing') {
        for (const op of g.players) {
          if (op.id === p.playerId) continue;
          expect(op.packs).toBeUndefined();
          for (const nl of op.nasiLemak) expect(nl.packs).toBeUndefined();
        }
        expect((g as unknown as Record<string, unknown>).drawPile).toBeUndefined();
      }
      checked++;
    }
  }
  return checked;
}

/** All players must agree on the public state of the final version. */
export function assertConsistent(players: TestPlayer[]) {
  const versions = players.map((p) => p.room!.version);
  const v = Math.max(...versions);
  const pub = (p: TestPlayer) => {
    const g = p.game!;
    return JSON.stringify({
      players: g.players.map((x) => ({ id: x.id, hand: x.handCount, nl: x.nasiLemak.map((n) => [n.id, n.hasFly]), crow: x.crow })),
      draw: g.drawCount,
      discard: g.discardCount,
      nl: g.nlPileCount,
      turn: [g.turn.playerId, g.turn.number, g.turn.movesUsed],
      status: g.status,
      result: g.result?.winnerIds,
    });
  };
  const atLatest = players.filter((p) => p.room!.version === v);
  const first = pub(atLatest[0]!);
  for (const p of atLatest) expect(pub(p)).toBe(first);
}
