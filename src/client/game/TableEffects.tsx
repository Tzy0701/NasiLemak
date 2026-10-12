import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { GameCard } from '../../components/GameCard';
import { CardArt } from '../../components/art/CardArt';
import type { GameView } from '../../game/view';
import { t } from '../i18n';
import { usePrefs } from '../prefs';
import { tableEvents, type TableEvent } from './animations';
import { kindName, useMediaQuery } from './helpers';

export function useTableEvents(v: GameView) {
  const [queue, setQueue] = useState<TableEvent[]>([]);
  const last = useRef<number | null>(null);
  const prefs = usePrefs();
  const osReduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const reduced = prefs.reducedMotion || osReduce;
  useEffect(() => {
    const max = v.log.at(-1)?.seq ?? 0;
    if (last.current === null || max < last.current) {
      last.current = max;
      setQueue([]);
      return;
    }
    const events = tableEvents(v.log.filter(e => e.seq > last.current!), v);
    last.current = max;
    if (events.length) setQueue(q => [...q, ...events].slice(-10));
  }, [v]);
  const event = queue[0];
  useEffect(() => {
    if (!event) return;
    const id = setTimeout(() => setQueue(q => q[0]?.id === event.id ? q.slice(1) : q), reduced ? 240 : event.duration);
    return () => clearTimeout(id);
  }, [event, reduced]);
  return { event, reduced };
}

type Point = { x: number; y: number };
export function TableEffects({ event, v, reduced }: { event?: TableEvent; v: GameView; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<{ from: Point; to: Point }>({ from: { x: 0, y: 0 }, to: { x: 0, y: 0 } });
  useEffect(() => {
    if (!event || !ref.current) return;
    const root = ref.current.getBoundingClientRect();
    const point = (el?: Element | null): Point => {
      if (!el) return { x: 0, y: 0 };
      const box = el.getBoundingClientRect();
      return { x: box.left + box.width / 2 - root.left - root.width / 2, y: box.top + box.height / 2 - root.top - root.height * .43 };
    };
    const player = (id?: string) => Array.from(document.querySelectorAll('[data-player-id]')).find(el => el.getAttribute('data-player-id') === id);
    const from = event.type === 'reshuffle' ? document.querySelector('[data-testid=discard-pile]') : event.type === 'draw' ? document.querySelector('[data-testid=draw-pile]') : event.type === 'crow' && !event.target ? document.querySelector('[data-testid=crow-pile]') : player(event.actor);
    const to = event.type === 'reshuffle' ? document.querySelector('[data-testid=draw-pile]') : event.type === 'draw' || event.type === 'make' ? player(event.actor) : event.target ? player(event.target) : event.type === 'crow' ? player(event.actor) : document.querySelector('[data-testid=discard-pile]');
    setPath({ from: point(from), to: point(to) });
  }, [event]);
  if (!event) return null;
  const name = (id?: string) => v.players.find(p => p.id === id)?.name ?? '';
  const title = event.type === 'draw' ? t('animation.draw', { name: name(event.actor), n: event.count })
    : event.type === 'make' ? t('animation.make', { name: name(event.actor) })
    : event.type === 'crow' ? t(event.target ? 'animation.chase' : 'animation.crow', { name: name(event.actor) })
    : event.type === 'trade' ? t('animation.trade')
    : event.type === 'reshuffle' ? t('animation.reshuffle')
    : t('animation.play', { name: name(event.actor), card: kindName(event.kind) });
  const style = { '--from-x': `${path.from.x}px`, '--from-y': `${path.from.y}px`, '--to-x': `${path.to.x}px`, '--to-y': `${path.to.y}px`, '--event-time': `${event.duration}ms` } as CSSProperties;
  return <div ref={ref} key={event.id} className={`table-effects event-${event.type} ${reduced ? 'effects-reduced' : ''}`} data-testid="table-effects" data-event={event.type} style={style}>
    <div className="event-halo" aria-hidden="true" />
    <div className="event-focus" aria-hidden="true">
      {event.type === 'make' ? <>
        <div className="recipe-orbit">{(['nasi', 'telur', 'kacang', 'sambal', 'timun'] as const).map((kind, i) => <span key={kind} className="recipe-mote" style={{ '--i': i } as CSSProperties}><CardArt kind={kind} /></span>)}</div>
        <div className="wrap-leaf leaf-left" /><div className="wrap-leaf leaf-right" />
        <div className="crafted-parcel"><GameCard kind="nasiLemak" size="md" packs={event.packs} /></div>
        <div className="event-sparkles">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</div>
      </> : event.type === 'draw' ? <div className="draw-flight">{Array.from({ length: Math.min(4, event.count ?? 1) }, (_, i) => <div key={i} className="flying-card" style={{ '--i': i } as CSSProperties}><GameCard kind="back" size="sm" /></div>)}</div>
      : event.type === 'trade' ? <div className="trade-flight"><GameCard kind="back" size="sm" /><GameCard kind="back" size="sm" /></div>
      : <div className="action-flight"><GameCard kind={event.kind} size="md" /></div>}
    </div>
    <div className="event-caption" role="status"><strong>{title}</strong>{event.target && <span>{t('animation.target', { name: name(event.target) })}</span>}</div>
  </div>;
}
