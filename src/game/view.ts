/**
 * Projection of the authoritative GameState into what ONE player may see.
 * This is the only game data ever sent to a browser, so hidden information
 * (other hands, draw-pile order, face-down Nasi Lemak values) never leaves
 * the server.
 */
import type { Card, CardKind } from './cards/catalog';
import type { GameConfig, GameMode } from './rules/config';
import { crowOf, movesLeft, packsOf } from './rules/engine';
import type { GameResult, GameState, KindCount, LogEntry } from './types';

export interface NasiLemakView {
  id: string;
  hasFly: boolean;
  /** Only present for the owner, or for everyone after the game ends. */
  packs?: number;
}

export interface PlayerView {
  id: string;
  name: string;
  handCount: number;
  nasiLemak: NasiLemakView[];
  /** Crow in front of this player (public), with the number of stashed ingredients. */
  crow: { id: string; stashCount: number; stashKinds: CardKind[] } | null;
  gone: boolean;
  /** Visible packs: own exact count; for others only after game end. */
  packs?: number;
}

export interface TradeView {
  id: string;
  proposerId: string;
  targetId: string;
  awaitingId: string;
  round: number;
  /** Details only for the two participants. */
  offerCards?: Card[];
  offererId?: string;
  wantKinds?: KindCount;
}

export interface GameView {
  mode: GameMode;
  config: GameConfig;
  youId: string | null;
  hand: Card[];
  players: PlayerView[];
  drawCount: number;
  discardCount: number;
  discardTop: Card | null;
  nlPileCount: number;
  crowPile: string[];
  turn: {
    playerId: string;
    number: number;
    movesUsed: number;
    movesLeft: number;
    deadline: number | null;
    /** Ids of the cards you drew this turn (only for the active player). */
    drawnIds: string[];
    pending: null | {
      type: 'officer';
      actorId: string;
      targetId: string;
      take: number;
      /** Target's hand, revealed ONLY to the Officer's player. */
      targetHand?: Card[];
    };
    trade: TradeView | null;
  };
  lastReveal: GameState['lastReveal'];
  status: GameState['status'];
  result: (GameResult & { revealed: Record<string, number[]> }) | null;
  log: LogEntry[];
}

export function projectGame(state: GameState, viewerId: string | null, logLimit = 80): GameView {
  const me = viewerId ? state.players.find((p) => p.id === viewerId) : undefined;
  const finished = state.status === 'finished';
  const turn = state.turn;

  const players: PlayerView[] = state.players.map((p) => {
    const crow = crowOf(state, p.id);
    const showValues = finished || p.id === viewerId;
    return {
      id: p.id,
      name: p.name,
      handCount: p.hand.length,
      nasiLemak: p.nasiLemak.map((nl) => ({
        id: nl.card.id,
        hasFly: nl.fly !== null,
        ...(showValues ? { packs: nl.card.packs } : {}),
      })),
      // Ingredients under the Crow are placed face up on the table.
      crow: crow ? { id: crow.id, stashCount: crow.stash.length, stashKinds: crow.stash.map((c) => c.kind) } : null,
      gone: p.gone,
      ...(showValues ? { packs: packsOf(p) } : {}),
    };
  });

  let pending: GameView['turn']['pending'] = null;
  if (turn.pending) {
    const pd = turn.pending;
    pending = { type: pd.type, actorId: pd.actorId, targetId: pd.targetId, take: pd.take };
    if (viewerId === pd.actorId) {
      const target = state.players.find((p) => p.id === pd.targetId);
      pending.targetHand = target ? target.hand.map((c) => ({ ...c })) : [];
    }
  }

  let trade: TradeView | null = null;
  if (turn.trade) {
    const tr = turn.trade;
    trade = {
      id: tr.id,
      proposerId: tr.proposerId,
      targetId: tr.targetId,
      awaitingId: tr.awaitingId,
      round: tr.round,
    };
    if (viewerId === tr.proposerId || viewerId === tr.targetId) {
      const offererId = tr.awaitingId === tr.proposerId ? tr.targetId : tr.proposerId;
      const offerer = state.players.find((p) => p.id === offererId)!;
      trade.offererId = offererId;
      trade.offerCards = tr.offerCardIds
        .map((id) => offerer.hand.find((c) => c.id === id))
        .filter((c): c is Card => !!c)
        .map((c) => ({ ...c }));
      trade.wantKinds = { ...tr.wantKinds };
    }
  }

  const visibleLog = state.log.filter((e) => !e.to || (viewerId !== null && e.to.includes(viewerId)));

  return {
    mode: state.mode,
    config: state.config,
    youId: me ? me.id : null,
    hand: me ? me.hand.map((c) => ({ ...c })) : [],
    players,
    drawCount: state.drawPile.length,
    discardCount: state.discardPile.length,
    discardTop: state.discardPile.length ? { ...state.discardPile[state.discardPile.length - 1]! } : null,
    nlPileCount: state.nlPile.length,
    crowPile: state.crows.filter((c) => c.holderId === null).map((c) => c.id),
    turn: {
      playerId: turn.playerId,
      number: turn.number,
      movesUsed: turn.movesUsed,
      movesLeft: movesLeft(state),
      deadline: turn.deadline,
      drawnIds: viewerId === turn.playerId ? [...turn.drawnIds] : [],
      pending,
      trade,
    },
    lastReveal: state.lastReveal
      ? { actorId: state.lastReveal.actorId, cards: state.lastReveal.cards.map((c) => ({ ...c })), kept: [...state.lastReveal.kept] }
      : null,
    status: state.status,
    result: state.result
      ? {
          ...state.result,
          revealed: Object.fromEntries(state.players.map((p) => [p.id, p.nasiLemak.map((nl) => nl.card.packs)])),
        }
      : null,
    log: visibleLog.slice(-logLimit),
  };
}
