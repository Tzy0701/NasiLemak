/**
 * Nasi Lemak rules engine. Pure TypeScript, no DOM / Workers dependencies.
 *
 * All functions mutate the GameState passed in. Every action handler fully
 * validates before mutating, so a rejected action leaves the state untouched.
 */
import {
  BASE_INGREDIENTS,
  type BaseIngredient,
  type Card,
  type CardKind,
  type NasiLemakCard,
  isBaseIngredient,
  isIngredient,
  isTradeable,
} from '../cards/catalog';
import { type GameConfig, type GameMode, RECIPE_SIZE } from './config';
import { type RngState, randInt, shuffleInPlace } from '../rng';
import type {
  ActionResult,
  CrowState,
  GameAction,
  GameResult,
  GameState,
  KindCount,
  LogEntry,
  PlayAction,
  PlayerState,
  PlacedNasiLemak,
} from '../types';

export const MAX_LOG = 300;
export const MAX_TRADE_ROUNDS = 6;
export const MAX_TRADE_CARDS = 12;

export class RuleError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

function fail(code: string): never {
  throw new RuleError(code);
}

export interface NewGamePlayer {
  id: string;
  name: string;
}

export interface CreateGameOptions {
  mode: GameMode;
  config: GameConfig;
  players: NewGamePlayer[];
  rng: RngState;
  /** Seat index of the first player; random if omitted. */
  firstPlayerIndex?: number;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function buildDeck(config: GameConfig): CardKind[] {
  const kinds: CardKind[] = [];
  for (const ing of BASE_INGREDIENTS) for (let i = 0; i < config.ingredients[ing]; i++) kinds.push(ing);
  for (let i = 0; i < config.rendang; i++) kinds.push('rendang');
  for (const [kind, n] of Object.entries(config.actions) as [CardKind, number][]) {
    for (let i = 0; i < n; i++) kinds.push(kind);
  }
  return kinds;
}

export function buildNasiLemakValues(config: GameConfig): number[] {
  return [...Array(config.nlOnePack).fill(1), ...Array(config.nlTwoPack).fill(2)];
}

export function createGame(opts: CreateGameOptions): GameState {
  const { config, players, rng } = opts;
  if (players.length < config.minPlayers || players.length > config.maxPlayers) {
    fail('bad-player-count');
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) fail('duplicate-player');

  // Shuffle first, then assign ids, so an id never reveals what a card is.
  const kinds = shuffleInPlace(rng, buildDeck(config));
  const deck: Card[] = kinds.map((kind, i) => ({ id: `c${i}`, kind }));
  const nlValues = shuffleInPlace(rng, buildNasiLemakValues(config));
  const nlPile: NasiLemakCard[] = nlValues.map((packs, i) => ({ id: `n${i}`, packs }));
  const crows: CrowState[] = Array.from({ length: config.crows }, (_, i) => ({
    id: `w${i}`,
    holderId: null,
    stash: [],
  }));

  if (deck.length < config.handSize * players.length) fail('deck-too-small');

  const playerStates: PlayerState[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    hand: [],
    nasiLemak: [],
    gone: false,
  }));
  // Deal one card at a time, like at the table.
  for (let r = 0; r < config.handSize; r++) {
    for (const p of playerStates) p.hand.push(deck.pop()!);
  }

  const first = opts.firstPlayerIndex ?? randInt(rng, players.length);
  const state: GameState = {
    mode: opts.mode,
    config,
    players: playerStates,
    drawPile: deck,
    discardPile: [],
    nlPile,
    crows,
    turn: {
      playerId: playerStates[first]!.id,
      number: 0,
      movesUsed: 0,
      drawnIds: [],
      pending: null,
      trade: null,
      deadline: null,
    },
    status: 'playing',
    result: null,
    log: [],
    logSeq: 0,
    lastReveal: null,
    rng,
    idSeq: 0,
    reshuffles: 0,
    totalMoves: 0,
  };
  log(state, { key: 'game-start', n: players.length });
  startTurn(state, first);
  return state;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(state: GameState, entry: Omit<LogEntry, 'seq' | 'turn'>): void {
  state.logSeq += 1;
  state.log.push({ seq: state.logSeq, turn: state.turn?.number ?? 0, ...entry });
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
}

