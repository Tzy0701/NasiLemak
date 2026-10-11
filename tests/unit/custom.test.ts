import { describe, expect, it } from 'vitest';
import { CUSTOM_PRESET_IDS, customPreset, customProblems, sanitizeCustomConfig } from '../../src/game/custom/customRules';
import { OFFICIAL_BASE, OFFICIAL_RENDANG } from '../../src/game/rules/config';
import { simulateGame } from '../../src/game/sim';

describe('custom house rules', () => {
  it('clamps untrusted values and drops junk', () => {
    const { config } = sanitizeCustomConfig({
      ingredients: { nasi: 999, telur: -3, kacang: 'x' },
      actions: { thief: 100, fly: 2.6 },
      handSize: 0,
      movesPerTurn: 99,
      length: 'weird',
      evil: true,
    });
    expect(config.ingredients.nasi).toBe(30);
    expect(config.ingredients.telur).toBe(2);
    expect(config.ingredients.kacang).toBe(OFFICIAL_RENDANG.ingredients.kacang);
    expect(config.actions.thief).toBe(15);
    expect(config.actions.fly).toBe(3);
    expect(config.handSize).toBe(3);
    expect(config.movesPerTurn).toBe(6);
    expect(config.length).toBe('short');
    expect((config as unknown as Record<string, unknown>).evil).toBeUndefined();
    expect(config.maxPlayers).toBe(7);
  });

  it('reports unplayable configurations', () => {
    const { config } = sanitizeCustomConfig({ nlOnePack: 0, nlTwoPack: 0, crows: 0, actions: { sioyen: 3 } });
    const p = customProblems(config);
    expect(p).toContain('need-nasi-lemak-cards');
    expect(p).toContain('sioyen-without-crows');
    const { config: tiny } = sanitizeCustomConfig({ ingredients: { nasi: 2, telur: 2, kacang: 2, sambal: 2, timun: 2 }, rendang: 0, actions: Object.fromEntries(['supplier', 'thief', 'wholesaler', 'officer', 'makcik', 'fly', 'swatter', 'fan', 'sioyen'].map((k) => [k, 0])), handSize: 12 });
    expect(customProblems(tiny, 7)).toContain('deck-too-small');
  });

  it('editing custom config never mutates the official configs', () => {
    const before = JSON.stringify([OFFICIAL_BASE, OFFICIAL_RENDANG]);
    const { config } = sanitizeCustomConfig({ ingredients: { nasi: 20 } }, OFFICIAL_BASE);
    config.actions.fly = 15;
    expect(JSON.stringify([OFFICIAL_BASE, OFFICIAL_RENDANG])).toBe(before);
  });

  it.each(CUSTOM_PRESET_IDS)('preset %s is valid and plays to completion with 7 players', (id) => {
    const config = customPreset(id);
    expect(customProblems(config, 7)).toEqual([]);
    for (let seed = 0; seed < 20; seed++) {
      const r = simulateGame({ mode: 'custom', config, bots: ['collector', 'trader', 'aggressive', 'random', 'collector', 'trader', 'aggressive'], seed });
      expect(r.errors).toEqual([]);
      expect(r.finished).toBe(true);
    }
  });

  it('custom 2-player game with Rendang enabled works', () => {
    const config = { ...customPreset('official-rendang'), minPlayers: 2 };
    const r = simulateGame({ mode: 'custom', config, bots: ['collector', 'trader'], seed: 3 });
    expect(r.finished).toBe(true);
  });
});
