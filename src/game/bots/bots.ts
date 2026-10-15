/**
 * Bots that play legal moves using ONLY the information in their own
 * GameView (no peeking at hidden state). Used for balance simulations,
 * automated tests, and to fill empty seats in a room.
 */
import { BASE_INGREDIENTS, type BaseIngredient, type Card, type CardKind, isIngredient, isTradeable } from '../cards/catalog';
import { RECIPE_SIZE } from '../rules/config';
import { findRecipe, isValidRecipe } from '../rules/engine';
import { type RngState, randInt } from '../rng';
import type { GameAction, KindCount } from '../types';
import type { GameView, PlayerView } from '../view';

export type BotKind = 'random' | 'collector' | 'aggressive' | 'trader';
export const BOT_KINDS: BotKind[] = ['random', 'collector', 'aggressive', 'trader'];

interface Ctx {
  v: GameView;
  me: PlayerView;
  hand: Card[];
  rng: RngState;
  opponents: PlayerView[];
}

function pick<T>(rng: RngState, arr: T[]): T | undefined {
  return arr.length ? arr[randInt(rng, arr.length)] : undefined;
}

function cardsOf(hand: Card[], kind: CardKind): Card[] {
  return hand.filter((c) => c.kind === kind);
}

function missingIngredients(hand: Card[]): BaseIngredient[] {
  return BASE_INGREDIENTS.filter((k) => !hand.some((c) => c.kind === k));
}

/** Ingredient cards that are surplus for the next recipe (duplicates). */
function surplusIngredients(hand: Card[]): Card[] {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const c of hand) {
    if (!isIngredient(c.kind) || c.kind === 'rendang') continue;
    if (seen.has(c.kind)) out.push(c);
    else seen.add(c.kind);
  }
  return out;
}

function hasCrow(ctx: Ctx): boolean {
  return ctx.me.crow !== null;
}

function canMakeNow(ctx: Ctx): boolean {
  return !hasCrow(ctx) && ctx.v.nlPileCount > 0;
}

function visiblePacksEstimate(p: PlayerView): number {
  // Average card is ~1.5 packs; flied cards do not count.
  return p.nasiLemak.filter((n) => !n.hasFly).length * 1.5;
}

function leader(ctx: Ctx, filter: (p: PlayerView) => boolean = () => true): PlayerView | undefined {
  const cands = ctx.opponents.filter(filter);
  cands.sort((a, b) => visiblePacksEstimate(b) - visiblePacksEstimate(a) || b.handCount - a.handCount);
  return cands[0];
}

// --- candidate generators ------------------------------------------------------

function makeAction(ctx: Ctx): GameAction | null {
  if (!canMakeNow(ctx)) return null;
  const r = findRecipe(ctx.hand, RECIPE_SIZE);
  return r ? { type: 'make', cardIds: r.map((c) => c.id) } : null;
}

function makcikAction(ctx: Ctx): GameAction | null {
  if (!canMakeNow(ctx)) return null;
  const card = cardsOf(ctx.hand, 'makcik')[0];
  if (!card) return null;
  const n = ctx.v.config.makcikIngredients;
  // Prefer to spend surplus/duplicate-free ingredients that keep a full recipe possible.
  const r = findRecipe(ctx.hand, n);
  if (!r || !isValidRecipe(r, n)) return null;
  return { type: 'play', cardId: card.id, card: 'makcik', ingredientIds: r.map((c) => c.id) };
}

function supplierAction(ctx: Ctx): GameAction | null {
  const card = cardsOf(ctx.hand, 'supplier')[0];
  if (!card) return null;
  const missing = missingIngredients(ctx.hand);
  const ing = pick(ctx.rng, missing.length ? missing : [...BASE_INGREDIENTS]);
  return ing ? { type: 'play', cardId: card.id, card: 'supplier', ingredient: ing } : null;
}

function thiefAction(ctx: Ctx): GameAction | null {
  const card = cardsOf(ctx.hand, 'thief')[0];
  if (!card || !ctx.opponents.some((o) => o.handCount > 0)) return null;
  return { type: 'play', cardId: card.id, card: 'thief' };
}

function wholesalerAction(ctx: Ctx): GameAction | null {
  const card = cardsOf(ctx.hand, 'wholesaler')[0];
  if (!card || ctx.v.drawCount + ctx.v.discardCount === 0) return null;
  return { type: 'play', cardId: card.id, card: 'wholesaler' };
}

function officerAction(ctx: Ctx): GameAction | null {
  const card = cardsOf(ctx.hand, 'officer')[0];
  if (!card) return null;
  const t = [...ctx.opponents].filter((o) => o.handCount > 0).sort((a, b) => b.handCount - a.handCount)[0];
  return t ? { type: 'play', cardId: card.id, card: 'officer', targetId: t.id } : null;
}

