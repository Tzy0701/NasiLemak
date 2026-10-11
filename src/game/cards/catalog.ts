/**
 * Card catalogue: every card kind used by the engine.
 *
 * Display names and rules text live in the client i18n dictionaries
 * (src/client/i18n) so they can be translated; this file only holds the
 * data the rules engine needs.
 */

export const BASE_INGREDIENTS = ['nasi', 'telur', 'kacang', 'sambal', 'timun'] as const;
export type BaseIngredient = (typeof BASE_INGREDIENTS)[number];

export type IngredientKind = BaseIngredient | 'rendang';

export const ACTION_KINDS = [
  'supplier',
  'thief',
  'wholesaler',
  'officer',
  'makcik',
  'fly',
  'swatter',
  'fan',
  'sioyen',
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export type CardKind = IngredientKind | ActionKind;

export const ALL_CARD_KINDS: readonly CardKind[] = [...BASE_INGREDIENTS, 'rendang', ...ACTION_KINDS];

/** A card that lives in the draw pile / hands / discard pile. */
export interface Card {
  id: string;
  kind: CardKind;
}

/** A Nasi Lemak scoring card (golden back). `packs` is hidden from opponents. */
export interface NasiLemakCard {
  id: string;
  packs: number;
}

export type CardCategory = 'ingredient' | 'wildcard' | 'action' | 'defence' | 'special';

export function isBaseIngredient(kind: CardKind): kind is BaseIngredient {
  return (BASE_INGREDIENTS as readonly string[]).includes(kind);
}

export function isIngredient(kind: CardKind): kind is IngredientKind {
  return kind === 'rendang' || isBaseIngredient(kind);
}

export function isAction(kind: CardKind): kind is ActionKind {
  return (ACTION_KINDS as readonly string[]).includes(kind);
}

export function cardCategory(kind: CardKind): CardCategory {
  if (kind === 'rendang') return 'wildcard';
  if (isBaseIngredient(kind)) return 'ingredient';
  if (kind === 'swatter' || kind === 'fan') return 'defence';
  if (kind === 'sioyen') return 'special';
  return 'action';
}

/**
 * Official almanac: "all ingredient cards and the Fly Swatter and Fan can be
 * traded, other action cards cannot be traded". Rendang expansion: "players
 * are allowed to trade Rendang with each other".
 */
export function isTradeable(kind: CardKind): boolean {
  return isIngredient(kind) || kind === 'swatter' || kind === 'fan';
}

/** Card kinds that are played as a move from the hand. */
export const PLAYABLE_ACTIONS: readonly ActionKind[] = ACTION_KINDS;