export function getPlayer(state: GameState, id: string): PlayerState {
  const p = state.players.find((x) => x.id === id);
  if (!p) fail('unknown-player');
  return p;
}

export function activePlayer(state: GameState): PlayerState {
  return getPlayer(state, state.turn.playerId);
}

export function packsOf(p: PlayerState): number {
  return p.nasiLemak.reduce((sum, nl) => sum + (nl.fly ? 0 : nl.card.packs), 0);
}

export function crowOf(state: GameState, playerId: string): CrowState | undefined {
  return state.crows.find((c) => c.holderId === playerId);
}

export function movesLeft(state: GameState): number {
  return Math.max(0, state.config.movesPerTurn - state.turn.movesUsed);
}

function takeFromHand(p: PlayerState, cardId: string): Card {
  const idx = p.hand.findIndex((c) => c.id === cardId);
  if (idx < 0) fail('card-not-in-hand');
  return p.hand.splice(idx, 1)[0]!;
}

function handCard(p: PlayerState, cardId: string): Card {
  const c = p.hand.find((x) => x.id === cardId);
  if (!c) fail('card-not-in-hand');
  return c;
}

function uniqueIds(ids: unknown): string[] {
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) fail('bad-request');
  if (new Set(ids).size !== ids.length) fail('duplicate-card');
  return ids as string[];
}

/** Draw `n` cards, reshuffling the discard pile into the draw pile when empty. */
export function drawCards(state: GameState, n: number): Card[] {
  const out: Card[] = [];
  for (let i = 0; i < n; i++) {
    if (state.drawPile.length === 0) {
      if (state.discardPile.length === 0) break;
      state.drawPile = shuffleInPlace(state.rng, state.discardPile);
      state.discardPile = [];
      state.reshuffles += 1;
      log(state, { key: 'reshuffle', n: state.drawPile.length });
    }
    out.push(state.drawPile.pop()!);
  }
  return out;
}

/**
 * Do these ingredient cards make a Nasi Lemak of `size` *different*
 * ingredients? Rendang is a wildcard that stands in for any missing base
 * ingredient, so the set is valid iff no base ingredient appears twice.
 */
export function isValidRecipe(cards: Card[], size: number): boolean {
  if (cards.length !== size) return false;
  if (size > BASE_INGREDIENTS.length) return false;
  const seen = new Set<string>();
  for (const c of cards) {
    if (!isIngredient(c.kind)) return false;
    if (c.kind === 'rendang') continue;
    if (seen.has(c.kind)) return false;
    seen.add(c.kind);
  }
  return true;
}

/**
 * Pick ingredient cards from a hand that form a recipe of `size`, preferring
 * real ingredients over Rendang. Returns null if impossible.
 */
export function findRecipe(hand: Card[], size: number): Card[] | null {
  const picked: Card[] = [];
  const used = new Set<string>();
  for (const ing of BASE_INGREDIENTS) {
    if (picked.length >= size) break;
    const c = hand.find((x) => x.kind === ing);
    if (c) {
      picked.push(c);
      used.add(c.id);
    }
  }
  for (const c of hand) {
    if (picked.length >= size) break;
    if (c.kind === 'rendang' && !used.has(c.id)) {
      picked.push(c);
      used.add(c.id);
    }
  }
  return picked.length === size && isValidRecipe(picked, size) ? picked : null;
}

function countKinds(cards: Card[]): KindCount {
  const out: KindCount = {};
  for (const c of cards) out[c.kind] = (out[c.kind] ?? 0) + 1;
  return out;
}

function validateKindCount(k: unknown): KindCount {
  if (!k || typeof k !== 'object' || Array.isArray(k)) fail('bad-request');
  const out: KindCount = {};
  let total = 0;
  for (const [kind, n] of Object.entries(k as Record<string, unknown>)) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_TRADE_CARDS) fail('bad-request');
    if (n === 0) continue;
    if (!isTradeable(kind as CardKind)) fail('not-tradeable');
    out[kind as CardKind] = n;
    total += n;
  }
  if (total > MAX_TRADE_CARDS) fail('trade-too-large');
  return out;
}

