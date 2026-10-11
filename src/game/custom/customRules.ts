/**
 * Custom House Rules: validation, bounds and presets.
 *
 * Classic modes never go through this file – the server always rebuilds
 * their config from the frozen OFFICIAL_* objects, so a custom change can
 * never leak into an official game.
 */
import { ACTION_KINDS, BASE_INGREDIENTS } from '../cards/catalog';
import { type GameConfig, OFFICIAL_BASE, OFFICIAL_RENDANG, cloneConfig, deckSize } from '../rules/config';
import { RECIPE_SIZE } from '../rules/config';

export interface Bounds {
  min: number;
  max: number;
}

export const CUSTOM_BOUNDS = {
  ingredient: { min: 2, max: 30 },
  rendang: { min: 0, max: 20 },
  action: { min: 0, max: 15 },
  crows: { min: 0, max: 4 },
  nlOnePack: { min: 0, max: 40 },
  nlTwoPack: { min: 0, max: 40 },
  handSize: { min: 3, max: 12 },
  drawPerTurn: { min: 1, max: 5 },
  movesPerTurn: { min: 1, max: 6 },
  targetPacks: { min: 2, max: 20 },
  makcikIngredients: { min: 2, max: 4 },
  turnTimerSec: { min: 0, max: 600 },
  firstTurnDrawReduction: { min: 0, max: 5 },
  players: { min: 2, max: 7 },
} satisfies Record<string, Bounds>;

export type CustomPresetId = 'official-base' | 'official-rendang' | 'balanced' | 'fast' | 'chaotic';

function clampInt(v: unknown, b: Bounds, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(b.max, Math.max(b.min, Math.round(v)));
}

/**
 * Sanitize an untrusted config from the lobby UI. Values are clamped into
 * bounds, unknown keys are dropped. Returns the config plus human-readable
 * problems that make it unplayable (empty = OK).
 */
export function sanitizeCustomConfig(input: unknown, base: GameConfig = OFFICIAL_RENDANG): {
  config: GameConfig;
  problems: string[];
} {
  const src = (input && typeof input === 'object' ? input : {}) as Partial<Record<keyof GameConfig, unknown>>;
  const c = cloneConfig(base);
  const ing = (src.ingredients ?? {}) as Record<string, unknown>;
  for (const k of BASE_INGREDIENTS) c.ingredients[k] = clampInt(ing[k], CUSTOM_BOUNDS.ingredient, base.ingredients[k]);
  const act = (src.actions ?? {}) as Record<string, unknown>;
  for (const k of ACTION_KINDS) c.actions[k] = clampInt(act[k], CUSTOM_BOUNDS.action, base.actions[k]);
  c.rendang = clampInt(src.rendang, CUSTOM_BOUNDS.rendang, base.rendang);
  c.crows = clampInt(src.crows, CUSTOM_BOUNDS.crows, base.crows);
  c.nlOnePack = clampInt(src.nlOnePack, CUSTOM_BOUNDS.nlOnePack, base.nlOnePack);
  c.nlTwoPack = clampInt(src.nlTwoPack, CUSTOM_BOUNDS.nlTwoPack, base.nlTwoPack);
  c.handSize = clampInt(src.handSize, CUSTOM_BOUNDS.handSize, base.handSize);
  c.drawPerTurn = clampInt(src.drawPerTurn, CUSTOM_BOUNDS.drawPerTurn, base.drawPerTurn);
  c.movesPerTurn = clampInt(src.movesPerTurn, CUSTOM_BOUNDS.movesPerTurn, base.movesPerTurn);
  c.targetPacks = clampInt(src.targetPacks, CUSTOM_BOUNDS.targetPacks, base.targetPacks);
  c.makcikIngredients = clampInt(src.makcikIngredients, CUSTOM_BOUNDS.makcikIngredients, base.makcikIngredients);
  c.turnTimerSec = clampInt(src.turnTimerSec, CUSTOM_BOUNDS.turnTimerSec, base.turnTimerSec);
  if (c.turnTimerSec > 0 && c.turnTimerSec < 20) c.turnTimerSec = 20;
  c.firstTurnDrawReduction = clampInt(src.firstTurnDrawReduction, CUSTOM_BOUNDS.firstTurnDrawReduction, base.firstTurnDrawReduction ?? 0);
  c.length = src.length === 'long' ? 'long' : src.length === 'short' ? 'short' : base.length;
  c.minPlayers = CUSTOM_BOUNDS.players.min;
  c.maxPlayers = CUSTOM_BOUNDS.players.max;
  return { config: c, problems: customProblems(c) };
}

