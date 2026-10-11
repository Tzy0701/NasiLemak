import { describe, expect, it } from 'vitest';
import type { BotKind } from '../../src/game/bots/bots';
import { OFFICIAL_BASE, OFFICIAL_RENDANG, deckSize } from '../../src/game/rules/config';
import { simulateGame } from '../../src/game/sim';
import { projectGame } from '../../src/game/view';
import { circulating } from './helpers';

const KINDS: BotKind[] = ['random', 'collector', 'aggressive', 'trader'];

describe('full games played by bots (invariants checked after every action)', () => {
  const cases = [
    { mode: 'classic-base' as const, config: OFFICIAL_BASE, players: [2, 3, 4, 5] },
    { mode: 'classic-rendang' as const, config: OFFICIAL_RENDANG, players: [3, 5, 6, 7] },
  ];
  for (const c of cases) {
    for (const n of c.players) {
      it(`${c.mode} with ${n} players: 40 complete games, cards conserved, no illegal bot moves`, () => {
        for (let seed = 0; seed < 40; seed++) {
          const bots = Array.from({ length: n }, (_, i) => KINDS[(i + seed) % KINDS.length]!);
          const total = deckSize(c.config);
          const nlTotal = c.config.nlOnePack + c.config.nlTwoPack;
          const r = simulateGame({
            mode: c.mode,
            config: c.config,
            bots,
            seed: seed * 7919 + n,
            onStep: (s) => {
              expect(circulating(s)).toBe(total);
              const nl = s.nlPile.length + s.players.reduce((a, p) => a + p.nasiLemak.length, 0);
              expect(nl).toBe(nlTotal);
              expect(s.turn.movesUsed).toBeLessThanOrEqual(s.config.movesPerTurn);
              expect(s.crows.filter((w) => w.holderId).length).toBe(new Set(s.crows.filter((w) => w.holderId).map((w) => w.holderId)).size);
            },
          });
          expect(r.errors).toEqual([]);
          expect(r.finished).toBe(true);
          expect(r.winners.length).toBeGreaterThan(0);
          // Final view reveals everything consistently.
          const v = projectGame(r.state, 'p0');
          expect(v.result!.winnerIds.length).toBeGreaterThan(0);
        }
      });
    }
  }
});
