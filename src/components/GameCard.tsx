import { type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { cardCategory, isIngredient, type CardKind } from '../game/cards/catalog';
import { t } from '../client/i18n';
import { useCardCopy } from './CardRules';
import { ART_ROOT, CardArt, type ArtKind } from './art/CardArt';
export type CardSize = 'xs' | 'sm' | 'md' | 'lg';
type Theme = { frame: string; band: string; text: string };
const FRAME: Record<ArtKind, string> = {
  nasi: '#6f954d', telur: '#d7a048', kacang: '#b87942', sambal: '#be4936', timun: '#6a9353', rendang: '#aa7433',
  supplier: '#a65d33', thief: '#a34045', wholesaler: '#925b87', officer: '#446b7b', makcik: '#426947',
  fly: '#4a4b47', swatter: '#457da1', fan: '#b27830', sioyen: '#d76a35', crow: '#414447', nasiLemak: '#bd944a', back: '#275638',
};
export function themeFor(kind: ArtKind): Theme { return { frame: FRAME[kind], band: FRAME[kind], text: '#fff7df' }; }
export function cardName(kind: ArtKind): string { return t(`cards.${kind}.name`); }
interface Props {
  kind: ArtKind; size?: CardSize; selected?: boolean; dimmed?: boolean; highlight?: boolean;
  /** Undefined means hidden: always use the identical scoring back. */
  packs?: number; fly?: boolean; onClick?: (e: MouseEvent) => void; label?: string;
  className?: string; style?: CSSProperties; showText?: boolean; testId?: string;
}
export function GameCard({ kind, size = 'md', selected, dimmed, highlight, packs, fly, onClick, label, className = '', style, showText, testId }: Props) {
  const copy = useCardCopy(kind);
  const name = kind === 'back' ? '' : cardName(kind);
  const local = kind === 'back' ? '' : t(`cards.${kind}.local`);
  const ingredient = kind !== 'crow' && kind !== 'nasiLemak' && kind !== 'back' && isIngredient(kind);
  const action = !ingredient && kind !== 'nasiLemak' && kind !== 'back';
  const hidden = kind === 'back' || (kind === 'nasiLemak' && packs === undefined);
  const detail = size === 'lg' || showText;
  const onKey = (e: KeyboardEvent) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(e as unknown as MouseEvent); } };
  return <div role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} aria-label={label ?? `${name}${packs !== undefined ? ` (${packs})` : ''}`}
    aria-pressed={onClick && selected !== undefined ? selected : undefined} data-testid={testId} data-kind={kind} data-face={hidden ? 'back' : 'front'} onClick={onClick} onKeyDown={onKey}
    className={`game-card card-${size} ${hidden ? 'card-hidden' : ''} ${action ? 'card-action' : ''} ${ingredient ? 'card-ingredient' : ''} ${selected ? 'is-selected' : ''} ${highlight ? 'is-highlighted' : ''} ${dimmed ? 'is-dimmed' : ''} ${onClick ? 'is-interactive' : ''} ${className}`}
    style={{ '--card-color': FRAME[kind], ...style } as CSSProperties}>
    <div className={`card-face ${kind === 'nasiLemak' && !hidden ? 'card-scoring-face' : ''}`}>
      {hidden ? <img className="card-back-image" src={`${ART_ROOT}/${kind === 'back' ? 'draw-back' : 'score-back'}.png`} alt="" draggable={false} decoding="async" /> : <>
        {action && size !== 'xs' && <div className="card-ribbon"><span>{name}</span><small>{local}</small></div>}
        {ingredient && <div className="ingredient-corners" aria-hidden="true">{[0, 1, 2, 3].map(i => <CardArt key={i} kind={kind} className={`corner corner-${i}`} />)}</div>}
        <div className={`card-picture ${kind === 'nasiLemak' && packs === 2 ? 'two-parcels' : ''}`}>
          <CardArt kind={kind} className="card-main-art" />
          {kind === 'nasiLemak' && packs === 2 && <CardArt kind="nasiLemak" className="card-second-parcel" />}
        </div>
        {ingredient && size !== 'xs' && <div className="ingredient-name"><strong>{name}</strong><small>{local}</small></div>}
        {kind === 'nasiLemak' && packs !== undefined && <span className="pack-value">{size === 'xs' ? packs : t('common.packs', { n: packs })}</span>}
        {size !== 'xs' && (action || kind === 'rendang') && <div className="card-effect">{copy.short}</div>}
      </>}
      {fly && <div className="card-fly-overlay"><CardArt kind="fly" className="h-full w-full" /></div>}
      {selected && <span className="card-check" aria-hidden="true">✓</span>}
    </div>
    {detail && kind !== 'back' && <div className="card-description"><strong>{kind === 'crow' ? t('category.special') : kind === 'nasiLemak' ? local : t(`category.${cardCategory(kind as CardKind)}`)}</strong><p>{copy.text}</p></div>}
  </div>;
}
