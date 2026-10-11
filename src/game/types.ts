import type { BaseIngredient, Card, CardKind, NasiLemakCard } from './cards/catalog';
import type { GameConfig, GameMode } from './rules/config';
import type { RngState } from './rng';

export type KindCount = Partial<Record<CardKind, number>>;

export interface PlacedNasiLemak {
  card: NasiLemakCard;
  /** Fly card sitting on this Nasi Lemak (it does not count while flied). */
  fly: Card | null;
}

export interface PlayerState {
  id: string;
  name: string;
  hand: Card[];
  nasiLemak: PlacedNasiLemak[];
  /** Player left the game for good; skipped in turn order and untargetable. */
  gone: boolean;
}

export interface CrowState {
  id: string;
  /** null = in the Crow pile in the middle. */
  holderId: string | null;
  /** Ingredients 'given' to the Crow when it was chased away. */
  stash: Card[];
}

/**
 * A trade negotiation. The side that made the latest offer ("offerer") names
 * concrete cards from their own hand; they can only ask for card *kinds* from
 * the other side, because they cannot see that hand.
 */
export interface TradeState {
  id: string;
  /** Always the active player – only they may initiate a negotiation. */
  proposerId: string;
  targetId: string;
  /** Player who must answer now. */
  awaitingId: string;
  /** Concrete card ids from the player who is NOT awaiting. */
  offerCardIds: string[];
  /** Kinds requested from the awaiting player. */
  wantKinds: KindCount;
  round: number;
}

export interface PendingOfficer {
  type: 'officer';
  actorId: string;
  targetId: string;
  take: number;
}

export type PendingChoice = PendingOfficer;

export interface TurnState {
  playerId: string;
  number: number;
  movesUsed: number;
  /** Cards drawn at the start of this turn (ids), shown to the drawer. */
  drawnIds: string[];
  pending: PendingChoice | null;
  trade: TradeState | null;
  /** Wall-clock deadline (ms) for the turn timer, if enabled. Set by the room. */
  deadline: number | null;
}

export type EndReason = 'target' | 'nl-depleted' | 'players-left' | 'aborted';

export interface GameResult {
  reason: EndReason;
  winnerIds: string[];
  standings: { playerId: string; packs: number; cards: number; fliedCards: number }[];
}

/**
 * Log entries are structured so the client can render them with i18n.
 * `to` restricts visibility to specific players (private information).
 */
export interface LogEntry {
  seq: number;
  turn: number;
  key: string;
  actor?: string;
  target?: string;
  kinds?: CardKind[];
  ingredient?: BaseIngredient;
  n?: number;
  m?: number;
  to?: string[];
}

export interface GameState {
  mode: GameMode;
  config: GameConfig;
  players: PlayerState[];
  drawPile: Card[];
  discardPile: Card[];
  nlPile: NasiLemakCard[];
  crows: CrowState[];
  turn: TurnState;
  status: 'playing' | 'finished';
  result: GameResult | null;
  log: LogEntry[];
  logSeq: number;
  /** Cards revealed by the last Wholesaler (public). */
  lastReveal: { actorId: string; cards: Card[]; kept: string[] } | null;
  rng: RngState;
  /** Monotonic counter for generated ids (trades). */
  idSeq: number;
  /** Times the discard pile was reshuffled into the draw pile. */
  reshuffles: number;
  /** Count of moves made in the game (for stats / bots). */
  totalMoves: number;
}

export type PlayAction =
  | { type: 'play'; cardId: string; card: 'supplier'; ingredient: BaseIngredient }
  | { type: 'play'; cardId: string; card: 'thief' }
  | { type: 'play'; cardId: string; card: 'wholesaler' }
  | { type: 'play'; cardId: string; card: 'officer'; targetId: string }
  | { type: 'play'; cardId: string; card: 'makcik'; ingredientIds: string[] }
  | { type: 'play'; cardId: string; card: 'fly'; targetId: string; nlId: string }
  | { type: 'play'; cardId: string; card: 'swatter'; nlId: string }
  | { type: 'play'; cardId: string; card: 'fan'; fromNlId: string; targetId: string; toNlId: string }
  | { type: 'play'; cardId: string; card: 'sioyen'; crowId: string };

export type GameAction =
  | { type: 'make'; cardIds: string[] }
  | PlayAction
  | { type: 'officerTake'; cardIds: string[] }
  | { type: 'passCrow'; crowId: string; cardId: string; targetId: string }
  | { type: 'proposeTrade'; targetId: string; offerCardIds: string[]; wantKinds: KindCount }
  | { type: 'respondTrade'; tradeId: string; response: 'accept' | 'reject' }
  | { type: 'counterTrade'; tradeId: string; offerCardIds: string[]; wantKinds: KindCount }
  | { type: 'cancelTrade'; tradeId: string }
  | { type: 'endTurn' };

export type ActionResult = { ok: true } | { ok: false; error: string };
