import { describe, expect, it, afterEach } from 'vitest';
import { en } from '../../src/client/i18n/en';
import { zh } from '../../src/client/i18n/zh';
import { setLocale, t, tList } from '../../src/client/i18n';
import { tableEvents } from '../../src/client/game/animations';
import { layoutState } from '../e2e/layout-fixture';

function strings(dict: unknown, prefix = ''): Record<string, string> {
  if (typeof dict === 'string') return { [prefix]: dict };
  return Object.fromEntries(Object.entries(dict as object).flatMap(([key, value]) => Object.entries(strings(value, prefix ? `${prefix}.${key}` : key))));
}

afterEach(() => setLocale('en'));
describe('bilingual presentation', () => {
  it('translates every English key and keeps every interpolation parameter', () => {
    const english = strings(en), chinese = strings(zh);
    expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort());
    for (const key of Object.keys(english)) {
      expect(chinese[key]?.trim(), key).not.toBe('');
      expect(chinese[key]?.match(/\{\w+\}/g)?.sort() ?? [], key).toEqual(english[key]!.match(/\{\w+\}/g)?.sort() ?? []);
    }
  });
  it('switches card names, game actions, rules and parameterized logs together', () => {
    setLocale('zh');
    expect(t('cards.fly.name')).toBe('苍蝇');
    expect(t('game.make')).toBe('制作椰浆饭');
    expect(t('log.draw', { actor: '小明', n: 2 })).toBe('小明 抽了 2 张牌。');
    expect(tList('howTo.moves')).toHaveLength(4);
    expect(t('cards.makcik.text', { n: 4 })).toContain('4 种不同食材');
    setLocale('en');
    expect(t('game.make')).toBe('Make Nasi Lemak');
  });
});

describe('animation visibility', () => {
  it('never reveals the private contents of draws or an opponent’s scoring card', () => {
    const v = layoutState().game!;
    const effects = tableEvents([
      { seq: 1, turn: 1, key: 'draw', actor: 'layout-1', n: 2 },
      { seq: 2, turn: 1, key: 'draw-private', actor: 'layout-1', kinds: ['nasi', 'fly'], to: ['layout-1'] },
      { seq: 3, turn: 1, key: 'make', actor: 'layout-1' },
      { seq: 4, turn: 1, key: 'make-private', actor: 'layout-1', n: 2, to: ['layout-1'] },
    ], v);
    expect(effects).toHaveLength(2);
    expect(effects[0]?.kind).toBe('back');
    expect(effects[1]?.packs).toBeUndefined();
  });
  it('reveals only the owner’s score and animates public action targets', () => {
    const v = layoutState().game!;
    const effects = tableEvents([
      { seq: 1, turn: 1, key: 'make', actor: v.youId! },
      { seq: 2, turn: 1, key: 'make-private', actor: v.youId!, n: 2, to: [v.youId!] },
      { seq: 3, turn: 1, key: 'fly', actor: v.youId!, target: 'layout-1' },
      { seq: 4, turn: 1, key: 'crow-pass', actor: v.youId!, target: 'layout-2' },
      { seq: 5, turn: 1, key: 'trade-done', actor: v.youId!, target: 'layout-3' },
    ], v);
    expect(effects[0]?.packs).toBe(2);
    expect(effects.map(e => e.type)).toEqual(['make', 'play', 'crow', 'trade']);
    expect(effects[1]?.target).toBe('layout-1');
  });
});