function kindTotal(k: KindCount): number {
  return Object.values(k).reduce((a, b) => a + (b ?? 0), 0);
}

/** Choose concrete cards of the requested kinds from a hand, or null. */
export function pickKinds(hand: Card[], want: KindCount): Card[] | null {
  const out: Card[] = [];
  for (const [kind, n] of Object.entries(want) as [CardKind, number][]) {
    const matches = hand.filter((c) => c.kind === kind);
    if (matches.length < n) return null;
    out.push(...matches.slice(0, n));
  }
  return out;
}

function otherActivePlayers(state: GameState, id: string): PlayerState[] {
  // Clockwise from the actor, which matters for display order only.
  const idx = state.players.findIndex((p) => p.id === id);
  const out: PlayerState[] = [];
  for (let i = 1; i < state.players.length; i++) {
    const p = state.players[(idx + i) % state.players.length]!;
    if (!p.gone) out.push(p);
  }
  return out;
}

function findNasiLemak(state: GameState, nlId: string): { owner: PlayerState; nl: PlacedNasiLemak } {
  for (const owner of state.players) {
    const nl = owner.nasiLemak.find((x) => x.card.id === nlId);
    if (nl) return { owner, nl };
  }
  fail('unknown-nasi-lemak');
}

function requireTarget(state: GameState, actorId: string, targetId: unknown): PlayerState {
  if (typeof targetId !== 'string') fail('bad-request');
  if (targetId === actorId) fail('cannot-target-self');
  const t = state.players.find((p) => p.id === targetId);
  if (!t) fail('unknown-player');
  if (t.gone) fail('player-gone');
  return t;
}

// ---------------------------------------------------------------------------
// Turn flow
// ---------------------------------------------------------------------------

function startTurn(state: GameState, index: number): void {
  const p = state.players[index]!;
  state.turn = {
    playerId: p.id,
    number: state.turn.number + 1,
    movesUsed: 0,
    drawnIds: [],
    pending: null,
    trade: null,
    deadline: null,
  };
  state.lastReveal = null;
  const reduction = state.turn.number === 1 ? (state.config.firstTurnDrawReduction ?? 0) : 0;
  const drawn = drawCards(state, Math.max(0, state.config.drawPerTurn - reduction));
  p.hand.push(...drawn);
  state.turn.drawnIds = drawn.map((c) => c.id);
  log(state, { key: 'turn-start', actor: p.id });
  log(state, { key: 'draw', actor: p.id, n: drawn.length });
  if (drawn.length > 0) log(state, { key: 'draw-private', actor: p.id, kinds: drawn.map((c) => c.kind), to: [p.id] });
}

function nextSeat(state: GameState): number | null {
  const n = state.players.length;
  const cur = state.players.findIndex((p) => p.id === state.turn.playerId);
  for (let i = 1; i <= n; i++) {
    const idx = (cur + i) % n;
    if (!state.players[idx]!.gone) return idx;
  }
  return null;
}

function endTurnInternal(state: GameState): void {
  if (state.status !== 'playing') return;
  state.turn.trade = null;
  state.turn.pending = null;
  log(state, { key: 'turn-end', actor: state.turn.playerId });
  const next = nextSeat(state);
  if (next === null) return;
  startTurn(state, next);
}

function standings(state: GameState): GameResult['standings'] {
  return state.players.map((p) => ({
    playerId: p.id,
    packs: packsOf(p),
    cards: p.nasiLemak.filter((nl) => !nl.fly).length,
    fliedCards: p.nasiLemak.filter((nl) => nl.fly).length,
  }));
}

function finish(state: GameState, reason: GameResult['reason'], winnerIds: string[]): void {
  state.status = 'finished';
  state.turn.trade = null;
  state.turn.pending = null;
  state.result = { reason, winnerIds, standings: standings(state) };
  log(state, { key: 'game-over-' + reason });
  for (const w of winnerIds) log(state, { key: 'winner', actor: w, n: packsOf(getPlayer(state, w)) });
}

