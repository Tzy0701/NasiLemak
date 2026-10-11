/**
 * Original vector illustrations for every card. Drawn for this project in a
 * "cute Malaysian hawker stall" style: round shapes, little faces, banana
 * leaves and warm tropical colours. All art is inline SVG (no image assets).
 */
import type { ReactElement } from 'react';
import type { CardKind } from '../../game/cards/catalog';

export type ArtKind = CardKind | 'crow' | 'nasiLemak' | 'back';

const INK = '#2b1a12';

/** Typed point list helper (keeps strict index checks happy). */
function pts<T extends number[]>(list: T[]): [number, number, number, number][] {
  return list as unknown as [number, number, number, number][];
}

function Face({ x, y, s = 1, mood = 'happy' }: { x: number; y: number; s?: number; mood?: 'happy' | 'sly' | 'shock' | 'calm' }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {mood === 'sly' ? (
        <>
          <path d="M-10 -1 Q-7 -4 -4 -1" stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />
          <path d="M4 -1 Q7 -4 10 -1" stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx={-7} cy={0} rx={2.6} ry={mood === 'shock' ? 3.6 : 3.1} fill={INK} />
          <circle cx={-6.1} cy={-1.3} r={0.95} fill="#fff" />
          <ellipse cx={7} cy={0} rx={2.6} ry={mood === 'shock' ? 3.6 : 3.1} fill={INK} />
          <circle cx={7.9} cy={-1.3} r={0.95} fill="#fff" />
        </>
      )}
      <ellipse cx={-11.5} cy={5} rx={3.2} ry={1.9} fill="#ff7f86" opacity={0.55} />
      <ellipse cx={11.5} cy={5} rx={3.2} ry={1.9} fill="#ff7f86" opacity={0.55} />
      {mood === 'shock' ? (
        <ellipse cx={0} cy={6} rx={2.2} ry={2.6} fill={INK} />
      ) : mood === 'sly' ? (
        <path d="M-4 4 Q1 8 5 3" stroke={INK} strokeWidth={1.7} fill="none" strokeLinecap="round" />
      ) : mood === 'calm' ? (
        <path d="M-2.5 4.5 Q0 6 2.5 4.5" stroke={INK} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      ) : (
        <path d="M-3.4 3.6 Q0 8 3.4 3.6" stroke={INK} strokeWidth={1.7} fill="none" strokeLinecap="round" />
      )}
    </g>
  );
}

function Leaf({ d = 'M8 84 L60 56 L112 84 L60 112 Z' }: { d?: string }) {
  return (
    <g>
      <path d={d} fill="#4f9a45" />
      <path d={d} fill="url(#leafShine)" opacity={0.35} />
      <path d="M14 84 L106 84" stroke="#3a7a33" strokeWidth={1.4} />
      <path d="M30 84 L45 74 M50 84 L64 72 M70 84 L82 74 M30 84 L45 94 M50 84 L64 96 M70 84 L82 94" stroke="#3a7a33" strokeWidth={0.9} />
    </g>
  );
}

/**
 * Shared gradients/patterns. Rendered ONCE at the app root (see <ArtDefs/>)
 * so inline card SVGs never duplicate element ids.
 */
export function ArtDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
    <defs>
      <linearGradient id="leafShine" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.45" r="0.6">
        <stop offset="0" stopColor="#fff7d6" />
        <stop offset="1" stopColor="#fff7d6" stopOpacity={0} />
      </radialGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffd86b" />
        <stop offset="0.5" stopColor="#f2b134" />
        <stop offset="1" stopColor="#d48a1a" />
      </linearGradient>
      <pattern id="weave" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill="#e7c37f" />
        <path d="M0 2 H8 M0 6 H8" stroke="#c99b51" strokeWidth={1.2} />
        <path d="M2 0 V2 M6 2 V6 M2 6 V8" stroke="#b5863e" strokeWidth={1.2} />
      </pattern>
    </defs>
    </svg>
  );
}