function flyAction(ctx: Ctx): GameAction | null {
  const card = cardsOf(ctx.hand, 'fly')[0];
  if (!card) return null;
  const t = leader(ctx, (p) => p.nasiLemak.some((n) => !n.hasFly));
  const nl = t?.nasiLemak.find((n) => !n.hasFly);
  return t && nl ? { type: 'play', cardId: card.id, card: 'fly', targetId: t.id, nlId: nl.id } : null;
}

function swatterAction(ctx: Ctx): GameAction | null {
  const card = cardsOf(ctx.hand, 'swatter')[0];
  const nl = ctx.me.nasiLemak.find((n) => n.hasFly);
  return card && nl ? { type: 'play', cardId: card.id, card: 'swatter', nlId: nl.id } : null;
}

function fanAction(ctx: Ctx): GameAction | null {
  const card = cardsOf(ctx.hand, 'fan')[0];
  const from = ctx.me.nasiLemak.find((n) => n.hasFly);
  if (!card || !from) return null;
  const t = leader(ctx, (p) => p.nasiLemak.some((n) => !n.hasFly));
  const to = t?.nasiLemak.find((n) => !n.hasFly);
  return t && to ? { type: 'play', cardId: card.id, card: 'fan', fromNlId: from.id, targetId: t.id, toNlId: to.id } : null;
}

function sioyenAction(ctx: Ctx, ownOnly: boolean): GameAction | null {
  const card = cardsOf(ctx.hand, 'sioyen')[0];
  if (!card) return null;
  if (ctx.me.crow) return { type: 'play', cardId: card.id, card: 'sioyen', crowId: ctx.me.crow.id };
  if (ownOnly) return null;
  // Capture the crow with the juiciest stash.
  const holder = [...ctx.opponents].filter((o) => o.crow).sort((a, b) => b.crow!.stashCount - a.crow!.stashCount)[0];
  if (!holder || holder.crow!.stashCount === 0) return null;
  return { type: 'play', cardId: card.id, card: 'sioyen', crowId: holder.crow!.id };
}

function passCrowAction(ctx: Ctx): GameAction | null {
  if (!ctx.me.crow) return null;
  const ing = surplusIngredients(ctx.hand)[0] ?? ctx.hand.find((c) => isIngredient(c.kind) && c.kind !== 'rendang') ?? ctx.hand.find((c) => isIngredient(c.kind));
  if (!ing) return null;
  const t = leader(ctx, (p) => !p.crow) ?? pick(ctx.rng, ctx.opponents.filter((p) => !p.crow));
  return t ? { type: 'passCrow', crowId: ctx.me.crow.id, cardId: ing.id, targetId: t.id } : null;
}

function tradeAction(ctx: Ctx): GameAction | null {
  const proposed = ctx.v.log.filter(
    (e) => e.key === 'trade-proposed' && e.turn === ctx.v.turn.number && e.actor === ctx.me.id,
  ).length;
  if (proposed >= 2) return null;
  const missing = missingIngredients(ctx.hand);
  const surplus = surplusIngredients(ctx.hand);
  if (!missing.length || !surplus.length) return null;
  const target = pick(ctx.rng, ctx.opponents.filter((o) => o.handCount >= 3));
  if (!target) return null;
  const want = pick(ctx.rng, missing)!;
  return { type: 'proposeTrade', targetId: target.id, offerCardIds: [surplus[0]!.id], wantKinds: { [want]: 1 } };
}

function officerTakeAction(ctx: Ctx): GameAction | null {
  const p = ctx.v.turn.pending;
  if (!p || p.actorId !== ctx.me.id || !p.targetHand) return null;
  const missing = new Set<string>(missingIngredients(ctx.hand));
  const score = (c: Card) =>
    missing.has(c.kind) ? 5 : c.kind === 'rendang' ? 4 : c.kind === 'makcik' ? 3 : isIngredient(c.kind) ? 1 : 2;
  const sorted = [...p.targetHand].sort((a, b) => score(b) - score(a));
  return { type: 'officerTake', cardIds: sorted.slice(0, p.take).map((c) => c.id) };
}

// --- trade responses -------------------------------------------------------------