/** Most packs (flies excluded) wins; tie-break: most Nasi Lemak cards; else shared. */
export function rankWinners(state: GameState): string[] {
  const eligible = state.players.filter((p) => !p.gone);
  let best: PlayerState[] = [];
  let bestKey: [number, number] = [-1, -1];
  for (const p of eligible) {
    const key: [number, number] = [packsOf(p), p.nasiLemak.filter((nl) => !nl.fly).length];
    if (key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
      best = [p];
      bestKey = key;
    } else if (key[0] === bestKey[0] && key[1] === bestKey[1]) {
      best.push(p);
    }
  }
  return best.map((p) => p.id);
}

/** Checks the end-of-game conditions after every move. Returns true if finished. */
export function checkEnd(state: GameState): boolean {
  if (state.status !== 'playing') return true;
  const live = state.players.filter((p) => !p.gone);
  if (live.length < 2) {
    finish(state, 'players-left', live.map((p) => p.id));
    return true;
  }
  if (state.config.length === 'short') {
    const active = activePlayer(state);
    // "The game ends when any player manages to make 5 Nasi Lemak
    // cumulatively during their turn."
    if (!active.gone && packsOf(active) >= state.config.targetPacks) {
      finish(state, 'target', [active.id]);
      return true;
    }
  }
  if (state.nlPile.length === 0) {
    // Alternative ending (and fallback when the pile runs out in a short game).
    finish(state, 'nl-depleted', rankWinners(state));
    return true;
  }
  return false;
}

function useMove(state: GameState): void {
  state.turn.movesUsed += 1;
  state.totalMoves += 1;
}

function afterMove(state: GameState): void {
  if (checkEnd(state)) return;
  if (state.turn.movesUsed >= state.config.movesPerTurn && !state.turn.pending && !state.turn.trade) {
    endTurnInternal(state);
  }
}

function requireActive(state: GameState, actorId: string): PlayerState {
  if (state.status !== 'playing') fail('game-over');
  if (state.turn.playerId !== actorId) fail('not-your-turn');
  return activePlayer(state);
}

function requireMoveAvailable(state: GameState): void {
  if (state.turn.pending) fail('resolve-pending-first');
  if (state.turn.trade) fail('trade-in-progress');
  if (movesLeft(state) <= 0) fail('no-moves-left');
}

// ---------------------------------------------------------------------------
// Making Nasi Lemak
// ---------------------------------------------------------------------------

function awardNasiLemak(state: GameState, p: PlayerState): void {
  const card = state.nlPile.pop()!;
  p.nasiLemak.push({ card, fly: null });
  log(state, { key: 'make', actor: p.id, n: p.nasiLemak.length });
  log(state, { key: 'make-private', actor: p.id, n: card.packs, to: [p.id] });
  // Rendang expansion: whoever makes a Nasi Lemak while a Crow waits in the
  // pile gets a Crow placed in front of them (max one Crow per player).
  if (!crowOf(state, p.id)) {
    const free = state.crows.find((c) => c.holderId === null);
    if (free) {
      free.holderId = p.id;
      log(state, { key: 'crow-arrives', actor: p.id });
    }
  }
}

function assertCanMake(state: GameState, p: PlayerState): void {
  if (crowOf(state, p.id)) fail('crow-blocks');
  if (state.nlPile.length === 0) fail('nl-pile-empty');
}

function doMake(state: GameState, actorId: string, cardIds: unknown): void {
  const p = requireActive(state, actorId);
  requireMoveAvailable(state);
  const ids = uniqueIds(cardIds);
  assertCanMake(state, p);
  const cards = ids.map((id) => handCard(p, id));
  if (!isValidRecipe(cards, RECIPE_SIZE)) fail('invalid-recipe');
  for (const id of ids) state.discardPile.push(takeFromHand(p, id));
  useMove(state);
  awardNasiLemak(state, p);
  afterMove(state);
}

// ---------------------------------------------------------------------------
// Action cards
// ---------------------------------------------------------------------------

