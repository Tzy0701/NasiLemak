const COLORS = ['#d6402b', '#4f9a45', '#f2b134', '#2d7fb8', '#e8668b', '#8c4a2b', '#7a5bd6'];

export function colorFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

export function Avatar({ id, name, size = 36, ring }: { id: string; name: string; size?: number; ring?: boolean }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white shadow ${ring ? 'animate-pulse-ring ring-4 ring-kunyit-400' : ''}`}
      style={{ width: size, height: size, background: colorFor(id), fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {initials || '?'}
    </div>
  );
}
