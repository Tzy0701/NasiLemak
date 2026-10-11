/**
 * Balance research: plays thousands of complete bot games for each
 * player count / deck configuration and writes docs/BALANCE.md plus the raw
 * numbers in docs/balance-results.json.
 *
 *   npm run simulate                # 1000 games per main configuration
 *   GAMES=200 npm run simulate      # quicker run
 *
 * The bots are heuristic, not optimal players. Results are a *reference*
 * for tuning house rules, not a proof of fairness.
 */
import { writeFileSync } from 'node:fs';
import { BOT_KINDS, type BotKind } from '../src/game/bots/bots';
import { customPreset } from '../src/game/custom/customRules';
import { type GameConfig, type GameMode, OFFICIAL_BASE, OFFICIAL_RENDANG, cloneConfig, deckSize } from '../src/game/rules/config';
import { simulateGame } from '../src/game/sim';

const GAMES = Number(process.env.GAMES ?? 1000);
const SECONDS_PER_TURN = 25; // rough real-life estimate for an online turn

interface Scenario {
  id: string;
  label: string;
  mode: GameMode;
  config: GameConfig;
  players: number[];
  games?: number;
}

const open = (c: GameConfig): GameConfig => ({ ...cloneConfig(c), minPlayers: 2, maxPlayers: 7 });

const scenarios: Scenario[] = [
  { id: 'official-base', label: 'Official Base (90 cards)', mode: 'classic-base', config: OFFICIAL_BASE, players: [2, 3, 4, 5] },
  { id: 'official-rendang', label: 'Official Base + Rendang (110 cards)', mode: 'classic-rendang', config: OFFICIAL_RENDANG, players: [3, 4, 5, 6, 7] },
  { id: 'base-stretched', label: 'Official Base deck stretched to 6–7 players (not allowed in Classic)', mode: 'custom', config: open(OFFICIAL_BASE), players: [6, 7], games: Math.min(GAMES, 500) },
  { id: 'balanced', label: 'Custom preset: Recommended Balanced', mode: 'custom', config: customPreset('balanced'), players: [4, 5, 6, 7] },
  { id: 'fast', label: 'Custom preset: Fast Game', mode: 'custom', config: customPreset('fast'), players: [4, 5, 6, 7] },
  { id: 'chaotic', label: 'Custom preset: Chaotic / High Interaction', mode: 'custom', config: customPreset('chaotic'), players: [4, 5, 6, 7] },
];

interface Row {
  scenario: string;
  players: number;
  games: number;
  finishedPct: number;
  avgTurns: number;
  avgRounds: number;
  p90Rounds: number;
  estMinutes: number;
  targetEndPct: number;
  depletedEndPct: number;
  /** Win rate by seat offset from the first player (homogeneous bots). */
  seatWin: number[];
  /** Win rate by strategy (mixed tables). */
  strategyWin: Record<BotKind, number>;
  reshufflesPerGame: number;
  shortageTurnPct: number;
  drySupplyPct: number;
  crowBlockedPct: number;
  fliesPerGame: number;
  tradesPerGame: number;
  sharedWinPct: number;
  deck: number;
  nlCards: number;
}

function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
}

function run(sc: Scenario, n: number): Row {
  const games = sc.games ?? GAMES;
  // Half the games with identical bots (seat advantage), half mixed (strategy strength).
  const seatWins = Array(n).fill(0) as number[];
  let seatGames = 0;
  const stratWins: Record<string, number> = {};
  const stratSeats: Record<string, number> = {};
  const turns: number[] = [];
  const rounds: number[] = [];
  let finished = 0;
  let target = 0;
  let depleted = 0;
  let resh = 0;
  let shortage = 0;
  let dry = 0;
  let crow = 0;
  let flies = 0;
  let trades = 0;
  let shared = 0;
  let totalTurns = 0;

  for (let g = 0; g < games; g++) {
    const homogeneous = g % 2 === 0;
    const bots: BotKind[] = homogeneous
      ? Array(n).fill('collector')
      : Array.from({ length: n }, (_, i) => BOT_KINDS[(i + g) % BOT_KINDS.length]!);
    const r = simulateGame({ mode: sc.mode, config: sc.config, bots, seed: g * 1_000_003 + n * 17 + sc.id.length, maxTurns: 400 });
    turns.push(r.turns);
    rounds.push(r.rounds);
    totalTurns += r.turns;
    if (r.finished) finished++;
    if (r.reason === 'target') target++;
    if (r.reason === 'nl-depleted') depleted++;
    if (r.winners.length > 1) shared++;
    resh += r.reshuffles;
    shortage += r.shortageTurns;
    dry += r.drySupplyTurns;
    crow += r.crowTurnsBlocked;
    flies += r.fliesPlayed;
    trades += r.tradesDone;
    const share = r.winners.length ? 1 / r.winners.length : 0;
    if (homogeneous) {
      seatGames++;
      for (const w of r.winners) seatWins[(w - r.firstSeat + n) % n]! += share;
    } else {
      bots.forEach((b) => (stratSeats[b] = (stratSeats[b] ?? 0) + 1));
      for (const w of r.winners) stratWins[bots[w]!] = (stratWins[bots[w]!] ?? 0) + share;
    }
  }
  const strategyWin = Object.fromEntries(
    BOT_KINDS.map((b) => [b, stratSeats[b] ? (stratWins[b] ?? 0) / stratSeats[b]! : 0]),
  ) as Record<BotKind, number>;
  const avgTurns = turns.reduce((a, b) => a + b, 0) / games;
  return {
    scenario: sc.id,
    players: n,
    games,
    finishedPct: (finished / games) * 100,
    avgTurns,
    avgRounds: avgTurns / n,
    p90Rounds: percentile(rounds, 0.9),
    estMinutes: (avgTurns * SECONDS_PER_TURN) / 60,
    targetEndPct: (target / games) * 100,
    depletedEndPct: (depleted / games) * 100,
    seatWin: seatWins.map((w) => (seatGames ? w / seatGames : 0)),
    strategyWin,
    reshufflesPerGame: resh / games,
    shortageTurnPct: (shortage / totalTurns) * 100,
    drySupplyPct: (dry / totalTurns) * 100,
    crowBlockedPct: (crow / totalTurns) * 100,
    fliesPerGame: flies / games,
    tradesPerGame: trades / games,
    sharedWinPct: (shared / games) * 100,
    deck: deckSize(sc.config),
    nlCards: sc.config.nlOnePack + sc.config.nlTwoPack,
  };
}