function doPlay(state: GameState, actorId: string, a: PlayAction): void {
  const p = requireActive(state, actorId);
  requireMoveAvailable(state);
  if (typeof a.cardId !== 'string') fail('bad-request');
  const card = handCard(p, a.cardId);
  if (card.kind !== a.card) fail('wrong-card');

  switch (a.card) {
    case 'supplier': {
      const ing = a.ingredient;
      // Rendang expansion: Rendang cannot be announced with the Supplier.
      if (typeof ing !== 'string' || !isBaseIngredient(ing as CardKind)) fail('bad-ingredient');
      takeFromHand(p, card.id);
      state.discardPile.push(card);
      useMove(state);
      let total = 0;
      for (const other of otherActivePlayers(state, p.id)) {
        const given = other.hand.filter((c) => c.kind === ing);
        if (given.length === 0) continue;
        other.hand = other.hand.filter((c) => c.kind !== ing);
        p.hand.push(...given);
        total += given.length;
        log(state, { key: 'supplier-gave', actor: other.id, target: p.id, n: given.length, ingredient: ing });
      }
      log(state, { key: 'supplier', actor: p.id, ingredient: ing, n: total });
      break;
    }
    case 'thief': {
      const victims = otherActivePlayers(state, p.id).filter((o) => o.hand.length > 0);
      if (victims.length === 0) fail('no-valid-target');
      takeFromHand(p, card.id);
      state.discardPile.push(card);
      useMove(state);
      log(state, { key: 'thief', actor: p.id, n: victims.length });
      for (const v of victims) {
        const stolen = v.hand.splice(randInt(state.rng, v.hand.length), 1)[0]!;
        p.hand.push(stolen);
        log(state, { key: 'thief-private', actor: p.id, target: v.id, kinds: [stolen.kind], to: [p.id, v.id] });
      }
      break;
    }
    case 'wholesaler': {
      takeFromHand(p, card.id);
      state.discardPile.push(card);
      useMove(state);
      const revealed = drawCards(state, 3);
      const kept: string[] = [];
      for (const c of revealed) {
        if (isIngredient(c.kind)) {
          p.hand.push(c);
          kept.push(c.id);
        } else {
          state.discardPile.push(c);
        }
      }
      state.lastReveal = { actorId: p.id, cards: revealed, kept };
      log(state, { key: 'wholesaler', actor: p.id, kinds: revealed.map((c) => c.kind), n: kept.length });
      break;
    }
    case 'officer': {
      const t = requireTarget(state, p.id, a.targetId);
      takeFromHand(p, card.id);
      state.discardPile.push(card);
      useMove(state);
      const take = Math.min(2, t.hand.length);
      log(state, { key: 'officer', actor: p.id, target: t.id, n: take });
      if (take > 0) state.turn.pending = { type: 'officer', actorId: p.id, targetId: t.id, take };
      break;
    }
    case 'makcik': {
      assertCanMake(state, p);
      const ids = uniqueIds(a.ingredientIds);
      if (ids.includes(card.id)) fail('bad-request');
      const cards = ids.map((id) => handCard(p, id));
      if (!isValidRecipe(cards, state.config.makcikIngredients)) fail('invalid-recipe');
      takeFromHand(p, card.id);
      for (const id of ids) state.discardPile.push(takeFromHand(p, id));
      state.discardPile.push(card);
      useMove(state);
      log(state, { key: 'makcik', actor: p.id });
      awardNasiLemak(state, p);
      break;
    }
    case 'fly': {
      const t = requireTarget(state, p.id, a.targetId);
      if (typeof a.nlId !== 'string') fail('bad-request');
      const { owner, nl } = findNasiLemak(state, a.nlId);
      if (owner.id !== t.id) fail('unknown-nasi-lemak');
      if (nl.fly) fail('already-has-fly');
      takeFromHand(p, card.id);
      nl.fly = card;
      useMove(state);
      log(state, { key: 'fly', actor: p.id, target: t.id });
      break;
    }
    case 'swatter': {
      if (typeof a.nlId !== 'string') fail('bad-request');
      const { owner, nl } = findNasiLemak(state, a.nlId);
      if (owner.id !== p.id) fail('not-your-nasi-lemak');
      if (!nl.fly) fail('no-fly-there');
      takeFromHand(p, card.id);
      state.discardPile.push(nl.fly, card);
      nl.fly = null;
      useMove(state);
      log(state, { key: 'swatter', actor: p.id });
      break;
    }
    case 'fan': {
      if (typeof a.fromNlId !== 'string' || typeof a.toNlId !== 'string') fail('bad-request');
      const from = findNasiLemak(state, a.fromNlId);
      if (from.owner.id !== p.id) fail('not-your-nasi-lemak');
      if (!from.nl.fly) fail('no-fly-there');
      const t = requireTarget(state, p.id, a.targetId);
      const to = findNasiLemak(state, a.toNlId);
      if (to.owner.id !== t.id) fail('unknown-nasi-lemak');
      if (to.nl.fly) fail('already-has-fly');
      takeFromHand(p, card.id);
      to.nl.fly = from.nl.fly;
      from.nl.fly = null;
      state.discardPile.push(card);
      useMove(state);
      log(state, { key: 'fan', actor: p.id, target: t.id });
      break;
    }
    case 'sioyen': {
      const crow = state.crows.find((c) => c.id === a.crowId);
      if (!crow) fail('unknown-crow');
      if (crow.holderId === null) fail('crow-not-in-play');
      const victimId = crow.holderId;
      takeFromHand(p, card.id);
      state.discardPile.push(card);
      const loot = crow.stash;
      p.hand.push(...loot);
      crow.stash = [];
      crow.holderId = null;
      useMove(state);
      log(state, {
        key: 'sioyen',
        actor: p.id,
        target: victimId,
        n: loot.length,
        kinds: loot.map((c) => c.kind),
      });
      break;
    }
    default:
      fail('bad-request');
  }
  afterMove(state);
}

