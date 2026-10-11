import { describe, expect, it } from 'vitest';
import { projectGame } from '../../src/game/view';
import { RECIPE, giveNasiLemak, hand, ok, setHand, setup } from './helpers';

describe('hidden information in player views', () => {
  it('only your own hand is sent; others are just counts', () => {
    const s = setup({ players: 4 });
    const v = projectGame(s, 'p1');
    expect(v.hand.map((c) => c.id).sort()).toEqual(hand(s, 'p1').map((c) => c.id).sort());
    const json = JSON.stringify(v);
    for (const other of ['p0', 'p2', 'p3']) {
      for (const c of hand(s, other)) expect(json).not.toContain(`"id":"${c.id}"`);
    }
    expect(v.players.find((p) => p.id === 'p0')!.handCount).toBe(hand(s, 'p0').length);
  });

  it('draw pile order and contents are never sent', () => {
    const s = setup({ players: 2 });
    const v = projectGame(s, 'p0') as unknown as Record<string, unknown>;
    expect(v.drawPile).toBeUndefined();
    expect(v.drawCount).toBe(s.drawPile.length);
    const json = JSON.stringify(v);
    for (const c of s.drawPile) expect(json).not.toContain(`"id":"${c.id}"`);
    expect(json).not.toContain('rng');
  });

  it('Nasi Lemak values are visible to the owner only until the game ends', () => {
    const s = setup({ players: 2 });
    giveNasiLemak(s, 'p0', 2);
    expect(projectGame(s, 'p0').players[0]!.nasiLemak[0]!.packs).toBe(2);
    expect(projectGame(s, 'p1').players[0]!.nasiLemak[0]!.packs).toBeUndefined();
    expect(projectGame(s, 'p1').players[0]!.packs).toBeUndefined();
    expect(JSON.stringify(projectGame(s, 'p1').nlPileCount)).toBe(String(s.nlPile.length));
    // After the game, everything is revealed.
    s.nlPile = [{ id: 'z', packs: 1 }];
    s.config = { ...s.config, length: 'long' };
    setHand(s, 'p0', RECIPE);
    ok(s, 'p0', { type: 'make', cardIds: hand(s, 'p0').map((c) => c.id) });
    const after = projectGame(s, 'p1');
    expect(after.status).toBe('finished');
    expect(after.players[0]!.nasiLemak.map((n) => n.packs)).toEqual([2, 1]);
    expect(after.result!.revealed.p0).toEqual([2, 1]);
  });

  it('private log entries (draws, thefts) only reach the players involved', () => {
    const s = setup({ players: 3 });
    const drawP0 = projectGame(s, 'p0').log.filter((e) => e.key === 'draw-private');
    const drawP1 = projectGame(s, 'p1').log.filter((e) => e.key === 'draw-private');
    expect(drawP0).toHaveLength(1);
    expect(drawP1).toHaveLength(0);
    setHand(s, 'p0', ['thief']);
    ok(s, 'p0', { type: 'play', cardId: hand(s, 'p0')[0]!.id, card: 'thief' });
    const p2log = projectGame(s, 'p2').log.filter((e) => e.key === 'thief-private');
    expect(p2log).toHaveLength(1);
    expect(p2log[0]!.target).toBe('p2');
    const p1log = projectGame(s, 'p1').log.filter((e) => e.key === 'thief-private');
    expect(p1log.every((e) => e.target === 'p1')).toBe(true);
  });

  it('only the active player sees which cards they just drew', () => {
    const s = setup({ players: 2 });
    expect(projectGame(s, 'p0').turn.drawnIds).toHaveLength(2);
    expect(projectGame(s, 'p1').turn.drawnIds).toHaveLength(0);
  });

  it('spectator projection (null viewer) contains no hand at all', () => {
    const s = setup({ players: 2 });
    const v = projectGame(s, null);
    expect(v.hand).toEqual([]);
    expect(v.log.every((e) => !e.to)).toBe(true);
  });
});