/** Problems that would make a custom game unplayable or degenerate. */
export function customProblems(c: GameConfig, playerCount = c.maxPlayers): string[] {
  const problems: string[] = [];
  if (c.nlOnePack + c.nlTwoPack < 1) problems.push('need-nasi-lemak-cards');
  if (deckSize(c) < c.handSize * playerCount + c.drawPerTurn * 2) problems.push('deck-too-small');
  if (c.actions.sioyen > 0 && c.crows === 0) problems.push('sioyen-without-crows');
  if (c.makcikIngredients > RECIPE_SIZE) problems.push('makcik-too-many');
  if (c.length === 'short') {
    const maxPacks = c.nlOnePack + 2 * c.nlTwoPack;
    if (maxPacks < c.targetPacks) problems.push('target-unreachable');
  }
  return problems;
}

/**
 * Presets derived from the bot simulations documented in docs/BALANCE.md.
 * They are starting points tuned for 5–7 players, not proofs of fairness.
 */
export function customPreset(id: CustomPresetId): GameConfig {
  switch (id) {
    case 'official-base':
      return { ...cloneConfig(OFFICIAL_BASE), minPlayers: 2, maxPlayers: 7 };
    case 'official-rendang':
      return { ...cloneConfig(OFFICIAL_RENDANG), minPlayers: 2, maxPlayers: 7 };
    case 'balanced':
      return {
        ...cloneConfig(OFFICIAL_RENDANG),
        ingredients: { nasi: 12, telur: 12, kacang: 12, sambal: 12, timun: 12 },
        rendang: 6,
        actions: {
          supplier: 3,
          thief: 3,
          wholesaler: 5,
          officer: 3,
          makcik: 4,
          fly: 6,
          swatter: 3,
          fan: 3,
          sioyen: 3,
        },
        crows: 2,
        nlOnePack: 12,
        nlTwoPack: 9,
        handSize: 7,
        drawPerTurn: 2,
        movesPerTurn: 3,
        targetPacks: 5,
        length: 'short',
        minPlayers: 2,
        maxPlayers: 7,
      };
    case 'fast':
      return {
        ...cloneConfig(OFFICIAL_RENDANG),
        ingredients: { nasi: 12, telur: 12, kacang: 12, sambal: 12, timun: 12 },
        rendang: 8,
        actions: {
          supplier: 3,
          thief: 2,
          wholesaler: 6,
          officer: 2,
          makcik: 5,
          fly: 4,
          swatter: 3,
          fan: 2,
          sioyen: 3,
        },
        crows: 1,
        nlOnePack: 10,
        nlTwoPack: 10,
        handSize: 7,
        drawPerTurn: 3,
        movesPerTurn: 3,
        targetPacks: 5,
        length: 'short',
        turnTimerSec: 90,
        firstTurnDrawReduction: 1,
        minPlayers: 2,
        maxPlayers: 7,
      };
    case 'chaotic':
      return {
        ...cloneConfig(OFFICIAL_RENDANG),
        ingredients: { nasi: 11, telur: 11, kacang: 11, sambal: 11, timun: 11 },
        rendang: 6,
        actions: {
          supplier: 5,
          thief: 5,
          wholesaler: 4,
          officer: 5,
          makcik: 4,
          fly: 9,
          swatter: 3,
          fan: 5,
          sioyen: 4,
        },
        crows: 2,
        nlOnePack: 12,
        nlTwoPack: 10,
        handSize: 7,
        drawPerTurn: 3,
        movesPerTurn: 4,
        targetPacks: 5,
        firstTurnDrawReduction: 2,
        length: 'short',
        minPlayers: 2,
        maxPlayers: 7,
      };
  }
}

export const CUSTOM_PRESET_IDS: CustomPresetId[] = ['official-base', 'official-rendang', 'balanced', 'fast', 'chaotic'];
