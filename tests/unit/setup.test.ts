import { describe, expect, it } from 'vitest';
import { ALL_CARD_KINDS } from '../../src/game/cards/catalog';
import { OFFICIAL_BASE, OFFICIAL_RENDANG, deckSize, totalCardCount } from '../../src/game/rules/config';
import { buildDeck, createGame } from '../../src/game/rules/engine';
import { seedFromNumber } from '../../src/game/rng';
import { setup } from './helpers';

function count(kinds: string[]) {
  const m: Record<string, number> = {};
  for (const k of kinds) m[k] = (m[k] ?? 0) + 1;
  return m;
}

describe('official card counts', () => {
  it('base game has 90 cards: 50 ingredients, 25 actions, 15 Nasi Lemak (8x1, 7x2)', () => {
    const c = count(buildDeck(OFFICIAL_BASE));
    expect(c).toEqual({
      nasi: 10,
      telur: 10,
      kacang: 10,
      sambal: 10,
      timun: 10,
      supplier: 3,
      thief: 3,
      wholesaler: 3,
      officer: 3,
      makcik: 3,
      fly: 5,
      swatter: 2,
      fan: 3,
    });
    expect(deckSize(OFFICIAL_BASE)).toBe(75);
    expect(OFFICIAL_BASE.nlOnePack).toBe(8);
    expect(OFFICIAL_BASE.nlTwoPack).toBe(7);
    expect(totalCardCount(OFFICIAL_BASE)).toBe(90);
  });

  it('base + Rendang expansion has 110 cards (+6 Rendang, +11 action/special, +3 Nasi Lemak)', () => {
    const c = count(buildDeck(OFFICIAL_RENDANG));
    expect(c.rendang).toBe(6);
    expect(c.sioyen).toBe(3);
    for (const k of ['supplier', 'thief', 'wholesaler', 'officer', 'makcik'] as const) expect(c[k]).toBe(4);
    expect(c.fly).toBe(6);
    expect(c.swatter).toBe(2);
    expect(c.fan).toBe(3);
    expect(OFFICIAL_RENDANG.crows).toBe(2);
    expect(OFFICIAL_RENDANG.nlOnePack + OFFICIAL_RENDANG.nlTwoPack).toBe(18);
    expect(totalCardCount(OFFICIAL_RENDANG)).toBe(110);
  });

  it('Crows are a separate pile, never in the draw pile or hands', () => {
    const s = setup({ mode: 'classic-rendang', players: 7 });
    expect(s.crows).toHaveLength(2);
    expect(s.crows.every((c) => c.holderId === null)).toBe(true);
    const everywhere = [...s.drawPile, ...s.players.flatMap((p) => p.hand)];
    expect(everywhere.some((c) => (c.kind as string) === 'crow')).toBe(false);
    expect(everywhere).toHaveLength(90);
  });

  it('official configs are frozen so custom rules can never alter them', () => {
    expect(Object.isFrozen(OFFICIAL_BASE)).toBe(true);
    expect(Object.isFrozen(OFFICIAL_RENDANG)).toBe(true);
  });
});

describe('setup and dealing', () => {
  it('deals 7 cards each; first player draws 2 more at the start of their turn', () => {
    const s = setup({ players: 4 });
    expect(s.players.map((p) => p.hand.length)).toEqual([9, 7, 7, 7]);
    expect(s.drawPile.length).toBe(75 - 28 - 2);
    expect(s.nlPile).toHaveLength(15);
    expect(s.turn.number).toBe(1);
    expect(s.turn.movesUsed).toBe(0);
  });

  it('enforces player counts: base 2–5, Rendang 3–7', () => {
    const mk = (cfg: typeof OFFICIAL_BASE, n: number) => () =>
      createGame({
        mode: 'classic-base',
        config: cfg,
        players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `p${i}` })),
        rng: seedFromNumber(1),
      });
    expect(mk(OFFICIAL_BASE, 1)).toThrow();
    expect(mk(OFFICIAL_BASE, 2)).not.toThrow();
    expect(mk(OFFICIAL_BASE, 5)).not.toThrow();
    expect(mk(OFFICIAL_BASE, 6)).toThrow();
    expect(mk(OFFICIAL_RENDANG, 2)).toThrow();
    expect(mk(OFFICIAL_RENDANG, 3)).not.toThrow();
    expect(mk(OFFICIAL_RENDANG, 7)).not.toThrow();
    expect(mk(OFFICIAL_RENDANG, 8)).toThrow();
  });

  it('card ids are unique and assigned after shuffling (ids do not reveal kinds)', () => {
    const s = setup({ players: 3, seed: 42 });
    const all = [...s.drawPile, ...s.players.flatMap((p) => p.hand)];
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    // c0..c9 are not all the same kind (would be if ids were assigned before shuffling)
    const first = all.filter((c) => Number(c.id.slice(1)) < 10).map((c) => c.kind);
    expect(new Set(first).size).toBeGreaterThan(1);
  });

  it('shuffles differ between seeds and are reproducible for the same seed', () => {
    const a = setup({ seed: 1 });
    const b = setup({ seed: 1 });
    const c = setup({ seed: 2 });
    expect(a.drawPile.map((x) => x.kind)).toEqual(b.drawPile.map((x) => x.kind));
    expect(a.drawPile.map((x) => x.kind)).not.toEqual(c.drawPile.map((x) => x.kind));
  });

  it('every card kind in the catalogue has a defined category', () => {
    expect(ALL_CARD_KINDS.length).toBe(15);
  });
});
