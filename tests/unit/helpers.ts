import type { Card, CardKind } from '../../src/game/cards/catalog';
import { type GameConfig, type GameMode, OFFICIAL_BASE, OFFICIAL_RENDANG, cloneConfig } from '../../src/game/rules/config';
import { applyAction, createGame } from '../../src/game/rules/engine';
import { seedFromNumber } from '../../src/game/rng';
import type { GameAction, GameState } from '../../src/game/types';
import { expect } from 'vitest';

let idc = 0;

export function setup(opts: { mode?: GameMode; players?: number; seed?: number; config?: Partial<GameConfig>; first?: number } = {}) {
  const mode = opts.mode ?? 'classic-base';
  const base = mode === 'classic-base' ? OFFICIAL_BASE : OFFICIAL_RENDANG;
  const config = { ...cloneConfig(base), ...(opts.config ?? {}) };
  const n = opts.players ?? 3;
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  return createGame({ mode, config, players, rng: seedFromNumber(opts.seed ?? 1), firstPlayerIndex: opts.first ?? 0 });
}

/** Replace a player's hand with fresh cards of the given kinds (removed from the piles for conservation). */
export function setHand(state: GameState, pid: string, kinds: CardKind[]): Card[] {
  const p = state.players.find((x) => x.id === pid)!;
  // Return the old hand to the draw pile so total card counts stay sane.
  state.drawPile.unshift(...p.hand);
  p.hand = kinds.map((kind) => ({ id: `t${idc++}`, kind }));
  return p.hand;
}

export function hand(state: GameState, pid: string): Card[] {
  return state.players.find((x) => x.id === pid)!.hand;
}

export function cardOf(state: GameState, pid: string, kind: CardKind, nth = 0): Card {
  const c = hand(state, pid).filter((x) => x.kind === kind)[nth];
  if (!c) throw new Error(`${pid} has no ${kind}`);
  return c;
}

export function ok(state: GameState, pid: string, action: GameAction): void {
  const r = applyAction(state, pid, action);
  expect(r, JSON.stringify(action)).toEqual({ ok: true });
}

export function bad(state: GameState, pid: string, action: GameAction, error: string): void {
  const before = JSON.stringify(state);
  const r = applyAction(state, pid, action);
  expect(r).toEqual({ ok: false, error });
  // Rejected actions must not change anything.
  expect(JSON.stringify(state)).toBe(before);
}

export const RECIPE: CardKind[] = ['nasi', 'telur', 'kacang', 'sambal', 'timun'];

/** Give a player a ready-made Nasi Lemak (bypassing the rules) for setup purposes. */
export function giveNasiLemak(state: GameState, pid: string, packs: number, fly = false): string {
  const p = state.players.find((x) => x.id === pid)!;
  const id = `nx${idc++}`;
  p.nasiLemak.push({ card: { id, packs }, fly: fly ? { id: `f${idc++}`, kind: 'fly' } : null });
  return id;
}

/** Total physical cards in circulation (hands, piles, flies, crow stashes). */
export function circulating(state: GameState): number {
  let n = state.drawPile.length + state.discardPile.length;
  for (const p of state.players) {
    n += p.hand.length;
    n += p.nasiLemak.filter((nl) => nl.fly).length;
  }
  for (const c of state.crows) n += c.stash.length;
  return n;
}
