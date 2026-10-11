import { Avatar } from '../../components/Avatar';
import { GameCard } from '../../components/GameCard';
import { CrownIcon } from '../../components/Icons';
import { CardArt } from '../../components/art/CardArt';
import type { Card } from '../../game/cards/catalog';
import type { GameView, PlayerView } from '../../game/view';
import type { MemberView } from '../../shared/protocol';
import { t } from '../i18n';
import { kindName } from './helpers';

/** Compact public view of an opponent. */
export function OpponentSeat({
  p,
  member,
  active,
  onClick,
  selectable,
  compact,
}: {
  p: PlayerView;
  member?: MemberView;
  active: boolean;
  onClick?: () => void;
  selectable?: boolean;
  compact?: boolean;
}) {
  const offline = member ? !member.connected : true;
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => onClick && (e.key === 'Enter' || e.key === ' ') && onClick()}
      data-testid="opponent-seat"
      data-player={p.name}
      className={[
        'opponent-seat relative flex shrink-0 flex-col gap-1 rounded-2xl border-2 p-2 shadow-card transition',
        compact ? 'w-[8.6rem]' : 'w-[10.5rem]',
        active ? 'is-active border-kunyit-400' : '',
        selectable ? 'cursor-pointer ring-4 ring-leaf-300 hover:-translate-y-0.5' : '',
        p.gone ? 'opacity-40 grayscale' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <div className="relative">
          <Avatar id={p.id} name={p.name} size={compact ? 30 : 48} ring={active} bot={member?.isBot} avatar={member?.avatar} />
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${offline ? 'bg-santan-400' : 'bg-leaf-400'}`}
            title={offline ? t('common.offline') : t('common.online')}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 truncate text-sm font-bold leading-tight">
            {member?.isHost && <CrownIcon className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{p.name}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-kopi-700" data-testid="hand-count">
            <span className="inline-block h-3.5 w-2.5 rounded-[3px] border border-leaf-800 bg-leaf-600" />
            {t('game.cardsInHand', { n: p.handCount })}
          </div>
        </div>
      </div>
      <div className="opponent-hand-fan" aria-hidden="true">{Array.from({ length: Math.min(5, p.handCount) }, (_, i) => <GameCard key={i} kind="back" size="xs" />)}</div>
      <div className="opponent-scorecards flex flex-wrap items-center gap-1">
        {p.nasiLemak.length === 0 && <span className="text-[0.65rem] italic text-kopi-700/70">{t('game.noNasiLemak')}</span>}
        {p.nasiLemak.map((nl) => (
          <GameCard key={nl.id} kind="nasiLemak" size="xs" fly={nl.hasFly} packs={nl.packs} label={nl.hasFly ? t('game.flyHere') : t('cards.nasiLemak.name')} />
        ))}
      </div>
      {p.crow && (
        <div className="absolute -right-2 -top-2 flex items-center gap-0.5 rounded-full bg-kopi-900 py-0.5 pl-0.5 pr-2 text-[0.65rem] font-bold text-white shadow" title={t('game.crowHere')} data-testid="crow-badge">
          <CardArt kind="crow" className="h-6 w-6" />
          {p.crow.stashCount}
        </div>
      )}
    </div>
  );
}

export function PileStack({
  label,
  count,
  kind,
  top,
  testId,
}: {
  label: string;
  count: number;
  kind: 'back' | 'nasiLemak' | 'crow';
  top?: Card | null;
  testId?: string;
}) {
  const showTop = top !== undefined;
  return (
    <div className="flex flex-col items-center gap-1" data-testid={testId}>
      <div className="relative">
        {count > 1 && !showTop && (
          <div className="absolute left-1 top-1 opacity-70">
            <GameCard kind={kind} size="sm" />
          </div>
        )}
        {showTop ? (
          top ? (
            <GameCard kind={top.kind} size="sm" />
          ) : (
            <div className="aspect-[5/7] w-[4.4rem] rounded-xl border-2 border-dashed border-white/40" />
          )
        ) : count > 0 ? (
          <div className="relative">
            <GameCard kind={kind} size="sm" />
          </div>
        ) : (
          <div className="aspect-[5/7] w-[4.4rem] rounded-xl border-2 border-dashed border-white/40" />
        )}
        <span className="pile-count absolute -bottom-2 -right-2 rounded-full px-2 py-0.5 text-xs font-bold shadow" data-testid={testId ? `${testId}-count` : undefined}>
          {count}
        </span>
      </div>
      <span className="pile-label font-bold">{label}</span>
    </div>
  );
}

export function CenterPiles({ v, name }: { v: GameView; name: (id: string) => string }) {
  return (
    <div className="center-piles flex flex-col items-center gap-2">
      <div className="center-pile-row flex items-end justify-center gap-4 sm:gap-6" data-piles={v.config.crows > 0 ? 4 : 3}>
        <PileStack label={t('game.drawPile')} count={v.drawCount} kind="back" testId="draw-pile" />
        <PileStack label={t('game.discard')} count={v.discardCount} kind="back" top={v.discardTop} testId="discard-pile" />
        <PileStack label={t('game.nlPile')} count={v.nlPileCount} kind="nasiLemak" testId="nl-pile" />
        {v.config.crows > 0 && <PileStack label={t('game.crowPile')} count={v.crowPile.length} kind="crow" testId="crow-pile" />}
      </div>
      {v.lastReveal && (
        <div className="flex animate-pop items-center gap-2 rounded-2xl bg-kopi-900/40 px-3 py-1.5 text-xs font-semibold text-white" data-testid="last-reveal">
          <span>{t('game.revealed', { name: name(v.lastReveal.actorId) })}:</span>
          {v.lastReveal.cards.map((c) => (
            <span key={c.id} className={v.lastReveal!.kept.includes(c.id) ? '' : 'opacity-50 line-through'}>
              {kindName(c.kind)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
