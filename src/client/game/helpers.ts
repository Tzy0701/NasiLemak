import { useEffect, useState } from 'react';
import { type Card, type CardKind, cardCategory, isIngredient, isTradeable } from '../../game/cards/catalog';
import { RECIPE_SIZE } from '../../game/rules/config';
import { findRecipe } from '../../game/rules/engine';
import type { LogEntry } from '../../game/types';
import type { GameView, PlayerView } from '../../game/view';
import { t } from '../i18n';

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    f();
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
}

const ORDER: CardKind[] = [
  'nasi',
  'telur',
  'kacang',
  'sambal',
  'timun',
  'rendang',
  'makcik',
  'supplier',
  'wholesaler',
  'thief',
  'officer',
  'fly',
  'swatter',
  'fan',
  'sioyen',
];

export function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.id.localeCompare(b.id));
}

export function kindName(k: CardKind | string): string {
  return t(`cards.${k}.name`);
}

export interface TableInfo {
  v: GameView;
  me: PlayerView | undefined;
  myTurn: boolean;
  canAct: boolean;
  opponents: PlayerView[];
  name: (id: string | undefined) => string;
}

export function tableInfo(v: GameView): TableInfo {
  const me = v.players.find((p) => p.id === v.youId);
  const myTurn = v.status === 'playing' && v.turn.playerId === v.youId;
  const canAct = myTurn && v.turn.movesLeft > 0 && !v.turn.pending && !v.turn.trade;
  const names = new Map(v.players.map((p) => [p.id, p.name]));
  // Opponents clockwise starting after me, so the table reads naturally.
  const idx = v.players.findIndex((p) => p.id === v.youId);
  const n = v.players.length;
  const opponents: PlayerView[] =
    idx < 0 ? [...v.players] : Array.from({ length: n - 1 }, (_, i) => v.players[(idx + i + 1) % n]!);
  return { v, me, myTurn, canAct, opponents, name: (id) => (id ? (names.get(id) ?? '?') : '?') };
}

/** Client-side hints only – the server is the authority. */
export function playableReason(info: TableInfo, card: Card): boolean {
  const { v, me, canAct, opponents } = info;
  if (!canAct || !me) return false;
  const live = opponents.filter((o) => !o.gone);
  switch (card.kind) {
    case 'supplier':
    case 'wholesaler':
      return true;
    case 'thief':
      return live.some((o) => o.handCount > 0);
    case 'officer':
      return live.length > 0;
    case 'makcik':
      return (
        !me.crow &&
        v.nlPileCount > 0 &&
        !!findRecipe(
          v.hand.filter((c) => c.id !== card.id),
          v.config.makcikIngredients,
        )
      );
    case 'fly':
      return live.some((o) => o.nasiLemak.some((n) => !n.hasFly));
    case 'swatter':
      return me.nasiLemak.some((n) => n.hasFly);
    case 'fan':
      return me.nasiLemak.some((n) => n.hasFly) && live.some((o) => o.nasiLemak.some((n) => !n.hasFly));
    case 'sioyen':
      return v.players.some((p) => p.crow);
    default:
      return false;
  }
}

export function canMake(info: TableInfo): boolean {
  const { v, me, canAct } = info;
  return canAct && !!me && !me.crow && v.nlPileCount > 0 && !!findRecipe(v.hand, RECIPE_SIZE);
}

export function canChaseCrow(info: TableInfo): boolean {
  const { v, me, canAct, opponents } = info;
  return canAct && !!me?.crow && v.hand.some((c) => isIngredient(c.kind)) && opponents.some((o) => !o.gone && !o.crow);
}

export function canTrade(info: TableInfo): boolean {
  return info.canAct && info.v.hand.some((c) => isTradeable(c.kind)) && info.opponents.some((o) => !o.gone && o.handCount > 0);
}

export function formatLog(e: LogEntry, info: TableInfo): string {
  const params = {
    actor: info.name(e.actor),
    target: info.name(e.target),
    n: e.n,
    m: e.m,
    kinds: e.kinds?.map(kindName).join(', '),
    ingredient: e.ingredient ? kindName(e.ingredient) : undefined,
  };
  return t(`log.${e.key}`, params);
}

export function categoryOf(kind: CardKind) {
  return cardCategory(kind);
}