function doOfficerTake(state: GameState, actorId: string, cardIds: unknown): void {
  const p = requireActive(state, actorId);
  const pending = state.turn.pending;
  if (!pending || pending.type !== 'officer' || pending.actorId !== actorId) fail('nothing-pending');
  const t = getPlayer(state, pending.targetId);
  const ids = uniqueIds(cardIds);
  const take = Math.min(pending.take, t.hand.length);
  if (ids.length !== take) fail('wrong-count');
  const taken = ids.map((id) => handCard(t, id));
  for (const c of taken) {
    takeFromHand(t, c.id);
    p.hand.push(c);
  }
  state.turn.pending = null;
  log(state, { key: 'officer-take', actor: p.id, target: t.id, n: taken.length });
  log(state, { key: 'officer-private', actor: p.id, target: t.id, kinds: taken.map((c) => c.kind), to: [p.id, t.id] });
  afterMove(state);
}

// ---------------------------------------------------------------------------
// Crow
// ---------------------------------------------------------------------------

function doPassCrow(state: GameState, actorId: string, a: Extract<GameAction, { type: 'passCrow' }>): void {
  const p = requireActive(state, actorId);
  requireMoveAvailable(state);
  const crow = state.crows.find((c) => c.id === a.crowId);
  if (!crow || crow.holderId !== p.id) fail('not-your-crow');
  if (typeof a.cardId !== 'string') fail('bad-request');
  const card = handCard(p, a.cardId);
  if (!isIngredient(card.kind)) fail('crow-needs-ingredient');
  const t = requireTarget(state, p.id, a.targetId);
  if (crowOf(state, t.id)) fail('target-has-crow');
  takeFromHand(p, card.id);
  crow.stash.push(card);
  crow.holderId = t.id;
  useMove(state);
  log(state, { key: 'crow-pass', actor: p.id, target: t.id, kinds: [card.kind], n: crow.stash.length });
  afterMove(state);
}

// ---------------------------------------------------------------------------
// Trading
// ---------------------------------------------------------------------------

function doProposeTrade(state: GameState, actorId: string, a: Extract<GameAction, { type: 'proposeTrade' }>): void {
  const p = requireActive(state, actorId);
  requireMoveAvailable(state);
  const t = requireTarget(state, p.id, a.targetId);
  const ids = uniqueIds(a.offerCardIds);
  const want = validateKindCount(a.wantKinds);
  if (ids.length === 0 || kindTotal(want) === 0) fail('trade-needs-both-sides');
  if (ids.length > MAX_TRADE_CARDS) fail('trade-too-large');
  for (const id of ids) if (!isTradeable(handCard(p, id).kind)) fail('not-tradeable');
  state.idSeq += 1;
  state.turn.trade = {
    id: `t${state.idSeq}`,
    proposerId: p.id,
    targetId: t.id,
    awaitingId: t.id,
    offerCardIds: ids,
    wantKinds: want,
    round: 1,
  };
  log(state, { key: 'trade-proposed', actor: p.id, target: t.id });
}

