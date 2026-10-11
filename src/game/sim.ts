/**
 * Headless full-game simulation used by tests and scripts/simulate.ts.
 */
import { type BotKind, botDecide } from './bots/bots';
import type { GameConfig, GameMode } from './rules/config';
import { applyAction, createGame } from './rules/engine';
import { type RngState, seedFromNumber } from './rng';
import type { GameState } from './types';
import { projectGame } from './view';

export interface SimOptions {
  mode: GameMode;
  config: GameConfig;
  bots: BotKind[];
  seed: number;
  /** Safety valve: abort the game after this many turns. */
  maxTurns?: number;
  /** Called after each successful action (for invariant checks in tests). */
  onStep?: (state: GameState) => void;
}

export interface SimResult {
  finished: boolean;
  stalled: boolean;
  turns: number;
  rounds: number;
  winners: number[];
  reason: string | null;
  packs: number[];
  firstSeat: number;
  reshuffles: number;
  tradesDone: number;
  tradesProposed: number;
  fliesPlayed: number;
  crowTurnsBlocked: number;
  makeBlockedByShortage: number;
  errors: string[];
  state: GameState;
}

export function simulateGame(opts: SimOptions): SimResult {
  const rng: RngState = seedFromNumber(opts.seed);
  const botRng: RngState = seedFromNumber(opts.seed ^ 0x5bd1e995);
  const players = opts.bots.map((_, i) => ({ id: `p${i}`, name: `Bot ${i + 1}` }));
  const state = createGame({ mode: opts.mode, config: opts.config, players, rng });
  const firstSeat = state.players.findIndex((p) => p.id === state.turn.playerId);
  const maxTurns = opts.maxTurns ?? 600;
  const errors: string[] = [];
  let tradesDone = 0;
  let tradesProposed = 0;
  let fliesPlayed = 0;
  let crowTurnsBlocked = 0;
  let makeBlockedByShortage = 0;
  let lastTurn = -1;
  let safety = 0;

  while (state.status === 'playing' && state.turn.number <= maxTurns) {
    if (++safety > maxTurns * 60) {
      errors.push('step-limit');
      break;
    }
    if (state.turn.number !== lastTurn) {
      lastTurn = state.turn.number;
      const ap = state.players.find((p) => p.id === state.turn.playerId)!;
      if (state.crows.some((c) => c.holderId === ap.id)) crowTurnsBlocked++;
    }
    // Whoever must act: the trade responder, otherwise the active player.
    const tr = state.turn.trade;
    const actorId = tr ? tr.awaitingId : state.turn.playerId;
    const idx = state.players.findIndex((p) => p.id === actorId);
    const view = projectGame(state, actorId, 40);
    const action = botDecide(opts.bots[idx]!, view, botRng) ?? { type: 'endTurn' as const };
    const res = applyAction(state, actorId, action);
    if (!res.ok) {
      errors.push(`${opts.bots[idx]}:${action.type}:${res.error}`);
      // Never let a bot bug wedge the simulation.
      if (state.turn.trade) applyAction(state, state.turn.trade.proposerId, { type: 'cancelTrade', tradeId: state.turn.trade.id });
      else applyAction(state, state.turn.playerId, { type: 'endTurn' });
      continue;
    }
    if (action.type === 'proposeTrade') tradesProposed++;
    if (action.type === 'respondTrade' && action.response === 'accept') tradesDone++;
    if (action.type === 'play' && action.card === 'fly') fliesPlayed++;
    if (action.type === 'endTurn') {
      // Did the bot end its turn holding moves but unable to make due to ingredients?
      const p = state.players[idx]!;
      if (p.hand.filter((c) => c.kind !== 'rendang').length > 8) makeBlockedByShortage++;
    }
    opts.onStep?.(state);
  }

  const n = state.players.length;
  const winners = state.result ? state.result.winnerIds.map((id) => state.players.findIndex((p) => p.id === id)) : [];
  return {
    finished: state.status === 'finished',
    stalled: state.status !== 'finished',
    turns: state.turn.number,
    rounds: state.turn.number / n,
    winners,
    reason: state.result?.reason ?? null,
    packs: state.players.map((p) => p.nasiLemak.reduce((s, nl) => s + (nl.fly ? 0 : nl.card.packs), 0)),
    firstSeat,
    reshuffles: state.reshuffles,
    tradesDone,
    tradesProposed,
    fliesPlayed,
    crowTurnsBlocked,
    makeBlockedByShortage,
    errors,
    state,
  };
}
