import type { LogEntry } from '../../game/types';
import type { GameView } from '../../game/view';
import type { CardKind } from '../../game/cards/catalog';
type ArtKind = CardKind | 'crow' | 'nasiLemak' | 'back';

export interface TableEvent {
  id: string;
  type: 'draw' | 'play' | 'make' | 'crow' | 'trade' | 'steal' | 'reshuffle';
  actor?: string;
  target?: string;
  kind: ArtKind;
  count?: number;
  packs?: number;
  duration: number;
}

const ACTION_KINDS = new Set<ArtKind>(['supplier', 'thief', 'wholesaler', 'officer', 'makcik', 'fly', 'swatter', 'fan', 'sioyen']);

/** Animate public events only. Face-down scores and other hands never enter the effect layer. */
export function tableEvents(entries: LogEntry[], v: GameView): TableEvent[] {
  const out: TableEvent[] = [];
  for (const e of entries) {
    const base = { id: `${e.turn}-${e.seq}`, actor: e.actor, target: e.target };
    if (e.to) continue;
    if (e.key === 'draw' && (e.n ?? 0) > 0) out.push({ ...base, type: 'draw', kind: 'back', count: e.n, duration: 850 });
    else if (e.key === 'make') {
      const ownValue = e.actor === v.youId ? entries.find(x => x.key === 'make-private' && x.actor === e.actor && x.seq > e.seq)?.n : undefined;
      out.push({ ...base, type: 'make', kind: 'nasiLemak', packs: ownValue, duration: 1700 });
    } else if (e.key === 'thief-take') out.push({ ...base, actor: e.target, target: e.actor, type: 'steal', kind: 'back', duration: 950 });
    else if (e.key === 'crow-arrives' || e.key === 'crow-pass') out.push({ ...base, type: 'crow', kind: 'crow', duration: 1000 });
    else if (e.key === 'trade-done') out.push({ ...base, type: 'trade', kind: 'back', duration: 1000 });
    else if (e.key === 'reshuffle') out.push({ ...base, type: 'reshuffle', kind: 'back', duration: 800 });
    else if (ACTION_KINDS.has(e.key as ArtKind)) out.push({ ...base, type: 'play', kind: e.key as ArtKind, duration: 1150 });
  }
  return out;
}