function requireTrade(state: GameState, tradeId: unknown) {
  if (state.status !== 'playing') fail('game-over');
  const tr = state.turn.trade;
  if (!tr || tr.id !== tradeId) fail('no-such-trade');
  return tr;
}

function doRespondTrade(state: GameState, actorId: string, a: Extract<GameAction, { type: 'respondTrade' }>): void {
  const tr = requireTrade(state, a.tradeId);
  if (tr.awaitingId !== actorId) fail('not-your-decision');
  const offererId = tr.awaitingId === tr.proposerId ? tr.targetId : tr.proposerId;
  if (a.response === 'reject') {
    state.turn.trade = null;
    log(state, { key: 'trade-rejected', actor: actorId, target: offererId });
    return;
  }
  if (a.response !== 'accept') fail('bad-request');
  const offerer = getPlayer(state, offererId);
  const responder = getPlayer(state, actorId);
  const offerCards = tr.offerCardIds.map((id) => handCard(offerer, id));
  const wanted = pickKinds(responder.hand, tr.wantKinds);
  if (!wanted) fail('trade-missing-cards');
  for (const c of offerCards) takeFromHand(offerer, c.id);
  for (const c of wanted) takeFromHand(responder, c.id);
  responder.hand.push(...offerCards);
  offerer.hand.push(...wanted);
  state.turn.trade = null;
  useMove(state); // a trade is one of the active player's moves
  const proposerGave = offererId === tr.proposerId ? offerCards : wanted;
  const targetGave = offererId === tr.proposerId ? wanted : offerCards;
  log(state, {
    key: 'trade-done',
    actor: tr.proposerId,
    target: tr.targetId,
    n: proposerGave.length,
    m: targetGave.length,
  });
  log(state, {
    key: 'trade-private',
    actor: tr.proposerId,
    target: tr.targetId,
    kinds: [...proposerGave.map((c) => c.kind)],
    n: proposerGave.length,
    to: [tr.proposerId, tr.targetId],
  });
  log(state, {
    key: 'trade-private',
    actor: tr.targetId,
    target: tr.proposerId,
    kinds: [...targetGave.map((c) => c.kind)],
    n: targetGave.length,
    to: [tr.proposerId, tr.targetId],
  });
  afterMove(state);
}

function doCounterTrade(state: GameState, actorId: string, a: Extract<GameAction, { type: 'counterTrade' }>): void {
  const tr = requireTrade(state, a.tradeId);
  if (tr.awaitingId !== actorId) fail('not-your-decision');
  if (tr.round >= MAX_TRADE_ROUNDS) fail('too-many-counters');
  const me = getPlayer(state, actorId);
  const ids = uniqueIds(a.offerCardIds);
  const want = validateKindCount(a.wantKinds);
  if (ids.length === 0 || kindTotal(want) === 0) fail('trade-needs-both-sides');
  if (ids.length > MAX_TRADE_CARDS) fail('trade-too-large');
  for (const id of ids) if (!isTradeable(handCard(me, id).kind)) fail('not-tradeable');
  const otherId = actorId === tr.proposerId ? tr.targetId : tr.proposerId;
  tr.offerCardIds = ids;
  tr.wantKinds = want;
  tr.awaitingId = otherId;
  tr.round += 1;
  log(state, { key: 'trade-countered', actor: actorId, target: otherId });
}