const arts: Record<ArtKind, () => ReactElement> = {
  nasi: () => (
    <>
      <Leaf />
      <path d="M26 82 Q26 40 60 36 Q94 40 94 82 Q60 96 26 82 Z" fill="#fffbf2" stroke="#eadfc8" strokeWidth={1.5} />
      <path d="M34 78 Q34 50 52 44" stroke="#fff" strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.9} />
      {[
        [44, 52],
        [70, 48],
        [78, 66],
        [40, 70],
        [62, 78],
        [84, 76],
      ].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx={2.6} ry={1.3} fill="#efe4cc" transform={`rotate(${i * 37} ${x} ${y})`} />
      ))}
      <path d="M78 38 Q90 22 100 30 Q92 34 84 42 Z" fill="#6fbf4b" />
      <path d="M80 39 Q90 30 98 31" stroke="#4f9a45" strokeWidth={1} fill="none" />
      <Face x={60} y={64} />
    </>
  ),
  telur: () => (
    <>
      <Leaf />
      <ellipse cx={58} cy={68} rx={30} ry={24} fill="#fffdf7" stroke="#e9e1cf" strokeWidth={1.5} />
      <circle cx={58} cy={68} r={15} fill="#ffc42e" />
      <circle cx={58} cy={68} r={15} fill="#f59f0b" opacity={0.25} />
      <ellipse cx={52} cy={62} rx={4} ry={2.5} fill="#ffe28a" />
      <Face x={58} y={69} s={0.8} />
      <path d="M88 52 Q100 60 98 76 Q90 84 82 78 Q86 64 88 52 Z" fill="#fffdf7" stroke="#e9e1cf" strokeWidth={1.2} />
      <path d="M90 60 Q96 66 94 74 Q89 76 87 72 Q89 66 90 60Z" fill="#ffc42e" />
    </>
  ),
  kacang: () => (
    <>
      <Leaf />
      {[
        [36, 82, -30, 0.75],
        [86, 84, 25, 0.7],
        [74, 54, 60, 0.6],
      ].map(([x, y, r, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
          <path d="M-14 0 Q-14 -12 -2 -10 Q2 -16 12 -12 Q20 -6 14 4 Q12 14 0 12 Q-14 14 -14 0Z" fill="#c98b4a" />
          <path d="M-8 -2 Q0 4 8 -4" stroke="#a96d33" strokeWidth={1.4} fill="none" />
        </g>
      ))}
      <g transform="translate(58 66)">
        <path d="M-24 2 Q-26 -20 -6 -18 Q2 -28 18 -22 Q32 -12 24 6 Q20 24 0 22 Q-24 24 -24 2Z" fill="#d89a58" stroke="#b0753a" strokeWidth={1.5} />
        {[
          [-14, -8],
          [12, -14],
          [16, 8],
          [-10, 14],
          [2, -4],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.1} fill="#b0753a" />
        ))}
        <Face x={0} y={2} s={0.85} />
      </g>
    </>
  ),
  sambal: () => (
    <>
      <Leaf />
      <path d="M26 66 Q28 98 60 98 Q92 98 94 66 Z" fill="#f4ede0" stroke="#d9cbb2" strokeWidth={1.5} />
      <path d="M30 76 Q60 84 90 76" stroke="#3f7fb8" strokeWidth={2} fill="none" />
      <path d="M24 66 Q30 44 60 44 Q90 44 96 66 Q60 74 24 66Z" fill="#d6402b" />
      <path d="M34 60 Q46 50 58 52" stroke="#f0715d" strokeWidth={3} fill="none" strokeLinecap="round" />
      {[
        [40, 56, -20],
        [74, 52, 15],
        [84, 62, -10],
      ].map(([x, y, r], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
          <path d="M-9 0 Q-2 -4 6 0 L10 -3 L9 3 L6 1 Q-2 4 -9 0Z" fill="#cfd6dc" stroke="#8a97a3" strokeWidth={0.8} />
          <circle cx={-6} cy={-0.5} r={0.8} fill={INK} />
        </g>
      ))}
      <path d="M86 30 Q100 34 98 50 Q96 44 88 40Z" fill="#e2341f" />
      <path d="M86 30 Q84 26 88 24" stroke="#3a7a33" strokeWidth={2} fill="none" strokeLinecap="round" />
      <Face x={60} y={62} s={0.8} mood="sly" />
    </>
  ),
  timun: () => (
    <>
      <Leaf />
      {[
        [38, 78, 0.8],
        [84, 80, 0.75],
      ].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <circle r={20} fill="#3e8f3a" />
          <circle r={17} fill="#bfe59a" />
          <circle r={9} fill="#e3f5c9" />
        </g>
      ))}
      <g transform="translate(60 62)">
        <circle r={25} fill="#2f7a31" />
        <circle r={21.5} fill="#c6eaa1" />
        <circle r={12} fill="#e8f8d2" />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return <ellipse key={i} cx={Math.cos(a) * 8} cy={Math.sin(a) * 8} rx={1.4} ry={2.4} fill="#f6fbe9" stroke="#a5d17c" strokeWidth={0.5} transform={`rotate(${(a * 180) / Math.PI + 90} ${Math.cos(a) * 8} ${Math.sin(a) * 8})`} />;
        })}
        <Face x={0} y={1} s={0.8} mood="calm" />
      </g>
    </>
  ),
  rendang: () => (
    <>
      <circle cx={60} cy={60} r={54} fill="url(#glow)" />
      <path d="M22 60 Q22 100 60 102 Q98 100 98 60 Z" fill="#8c4a2b" />
      <path d="M22 60 Q22 100 60 102 Q98 100 98 60 Z" fill="#000" opacity={0.12} />
      <ellipse cx={60} cy={60} rx={40} ry={11} fill="#6e2f17" />
      <ellipse cx={60} cy={58} rx={34} ry={8} fill="#a24a22" />
      {pts([
        [44, 56],
        [58, 52],
        [72, 56],
        [62, 60],
        [50, 61],
      ]).map(([x, y], i) => (
        <rect key={i} x={x - 6} y={y - 4} width={12} height={8} rx={3} fill="#5a240f" stroke="#3b1608" strokeWidth={0.8} />
      ))}
      <path d="M16 62 Q10 58 14 54 M104 62 Q110 58 106 54" stroke="#6e2f17" strokeWidth={4} fill="none" strokeLinecap="round" />
      <path d="M46 40 Q42 32 48 26 Q54 20 50 12 M62 38 Q58 30 64 24 Q70 18 66 10 M76 40 Q72 32 78 26" stroke="#d8c3a5" strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.8} />
      <Face x={60} y={82} s={0.9} />
      <g transform="translate(96 22)">
        <path d="M0 -12 L3.5 -4 L12 -3.5 L5.5 2 L7.5 10.5 L0 6 L-7.5 10.5 L-5.5 2 L-12 -3.5 L-3.5 -4 Z" fill="#ffd34d" stroke="#d48a1a" strokeWidth={1.2} />
      </g>
    </>
  ),
  supplier: () => (
    <>
      <rect x={20} y={56} width={58} height={44} rx={4} fill="#c98b4a" stroke="#8e5a26" strokeWidth={2} />
      <path d="M20 70 H78 M20 86 H78" stroke="#8e5a26" strokeWidth={1.6} />
      <path d="M34 56 L34 100 M64 56 L64 100" stroke="#a96d33" strokeWidth={1.2} />
      <ellipse cx={34} cy={52} rx={9} ry={11} fill="#fffdf7" stroke="#e1d6bf" />
      <circle cx={50} cy={50} r={10} fill="#3e8f3a" />
      <circle cx={50} cy={50} r={7.5} fill="#c6eaa1" />
      <path d="M58 54 Q60 40 70 40 Q80 42 78 54Z" fill="#d6402b" />
      <g transform="translate(86 46) rotate(-20)">
        <path d="M-8 -6 L10 -16 L10 16 L-8 6 Z" fill="#f2b134" stroke="#b97a12" strokeWidth={1.5} />
        <rect x={-14} y={-6} width={7} height={12} rx={2} fill="#e38b1e" />
      </g>
      <path d="M100 26 L110 18 M102 38 L114 36 M100 50 L110 56" stroke="#d6402b" strokeWidth={3} strokeLinecap="round" />
      <Face x={49} y={82} s={0.9} />
    </>
  ),
  thief: () => (
    <>
      <path d="M70 70 Q66 48 84 44 Q100 46 100 66 Q104 96 84 100 Q66 98 70 70Z" fill="#c7b08a" stroke="#93794e" strokeWidth={1.5} />
      <path d="M78 46 Q84 38 92 46" stroke="#93794e" strokeWidth={3} fill="none" />
      <circle cx={48} cy={60} r={28} fill="#f5c9a1" />
      <path d="M20 54 Q22 26 48 26 Q74 26 76 54 Z" fill="#3a3a52" />
      <path d="M20 52 H76" stroke="#d6402b" strokeWidth={5} />
      <circle cx={48} cy={24} r={5} fill="#d6402b" />
      <rect x={22} y={56} width={52} height={12} rx={6} fill={INK} />
      <ellipse cx={38} cy={62} rx={5} ry={4} fill="#fff" />
      <ellipse cx={58} cy={62} rx={5} ry={4} fill="#fff" />
      <circle cx={39.5} cy={62} r={2.4} fill={INK} />
      <circle cx={59.5} cy={62} r={2.4} fill={INK} />
      <path d="M38 76 Q48 84 60 74" stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />
      <ellipse cx={30} cy={74} rx={4} ry={2.2} fill="#ff7f86" opacity={0.5} />
      <ellipse cx={66} cy={74} rx={4} ry={2.2} fill="#ff7f86" opacity={0.5} />
      <path d="M18 98 Q48 84 76 98" stroke="#3a3a52" strokeWidth={10} fill="none" strokeLinecap="round" />
    </>
  ),
  wholesaler: () => (
    <>
      {pts([
        [16, 66],
        [58, 66],
        [37, 28],
      ]).map(([x, y], i) => (
        <g key={i}>
          <rect x={x} y={y} width={44} height={36} rx={3} fill={i === 2 ? '#e38b1e' : '#c98b4a'} stroke="#8e5a26" strokeWidth={2} />
          <path d={`M${x} ${y + 12} H${x + 44} M${x} ${y + 24} H${x + 44}`} stroke="#8e5a26" strokeWidth={1.2} />
        </g>
      ))}
      <rect x={45} y={40} width={28} height={10} rx={2} fill="#fffbf2" />
      <text x={59} y={48} fontSize={8} textAnchor="middle" fontWeight={800} fill="#8e5a26" fontFamily="Fredoka, sans-serif">
        BORONG
      </text>
      <path d="M20 66 Q18 58 26 58 M98 66 Q102 56 94 56" stroke="#4f9a45" strokeWidth={4} fill="none" strokeLinecap="round" />
      <text x={102} y={30} fontSize={20} fontWeight={800} fill="#d6402b" fontFamily="Fredoka, sans-serif">
        3
      </text>
      <Face x={38} y={86} s={0.75} />
    </>
  ),
  officer: () => (
    <>
      <circle cx={50} cy={66} r={28} fill="#f5c9a1" />
      <path d="M18 50 Q50 18 82 50 Z" fill="#1f3a6b" />
      <rect x={18} y={46} width={64} height={10} rx={3} fill="#162b52" />
      <path d="M22 56 Q50 64 78 56 L80 60 Q50 70 20 60Z" fill={INK} />
      <circle cx={50} cy={36} r={6} fill="#f2b134" stroke="#b97a12" strokeWidth={1} />
      <Face x={50} y={72} s={0.9} mood="calm" />
      <path d="M40 66 L46 64 M54 64 L60 66" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      <g transform="translate(88 78) rotate(-35)">
        <rect x={-3.5} y={12} width={7} height={22} rx={3} fill="#8e5a26" />
        <circle r={15} fill="#cfe8ff" opacity={0.75} stroke="#555" strokeWidth={4} />
        <ellipse cx={0} cy={0} rx={7} ry={4.5} fill="#fff" />
        <circle r={3} fill={INK} />
      </g>
    </>
  ),
  makcik: () => (
    <>
      <path d="M18 104 Q20 46 58 40 Q96 46 98 104 Z" fill="#e8668b" />
      <path d="M26 104 Q30 60 58 56 Q86 60 90 104" fill="#f088a8" />
      <path d="M30 60 Q30 28 58 24 Q86 28 86 60 Q86 92 58 94 Q30 92 30 60Z" fill="#e8668b" />
      <ellipse cx={58} cy={62} rx={21} ry={24} fill="#f5c9a1" />
      <path d="M37 50 Q58 34 79 50" stroke="#f088a8" strokeWidth={6} fill="none" />
      <circle cx={50} cy={62} r={6} fill="none" stroke="#8a5a3c" strokeWidth={1.6} />
      <circle cx={66} cy={62} r={6} fill="none" stroke="#8a5a3c" strokeWidth={1.6} />
      <path d="M56 62 H60" stroke="#8a5a3c" strokeWidth={1.6} />
      <circle cx={50} cy={62} r={1.8} fill={INK} />
      <circle cx={66} cy={62} r={1.8} fill={INK} />
      <ellipse cx={45} cy={71} rx={3.4} ry={2} fill="#ff7f86" opacity={0.55} />
      <ellipse cx={71} cy={71} rx={3.4} ry={2} fill="#ff7f86" opacity={0.55} />
      <path d="M52 74 Q58 79 64 74" stroke={INK} strokeWidth={1.7} fill="none" strokeLinecap="round" />
      <g transform="translate(96 54) rotate(25)">
        <rect x={-3} y={0} width={6} height={34} rx={3} fill="#c98b4a" />
        <ellipse cx={0} cy={-6} rx={9} ry={12} fill="#e2b67a" stroke="#a96d33" strokeWidth={1.2} />
      </g>
      <text x={20} y={30} fontSize={16} fontWeight={800} fill="#f2b134" fontFamily="Fredoka, sans-serif">
        3
      </text>
    </>
  ),
  fly: () => (
    <>
      <ellipse cx={42} cy={44} rx={20} ry={11} fill="#bfe4ff" opacity={0.75} stroke="#7fb5de" transform="rotate(-30 42 44)" />
      <ellipse cx={78} cy={44} rx={20} ry={11} fill="#bfe4ff" opacity={0.75} stroke="#7fb5de" transform="rotate(30 78 44)" />
      <ellipse cx={60} cy={70} rx={22} ry={26} fill="#2f3b2f" />
      <path d="M42 70 H78 M44 80 H76 M48 90 H72" stroke="#4d5d4a" strokeWidth={3} />
      <circle cx={60} cy={48} r={17} fill="#3b4a3a" />
      <circle cx={52} cy={46} r={8} fill="#fff" />
      <circle cx={68} cy={46} r={8} fill="#fff" />
      <circle cx={53} cy={47} r={4.5} fill="#c0392b" />
      <circle cx={67} cy={47} r={4.5} fill="#c0392b" />
      <circle cx={54.5} cy={45.5} r={1.4} fill="#fff" />
      <circle cx={68.5} cy={45.5} r={1.4} fill="#fff" />
      <path d="M54 56 Q60 60 66 56" stroke="#fff" strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <path d="M40 76 L26 84 M40 86 L28 98 M80 76 L94 84 M80 86 L92 98" stroke="#2f3b2f" strokeWidth={2.5} strokeLinecap="round" />
      <path d="M14 30 Q22 22 18 14 M100 26 Q110 22 106 12" stroke="#7a7a7a" strokeWidth={1.6} fill="none" strokeDasharray="3 3" />
    </>
  ),
  swatter: () => (
    <>
      <g transform="translate(60 60) rotate(-30)">
        <rect x={-3.5} y={8} width={7} height={52} rx={3} fill="#e8668b" />
        <rect x={-22} y={-42} width={44} height={50} rx={8} fill="#5bb0e6" stroke="#2d7fb8" strokeWidth={2.5} />
        {Array.from({ length: 5 }, (_, i) => (
          <path key={`h${i}`} d={`M-20 ${-34 + i * 9} H20`} stroke="#2d7fb8" strokeWidth={1} opacity={0.7} />
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <path key={`v${i}`} d={`M${-16 + i * 8} -40 V6`} stroke="#2d7fb8" strokeWidth={1} opacity={0.7} />
        ))}
      </g>
      <g transform="translate(92 28)">
        <path d="M0 -16 L4 -6 L14 -8 L7 0 L14 8 L4 6 L0 16 L-4 6 L-14 8 L-7 0 L-14 -8 L-4 -6Z" fill="#ffd34d" stroke="#d48a1a" strokeWidth={1.2} />
      </g>
      <text x={18} y={104} fontSize={15} fontWeight={800} fill="#d6402b" fontFamily="Fredoka, sans-serif">
        PAP!
      </text>
    </>
  ),
  fan: () => (
    <>
      <g transform="translate(52 56) rotate(-12)">
        <rect x={-4} y={22} width={8} height={40} rx={3} fill="#8e5a26" />
        <path d="M-32 -2 Q-34 -34 0 -38 Q34 -34 32 -2 Q30 26 0 28 Q-30 26 -32 -2Z" fill="url(#weave)" stroke="#8e5a26" strokeWidth={3} />
        <path d="M-24 -4 Q0 -10 24 -4" stroke="#d6402b" strokeWidth={3} fill="none" />
        <Face x={0} y={6} s={0.8} />
      </g>
      <path d="M86 40 Q100 36 110 42 M88 56 Q104 54 112 60 M86 72 Q98 72 106 78" stroke="#7fb5de" strokeWidth={3} fill="none" strokeLinecap="round" />
    </>
  ),
  sioyen: () => (
    <>
      <path d="M26 46 L30 14 L52 34 Z" fill="#f08a24" stroke="#c4631a" strokeWidth={1.5} />
      <path d="M94 46 L90 14 L68 34 Z" fill="#f08a24" stroke="#c4631a" strokeWidth={1.5} />
      <path d="M32 40 L33 22 L46 34Z M88 40 L87 22 L74 34Z" fill="#ffb3ab" />
      <ellipse cx={60} cy={62} rx={38} ry={34} fill="#f59a3a" stroke="#c4631a" strokeWidth={1.5} />
      <path d="M60 30 V42 M50 32 L52 42 M70 32 L68 42" stroke="#d86f1c" strokeWidth={3.5} strokeLinecap="round" />
      <path d="M24 62 H34 M24 70 H34 M86 62 H96 M86 70 H96" stroke="#d86f1c" strokeWidth={3} strokeLinecap="round" />
      <ellipse cx={60} cy={76} rx={18} ry={13} fill="#ffe2c4" />
      <ellipse cx={46} cy={58} rx={6} ry={7} fill="#fff" />
      <ellipse cx={74} cy={58} rx={6} ry={7} fill="#fff" />
      <ellipse cx={47} cy={59} rx={3} ry={5} fill="#3d8c3a" />
      <ellipse cx={73} cy={59} rx={3} ry={5} fill="#3d8c3a" />
      <circle cx={48} cy={56} r={1.2} fill="#fff" />
      <circle cx={74} cy={56} r={1.2} fill="#fff" />
      <path d="M57 70 L63 70 L60 74Z" fill="#e8668b" />
      <path d="M60 74 Q56 80 52 78 M60 74 Q64 80 68 78" stroke={INK} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <path d="M40 74 L22 72 M40 78 L22 82 M80 74 L98 72 M80 78 L98 82" stroke="#8a6a4a" strokeWidth={1} />
      <ellipse cx={36} cy={98} rx={10} ry={7} fill="#f59a3a" stroke="#c4631a" />
      <ellipse cx={84} cy={98} rx={10} ry={7} fill="#f59a3a" stroke="#c4631a" />
    </>
  ),
  crow: () => (
    <>
      <path d="M30 70 Q24 40 56 34 Q84 32 88 58 L104 62 L88 68 Q84 92 60 96 Q36 96 30 70Z" fill="#23232f" />
      <path d="M36 66 Q44 52 64 58 Q56 76 36 66Z" fill="#3a3a4d" />
      <path d="M88 58 L110 63 L88 68Z" fill="#c9a227" />
      <circle cx={74} cy={52} r={6} fill="#fff" />
      <circle cx={75} cy={53} r={3.2} fill={INK} />
      <circle cx={76} cy={51.5} r={1} fill="#fff" />
      <path d="M66 44 L80 46" stroke="#23232f" strokeWidth={3} strokeLinecap="round" />
      <path d="M30 76 L12 82 L22 72 L10 70 L28 66Z" fill="#23232f" />
      <path d="M52 96 L50 108 M64 96 L66 108" stroke="#c9a227" strokeWidth={3} strokeLinecap="round" />
      <text x={90} y={30} fontSize={12} fontWeight={800} fill="#4a4a5a" fontFamily="Fredoka, sans-serif">
        KAA!
      </text>
    </>
  ),
  nasiLemak: () => (
    <>
      <circle cx={60} cy={62} r={52} fill="url(#glow)" />
      <path d="M18 92 L60 22 L102 92 Z" fill="#4f9a45" stroke="#2f6d2a" strokeWidth={2} />
      <path d="M18 92 L60 22 L60 92Z" fill="#3a7a33" />
      <path d="M30 92 L60 40 L90 92" fill="#f6f0e2" stroke="#d9cbb2" strokeWidth={1.2} />
      <path d="M38 92 L60 54 L82 92" fill="none" stroke="#c9b991" strokeWidth={1} strokeDasharray="2 3" />
      <path d="M22 76 Q60 86 98 76" stroke="#d6402b" strokeWidth={3} fill="none" />
      <Face x={60} y={74} s={0.85} />
    </>
  ),
  back: () => (
    <>
      <rect x={0} y={0} width={120} height={120} fill="#2f6d2a" />
      {Array.from({ length: 7 }, (_, i) => (
        <path key={i} d={`M${-20 + i * 24} 120 Q${i * 24} 60 ${20 + i * 24} 0`} stroke="#3e8a37" strokeWidth={6} fill="none" opacity={0.7} />
      ))}
      <circle cx={60} cy={60} r={30} fill="#f6f0e2" stroke="#f2b134" strokeWidth={4} />
      <path d="M44 72 L60 44 L76 72Z" fill="#4f9a45" />
      <path d="M50 72 L60 54 L70 72" fill="#fffbf2" />
      <path d="M44 66 Q60 70 76 66" stroke="#d6402b" strokeWidth={2.5} fill="none" />
    </>
  ),
};

export function CardArt({ kind, className }: { kind: ArtKind; className?: string }) {
  const Art = arts[kind];
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true" focusable="false">
      <Art />
    </svg>
  );
}
