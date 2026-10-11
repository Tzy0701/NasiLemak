import type { ActionKind, BaseIngredient } from '../cards/catalog';

export type GameMode = 'classic-base' | 'classic-rendang' | 'custom';
export type GameLength = 'short' | 'long';

export interface GameConfig {
  /** Number of each base ingredient card. */
  ingredients: Record<BaseIngredient, number>;
  /** Number of Rendang wildcard ingredient cards. */
  rendang: number;
  /** Number of each action card. */
  actions: Record<ActionKind, number>;
  /** Crow cards kept in their own pile in the middle (0 = no crows). */
  crows: number;
  /** Nasi Lemak scoring cards worth 1 pack. */
  nlOnePack: number;
  /** Nasi Lemak scoring cards worth 2 packs. */
  nlTwoPack: number;
  /** Cards dealt to each player at the start. */
  handSize: number;
  /** Cards drawn at the start of each turn (not a move). */
  drawPerTurn: number;
  /** Maximum moves per turn. */
  movesPerTurn: number;
  /** Short game: first to this many packs (flies excluded) wins. */
  targetPacks: number;
  /** short = first to targetPacks, long = play until the Nasi Lemak pile runs out. */
  length: GameLength;
  /** Distinct ingredients needed with the Mak Cik Nasi Lemak card. */
  makcikIngredients: number;
  /**
   * House rule (Custom only): the starting player draws this many FEWER
   * cards on the very first turn, to offset the first-player advantage that
   * the simulations show in short games. 0 = official.
   */
  firstTurnDrawReduction: number;
  /** Optional per-turn timer in seconds (0 = off). Custom mode only. */
  turnTimerSec: number;
  minPlayers: number;
  maxPlayers: number;
}

/** Distinct ingredients needed for a normal Nasi Lemak. Fixed by the game's theme. */
export const RECIPE_SIZE = 5;

/**
 * Official base game (Almanac, 90 cards):
 * 50 ingredient (10 x 5), 25 action, 15 Nasi Lemak (8 x 1 pack, 7 x 2 packs).
 */
export const OFFICIAL_BASE: GameConfig = Object.freeze({
  ingredients: { nasi: 10, telur: 10, kacang: 10, sambal: 10, timun: 10 },
  rendang: 0,
  actions: {
    supplier: 3,
    thief: 3,
    wholesaler: 3,
    officer: 3,
    makcik: 3,
    fly: 5,
    swatter: 2,
    fan: 3,
    sioyen: 0,
  },
  crows: 0,
  nlOnePack: 8,
  nlTwoPack: 7,
  handSize: 7,
  drawPerTurn: 2,
  movesPerTurn: 3,
  targetPacks: 5,
  length: 'short',
  makcikIngredients: 3,
  firstTurnDrawReduction: 0,
  turnTimerSec: 0,
  minPlayers: 2,
  maxPlayers: 5,
}) as GameConfig;

/**
 * Official base + Rendang Expansion (110 cards). Expansion adds 6 Rendang,
 * 11 action/special cards (2 Crow, 3 Si Oyen, +1 Supplier, Thief, Wholesaler,
 * Officer, Mak Cik, Fly) and 3 Nasi Lemak cards.
 *
 * NOTE: the pack values printed on the 3 expansion Nasi Lemak cards could not
 * be verified (see docs/RULES.md). We assume 2 x 1 pack + 1 x 2 packs.
 */
export const OFFICIAL_RENDANG: GameConfig = Object.freeze({
  ingredients: { nasi: 10, telur: 10, kacang: 10, sambal: 10, timun: 10 },
  rendang: 6,
  actions: {
    supplier: 4,
    thief: 4,
    wholesaler: 4,
    officer: 4,
    makcik: 4,
    fly: 6,
    swatter: 2,
    fan: 3,
    sioyen: 3,
  },
  crows: 2,
  nlOnePack: 10,
  nlTwoPack: 8,
  handSize: 7,
  drawPerTurn: 2,
  movesPerTurn: 3,
  targetPacks: 5,
  length: 'short',
  makcikIngredients: 3,
  firstTurnDrawReduction: 0,
  turnTimerSec: 0,
  minPlayers: 3,
  maxPlayers: 7,
}) as GameConfig;

export function cloneConfig(c: GameConfig): GameConfig {
  return {
    ...c,
    ingredients: { ...c.ingredients },
    actions: { ...c.actions },
  };
}

export function officialConfig(mode: Exclude<GameMode, 'custom'>, length: GameLength = 'short'): GameConfig {
  const base = mode === 'classic-base' ? OFFICIAL_BASE : OFFICIAL_RENDANG;
  return { ...cloneConfig(base), length };
}

export function deckSize(c: GameConfig): number {
  const ing = Object.values(c.ingredients).reduce((a, b) => a + b, 0);
  const act = Object.values(c.actions).reduce((a, b) => a + b, 0);
  return ing + c.rendang + act;
}

export function totalCardCount(c: GameConfig): number {
  return deckSize(c) + c.crows + c.nlOnePack + c.nlTwoPack;
}