const rows: Row[] = [];
const started = Date.now();
for (const sc of scenarios) {
  for (const n of sc.players) {
    const row = run(sc, n);
    rows.push(row);
    console.log(
      `${sc.id.padEnd(16)} ${n}p  fin ${row.finishedPct.toFixed(1)}%  rounds ${row.avgRounds.toFixed(1)}  ~${row.estMinutes.toFixed(0)}min  seat1 ${(row.seatWin[0]! * 100).toFixed(1)}%  short ${row.shortageTurnPct.toFixed(1)}%`,
    );
  }
}

const pct = (x: number) => `${x.toFixed(1)}%`;
const f1 = (x: number) => x.toFixed(1);
let md = `# Balance simulations

Generated by \`npm run simulate\` (${GAMES} games per main configuration, ${new Date().toISOString().slice(0, 10)}, ${Math.round((Date.now() - started) / 1000)}s).

**What this is:** every row is a batch of complete games played by the rules engine with heuristic bots
(Random, Ingredient Collector, Aggressive, Trader — see \`src/game/bots/bots.ts\`). Half of each batch uses
identical Collector bots (to measure seat advantage), half uses rotating mixed strategies (to compare
strategies). Bots only see their own player view. **These are heuristic bots, not expert players, so the
numbers are a reference for tuning house rules — not proof that any configuration is fair.**

Column guide: *Fin* = games that ended normally within 400 turns · *Rounds* = average full table rotations ·
*~Min* = rough duration at ${SECONDS_PER_TURN}s per turn · *Target / Pile* = ended by reaching the pack target vs. the
Nasi Lemak pile running out · *Seat 1* = win rate of the starting player (fair share = 1/N) ·
*Short* = turns where the active player held ≥5 base ingredients but no 5-different set ·
*Dry* = turns where at least one ingredient had no copies left in draw+discard ·
*Crow* = turns started while blocked by a Crow.

`;

for (const sc of scenarios) {
  md += `\n## ${sc.label}\n\nDeck: ${deckSize(sc.config)} draw cards, ${sc.config.nlOnePack + sc.config.nlTwoPack} Nasi Lemak cards (${sc.config.nlOnePack}×1 + ${sc.config.nlTwoPack}×2), ${sc.config.crows} Crows, hand ${sc.config.handSize}, draw ${sc.config.drawPerTurn}, ${sc.config.movesPerTurn} moves, target ${sc.config.targetPacks}.\n\n`;
  md += `| Players | Games | Fin | Rounds (p90) | ~Min | Target / Pile | Seat 1 (fair) | Seat win by order | Short | Dry | Crow | Flies/game | Trades/game | Shared |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of rows.filter((x) => x.scenario === sc.id)) {
    md += `| ${r.players} | ${r.games} | ${pct(r.finishedPct)} | ${f1(r.avgRounds)} (${f1(r.p90Rounds)}) | ${f1(r.estMinutes)} | ${pct(r.targetEndPct)} / ${pct(r.depletedEndPct)} | ${pct(r.seatWin[0]! * 100)} (${pct(100 / r.players)}) | ${r.seatWin.map((w) => (w * 100).toFixed(0)).join(' · ')} | ${pct(r.shortageTurnPct)} | ${pct(r.drySupplyPct)} | ${pct(r.crowBlockedPct)} | ${f1(r.fliesPerGame)} | ${f1(r.tradesPerGame)} | ${pct(r.sharedWinPct)} |\n`;
  }
  md += `\nStrategy win rate per seat (mixed tables; fair share = 1/N):\n\n| Players | Random | Collector | Aggressive | Trader |\n|---|---|---|---|---|\n`;
  for (const r of rows.filter((x) => x.scenario === sc.id)) {
    md += `| ${r.players} | ${pct(r.strategyWin.random * 100)} | ${pct(r.strategyWin.collector * 100)} | ${pct(r.strategyWin.aggressive * 100)} | ${pct(r.strategyWin.trader * 100)} |\n`;
  }
}

writeFileSync('docs/balance-results.json', JSON.stringify({ games: GAMES, rows }, null, 2));
writeFileSync('docs/BALANCE-DATA.md', md);
console.log(`\nWrote docs/BALANCE-DATA.md and docs/balance-results.json in ${Math.round((Date.now() - started) / 1000)}s`);