function doCancelTrade(state: GameState, actorId: string, tradeId: unknown): void {
  const tr = requireTrade(state, tradeId);
  if (tr.proposerId !== actorId) fail('not-your-decision');
  state.turn.trade = null;
  log(state, { key: 'trade-cancelled', actor: actorId, target: tr.targetId });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function applyAction(state: GameState, actorId: string, action: GameAction): ActionResult {
  try {
    if (!action || typeof action !== 'object') fail('bad-request');
    if (state.status !== 'playing') fail('game-over');
    const actor = state.players.find((p) => p.id === actorId);
    if (!actor || actor.gone) fail('unknown-player');
    switch (action.type) {
      case 'make':
        doMake(state, actorId, action.cardIds);
        break;
      case 'play':
        doPlay(state, actorId, action);
        break;
      case 'officerTake':
        doOfficerTake(state, actorId, action.cardIds);
        break;
      case 'passCrow':
        doPassCrow(state, actorId, action);
        break;
      case 'proposeTrade':
        doProposeTrade(state, actorId, action);
        break;
      case 'respondTrade':
        doRespondTrade(state, actorId, action);
        break;
      case 'counterTrade':
        doCounterTrade(state, actorId, action);
        break;
      case 'cancelTrade':
        doCancelTrade(state, actorId, action.tradeId);
        break;
      case 'endTurn': {
        requireActive(state, actorId);
        if (state.turn.pending) fail('resolve-pending-first');
        if (state.turn.trade) {
          log(state, { key: 'trade-cancelled', actor: actorId, target: state.turn.trade.targetId });
        }
        endTurnInternal(state);
        break;
      }
      default:
        fail('bad-request');
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.code };
    throw e;
  }
}

/** Cancel the open trade (e.g. a party disconnected or it timed out). */
export function systemCancelTrade(state: GameState, reason: 'timeout' | 'disconnect'): boolean {
  const tr = state.turn.trade;
  if (!tr || state.status !== 'playing') return false;
  state.turn.trade = null;
  log(state, { key: 'trade-expired-' + reason, actor: tr.proposerId, target: tr.targetId });
  return true;
}

/**
 * Force the current turn to end (turn timer / AFK player). A pending Officer
 * choice is resolved by picking random cards, like grabbing blindly.
 */
export function systemSkipTurn(state: GameState, reason: 'timeout' | 'afk' | 'host'): void {
  if (state.status !== 'playing') return;
  const pending = state.turn.pending;
  if (pending?.type === 'officer') {
    const actor = getPlayer(state, pending.actorId);
    const t = getPlayer(state, pending.targetId);
    const taken: Card[] = [];
    for (let i = 0; i < pending.take && t.hand.length > 0; i++) {
      taken.push(t.hand.splice(randInt(state.rng, t.hand.length), 1)[0]!);
    }
    actor.hand.push(...taken);
    state.turn.pending = null;
    log(state, { key: 'officer-take', actor: actor.id, target: t.id, n: taken.length });
    log(state, {
      key: 'officer-private',
      actor: actor.id,
      target: t.id,
      kinds: taken.map((c) => c.kind),
      to: [actor.id, t.id],
    });
  }
  if (state.turn.trade) systemCancelTrade(state, 'timeout');
  log(state, { key: 'turn-skipped-' + reason, actor: state.turn.playerId });
  endTurnInternal(state);
}

/** A player leaves the game permanently. Their hand is discarded. */
export function removePlayer(state: GameState, playerId: string): void {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.gone) return;
  if (state.status !== 'playing') {
    p.gone = true;
    return;
  }
  const wasActive = state.turn.playerId === playerId;
  const tr = state.turn.trade;
  if (tr && (tr.proposerId === playerId || tr.targetId === playerId)) {
    state.turn.trade = null;
    log(state, { key: 'trade-expired-disconnect', actor: tr.proposerId, target: tr.targetId });
  }
  const pending = state.turn.pending;
  if (pending && pending.targetId === playerId) state.turn.pending = null;
  p.gone = true;
  state.discardPile.push(...p.hand);
  p.hand = [];
  for (const crow of state.crows) {
    if (crow.holderId === playerId) {
      crow.holderId = null;
      state.discardPile.push(...crow.stash);
      crow.stash = [];
    }
  }
  log(state, { key: 'player-left', actor: playerId });
  if (checkEnd(state)) return;
  if (wasActive) {
    state.turn.pending = null;
    endTurnInternal(state);
  } else if (state.turn.movesUsed >= state.config.movesPerTurn && !state.turn.pending && !state.turn.trade) {
    endTurnInternal(state);
  }
}

/** Host aborts the game: scored like the alternative ending, flagged as aborted. */
export function abortGame(state: GameState): void {
  if (state.status !== 'playing') return;
  finish(state, 'aborted', rankWinners(state));
}

export { countKinds, kindTotal };
export type { BaseIngredient };