function evaluateTrade(ctx: Ctx, kind: BotKind): 'accept' | 'reject' {
  const tr = ctx.v.turn.trade!;
  const give = tr.wantKinds ?? {};
  const get = tr.offerCards ?? [];
  // Can I even pay?
  for (const [k, n] of Object.entries(give) as [CardKind, number][]) {
    if (cardsOf(ctx.hand, k).length < n) return 'reject';
  }
  if (kind === 'random') return randInt(ctx.rng, 2) === 0 ? 'accept' : 'reject';
  const missing = new Set<string>(missingIngredients(ctx.hand));
  const gain = get.filter((c) => missing.has(c.kind) || c.kind === 'rendang').length;
  let loss = 0;
  for (const [k, n] of Object.entries(give) as [CardKind, number][]) {
    const have = cardsOf(ctx.hand, k).length;
    if (k === 'rendang') loss += n;
    else if (isIngredient(k) && have - n < 1) loss += 1;
    else if (!isIngredient(k)) loss += n * 0.5;
  }
  if (kind === 'trader') return gain >= loss ? 'accept' : 'reject';
  if (kind === 'aggressive') return gain > loss + 0.5 ? 'accept' : 'reject';
  return gain > loss ? 'accept' : 'reject';
}

// --- main entry ---------------------------------------------------------------------

/**
 * Decide the next action for `playerId` given their view, or null if the
 * bot has nothing to do right now (not its turn and no trade waiting).
 */
export function botDecide(kind: BotKind, v: GameView, rng: RngState): GameAction | null {
  if (v.status !== 'playing' || !v.youId) return null;
  const me = v.players.find((p) => p.id === v.youId)!;
  const ctx: Ctx = {
    v,
    me,
    hand: v.hand,
    rng,
    opponents: v.players.filter((p) => p.id !== me.id && !p.gone),
  };

  const tr = v.turn.trade;
  if (tr && tr.awaitingId === me.id) {
    if (tr.proposerId === me.id) return { type: 'cancelTrade', tradeId: tr.id };
    return { type: 'respondTrade', tradeId: tr.id, response: evaluateTrade(ctx, kind) };
  }
  if (v.turn.playerId !== me.id) return null;
  if (v.turn.pending?.type === 'thief') {
    const pending = v.turn.pending;
    const choiceId = pick(rng, pending.choices ?? []);
    return choiceId ? { type: 'thiefTake', targetId: pending.targetId, choiceId } : null;
  }
  if (tr) return null; // waiting for the other side
  const take = officerTakeAction(ctx);
  if (take) return take;
  if (v.turn.movesLeft <= 0) return { type: 'endTurn' };

  const order: (() => GameAction | null)[] = [];
  switch (kind) {
    case 'random': {
      const all = [
        makeAction(ctx),
        makcikAction(ctx),
        supplierAction(ctx),
        thiefAction(ctx),
        wholesalerAction(ctx),
        officerAction(ctx),
        flyAction(ctx),
        swatterAction(ctx),
        fanAction(ctx),
        sioyenAction(ctx, false),
        passCrowAction(ctx),
        tradeAction(ctx),
        { type: 'endTurn' } as GameAction,
      ].filter((a): a is GameAction => a !== null);
      return pick(rng, all)!;
    }
    case 'collector':
      order.push(
        () => makeAction(ctx),
        () => (hasCrow(ctx) ? sioyenAction(ctx, true) ?? passCrowAction(ctx) : null),
        () => makcikAction(ctx),
        () => swatterAction(ctx),
        () => fanAction(ctx),
        () => wholesalerAction(ctx),
        () => supplierAction(ctx),
        () => officerAction(ctx),
        () => thiefAction(ctx),
        () => sioyenAction(ctx, false),
        () => flyAction(ctx),
      );
      break;
    case 'aggressive':
      order.push(
        () => makeAction(ctx),
        () => (hasCrow(ctx) ? passCrowAction(ctx) ?? sioyenAction(ctx, true) : null),
        () => flyAction(ctx),
        () => thiefAction(ctx),
        () => officerAction(ctx),
        () => fanAction(ctx),
        () => sioyenAction(ctx, false),
        () => makcikAction(ctx),
        () => supplierAction(ctx),
        () => swatterAction(ctx),
        () => wholesalerAction(ctx),
      );
      break;
    case 'trader':
      order.push(
        () => makeAction(ctx),
        () => (hasCrow(ctx) ? sioyenAction(ctx, true) ?? passCrowAction(ctx) : null),
        () => makcikAction(ctx),
        () => (v.turn.movesUsed === 0 || randInt(rng, 2) === 0 ? tradeAction(ctx) : null),
        () => swatterAction(ctx),
        () => wholesalerAction(ctx),
        () => supplierAction(ctx),
        () => fanAction(ctx),
        () => officerAction(ctx),
        () => flyAction(ctx),
        () => thiefAction(ctx),
      );
      break;
  }
  for (const f of order) {
    const a = f();
    if (a) return a;
  }
  return { type: 'endTurn' };
}

export function tradeableKinds(hand: Card[]): KindCount {
  const out: KindCount = {};
  for (const c of hand) if (isTradeable(c.kind)) out[c.kind] = (out[c.kind] ?? 0) + 1;
  return out;
}
