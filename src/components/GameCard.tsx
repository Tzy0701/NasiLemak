import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { type CardKind, cardCategory } from '../game/cards/catalog';
import { t } from '../client/i18n';
import { type ArtKind, CardArt } from './art/CardArt';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE: Record<CardSize, { w: string; title: string; sub: string; radius: string; border: string }> = {
  xs: { w: 'w-9', title: 'text-[0px]', sub: 'hidden', radius: 'rounded-md', border: 'border-2' },
  sm: { w: 'w-[4.4rem]', title: 'text-[0.6rem]', sub: 'text-[0.5rem]', radius: 'rounded-xl', border: 'border-[3px]' },
  md: { w: 'w-[6.2rem]', title: 'text-[0.78rem]', sub: 'text-[0.62rem]', radius: 'rounded-2xl', border: 'border-4' },
  lg: { w: 'w-[15rem]', title: 'text-xl', sub: 'text-sm', radius: 'rounded-3xl', border: 'border-[6px]' },
};

const STRIPES = 'repeating-linear-gradient(115deg, rgba(255,255,255,0.12) 0 6px, rgba(255,255,255,0) 6px 14px)';

type Theme = { frame: string; band: string; text: string };
const THEMES: Record<string, Theme> = {
  ingredient: { frame: '#4f9a45', band: '#4f9a45', text: '#fff' },
  wildcard: { frame: '#8c4a2b', band: 'linear-gradient(90deg,#8c4a2b,#c4762f)', text: '#ffe7a3' },
  action: { frame: '#d6402b', band: '#d6402b', text: '#fff' },
  defence: { frame: '#2d7fb8', band: '#2d7fb8', text: '#fff' },
  special: { frame: '#e07a1f', band: '#e07a1f', text: '#fff' },
  crow: { frame: '#2c2c3a', band: '#2c2c3a', text: '#e8e8f0' },
  nasiLemak: { frame: '#d48a1a', band: 'linear-gradient(90deg,#f2b134,#ffd86b,#f2b134)', text: '#4a3426' },
  back: { frame: '#234f20', band: '#234f20', text: '#fff' },
};

export function themeFor(kind: ArtKind): Theme {
  if (kind === 'crow' || kind === 'nasiLemak' || kind === 'back') return THEMES[kind]!;
  return THEMES[cardCategory(kind as CardKind)]!;
}

export function cardName(kind: ArtKind): string {
  return t(`cards.${kind}.name`);
}

interface Props {
  kind: ArtKind;
  size?: CardSize;
  selected?: boolean;
  dimmed?: boolean;
  highlight?: boolean;
  /** For Nasi Lemak cards: visible pack value (only when known). */
  packs?: number;
  /** Fly overlay on a Nasi Lemak card. */
  fly?: boolean;
  onClick?: (e: MouseEvent) => void;
  label?: string;
  className?: string;
  style?: CSSProperties;
  showText?: boolean;
  testId?: string;
}

export function GameCard({
  kind,
  size = 'md',
  selected,
  dimmed,
  highlight,
  packs,
  fly,
  onClick,
  label,
  className = '',
  style,
  showText,
  testId,
}: Props) {
  const s = SIZE[size];
  const theme = themeFor(kind);
  const interactive = !!onClick;
  const name = kind === 'back' ? '' : cardName(kind);
  const local = kind === 'back' ? '' : t(`cards.${kind}.local`);
  const onKey = (e: KeyboardEvent) => {
    if (interactive && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick?.(e as unknown as MouseEvent);
    }
  };
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={label ?? (name + (packs ? ` (${packs})` : ''))}
      aria-pressed={interactive && selected !== undefined ? selected : undefined}
      data-testid={testId}
      data-kind={kind}
      onClick={onClick}
      onKeyDown={onKey}
      style={{ borderColor: theme.frame, ...style }}
      className={[
        'relative flex shrink-0 select-none flex-col overflow-hidden bg-santan-50 shadow-card transition-transform duration-150',
        size === 'lg' || showText ? '' : 'aspect-[5/7]',
        s.w,
        s.radius,
        s.border,
        interactive ? 'cursor-pointer hover:-translate-y-1' : '',
        selected ? '-translate-y-2 ring-4 ring-kunyit-400 hover:-translate-y-2' : '',
        highlight ? 'ring-4 ring-leaf-300' : '',
        dimmed ? 'opacity-45 saturate-50' : '',
        className,
      ].join(' ')}
    >
      {kind === 'back' ? (
        <CardArt kind="back" className="h-full w-full" />
      ) : (
        <>
          {size !== 'xs' && (
            <div
              className={`leaf-stripes flex items-center justify-center px-1 py-[0.2em] text-center font-display font-semibold leading-tight ${s.title}`}
              style={
                theme.band.startsWith('linear')
                  ? { backgroundImage: `${STRIPES}, ${theme.band}`, color: theme.text }
                  : { backgroundColor: theme.band, color: theme.text }
              }
            >
              <span className="truncate">{name}</span>
            </div>
          )}
          <div
            className={`relative flex min-h-0 items-center justify-center bg-gradient-to-b from-santan-50 to-santan-200 ${
              size === 'lg' || showText ? 'aspect-square flex-none' : 'flex-1'
            }`}
          >
            <CardArt kind={kind} className="h-full w-full" />
            {kind === 'nasiLemak' && packs !== undefined && (
              <div
                className={`absolute right-[6%] top-[6%] flex aspect-square items-center justify-center rounded-full bg-sambal-500 font-display font-bold text-white shadow ${
                  size === 'xs' ? 'w-4 text-[0.6rem]' : size === 'lg' ? 'w-12 text-2xl' : 'w-6 text-xs'
                }`}
              >
                {packs}
              </div>
            )}
            {fly && (
              <div className="absolute inset-0 flex items-center justify-center bg-kopi-900/25">
                <CardArt kind="fly" className="h-3/4 w-3/4 animate-float drop-shadow" />
              </div>
            )}
          </div>
          {size !== 'xs' && size !== 'sm' && (
            <div className={`px-1 pb-[0.25em] pt-[0.1em] text-center italic text-kopi-700 ${s.sub}`}>{local}</div>
          )}
          {(showText || size === 'lg') && (
            <div className="border-t-2 border-santan-300 bg-white/80 px-3 py-2 text-left text-[0.8rem] leading-snug text-kopi-800">
              <div className="mb-1 text-[0.65rem] font-bold uppercase tracking-wide" style={{ color: theme.frame }}>
                {kind === 'crow'
                  ? t('category.special')
                  : kind === 'nasiLemak'
                    ? t('cards.nasiLemak.local')
                    : t(`category.${cardCategory(kind as CardKind)}`)}
              </div>
              {t(`cards.${kind}.text`)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
