import type { CSSProperties } from 'react';
import type { CardKind } from '../../game/cards/catalog';
export type ArtKind = CardKind | 'crow' | 'nasiLemak' | 'back';
export const ART_ROOT = '/art/heritage-v1';
const CELLS: Partial<Record<ArtKind, { file: string; columns: number; rows: number; cell: number }>> = {
  nasi: { file: 'ingredients', columns: 3, rows: 2, cell: 0 },
  telur: { file: 'ingredients', columns: 3, rows: 2, cell: 1 },
  kacang: { file: 'ingredients', columns: 3, rows: 2, cell: 2 },
  sambal: { file: 'ingredients', columns: 3, rows: 2, cell: 3 },
  timun: { file: 'ingredients', columns: 3, rows: 2, cell: 4 },
  rendang: { file: 'ingredients', columns: 3, rows: 2, cell: 5 },
  supplier: { file: 'characters', columns: 3, rows: 2, cell: 0 },
  thief: { file: 'characters', columns: 3, rows: 2, cell: 1 },
  wholesaler: { file: 'characters', columns: 3, rows: 2, cell: 2 },
  officer: { file: 'characters', columns: 3, rows: 2, cell: 3 },
  makcik: { file: 'characters', columns: 3, rows: 2, cell: 4 },
  fly: { file: 'tools', columns: 2, rows: 2, cell: 0 },
  swatter: { file: 'tools', columns: 2, rows: 2, cell: 1 },
  fan: { file: 'tools', columns: 2, rows: 2, cell: 2 },
  sioyen: { file: 'tools', columns: 2, rows: 2, cell: 3 },
};
/** Crop equal-cell transparent PNG atlases in the browser, leaving source images intact. */
export function spriteStyle(file: string, columns: number, rows: number, cell: number): CSSProperties {
  return { backgroundImage: `url(${ART_ROOT}/${file}.png)`, backgroundSize: `${columns * 100}% ${rows * 100}%`,
    backgroundPosition: `${columns > 1 ? (cell % columns) * 100 / (columns - 1) : 0}% ${rows > 1 ? Math.floor(cell / columns) * 100 / (rows - 1) : 0}%`, backgroundRepeat: 'no-repeat' };
}
export function CardArt({ kind, className = '' }: { kind: ArtKind; className?: string }) {
  const c = CELLS[kind];
  if (c) return <span aria-hidden="true" className={`raster-art ${className}`} data-art={kind} style={spriteStyle(c.file, c.columns, c.rows, c.cell)} />;
  const file = kind === 'back' ? 'draw-back' : kind === 'nasiLemak' ? 'parcel' : 'crow';
  return <img src={`${ART_ROOT}/${file}.png`} alt="" aria-hidden="true" draggable={false} decoding="async" className={`raster-art object-contain ${className}`} data-art={kind} />;
}
