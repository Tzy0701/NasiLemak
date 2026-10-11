# Custom House Rules — balance research

Classic modes are untouched by anything in this document. These notes explain
how the three Custom presets were chosen. Raw numbers: `docs/BALANCE-DATA.md`
(tables) and `docs/balance-results.json`; reproduce with `npm run simulate`.

## 1. What exists already (official vs. community)

| Kind | Finding |
| --- | --- |
| **Official** | Base game: 2–5 players. With the Rendang Expansion: 3–7 players, using the combined 110-card deck. The almanac also offers an alternative ending (play until the Nasi Lemak pile runs out). No official guidance on adjusting card counts. |
| **Community** | Searches (BoardGameGeek, Malaysian press/reviews, retailer pages) found **no published house rules or balance variants**. BGG itself could not be fetched from the build environment. We therefore do **not** claim any community consensus. |
| **Our own design** | Everything below: presets and the optional "starting player draws fewer on turn 1" rule. Derived from simulation, labelled as house rules in the UI. |

## 2. Method

`scripts/simulate.ts` plays complete games with four heuristic bots that only see
their own player view (`src/game/bots/bots.ts`):

- **Random** – any legal move.
- **Collector** – makes Nasi Lemak, digs for ingredients (Wholesaler, Supplier, Mak Cik), defends against Flies.
- **Aggressive** – Flies on the leader, Thief, Officer first.
- **Trader** – proposes and accepts ingredient swaps.

For every configuration and player count: **1,000 games** (500 for the
stretched base deck), half with identical Collector bots (measures seat/turn
order advantage) and half with rotating mixed strategies (measures strategy
strength). Every game is checked for completion; the unit tests additionally
verify card conservation after every single action.

Limits: bots are not expert humans (no bluffing, simple trade valuation, no
memory of opponents' cards). Use the numbers as *relative* guidance only.

## 3. Key findings (1,000 games each)

**Official game holds up well.** Base 2–5 and Rendang 3–7 always finish. Seat
advantage is small from 4 players up (starting seat 25.1% at 4p vs 25% fair;
15.6% at 7p vs 14.3%). At 2 players the starting player wins ~58% — a typical
first-player edge in short race games.

**At 6–7 players the Nasi Lemak pile becomes the clock.** With the official
Rendang deck, 24% of 7-player games end because the 18 Nasi Lemak cards ran
out before anyone reached 5 packs (9% at 6p), and 7.7% of 7-player games end in
a shared win. Stretching the *base* deck to 7 players is worse: 31% pile-outs,
the starting seat wins 19.7% (fair 14.3%), and some ingredient is completely
unavailable in the piles on 7% of turns.

**Crows dominate small Rendang tables.** At 3 players, 84% of turns begin with
the active player blocked by a Crow (2 Crows among 3 players), which makes
3-player Rendang the slowest official setup (11.6 rounds). This is how the
official rules play; Custom lets you lower the Crow count.

**Strategy mix.** Random play wins far below its share (2–22%), so skill
matters. Trader is strongest at 2–3 players; at 5–7 players Collector,
Aggressive and Trader are close to each other — no single dominant strategy.
Supplier/Thief did not produce runaway winners in any configuration.

**Rendang speeds collection** (ingredient-shortage turns drop from ~55% to
~25%), but Crows more than cancel that out at small tables.

## 4. Presets

| Preset | What changes vs. official Rendang | Result at 6p / 7p |
| --- | --- | --- |
| **Recommended Balanced** | 12 of each ingredient, Wholesaler 5, Mak Cik 4, Swatter 3, Supplier/Thief/Officer 3, Fly 6, 21 Nasi Lemak cards (12×1, 9×2). Same turn rules. | Ends by reaching 5 packs in 99.9% / 97.1% of games (vs 90.6% / 75.8% official); starting seat 16.4% / 14.0% (fair 16.7 / 14.3); ~16–17 min. |
| **Fast Game** | Draw 3, more Wholesaler/Mak Cik/Rendang, 1 Crow, fewer attacks, 90 s turn timer, starting player draws 1 fewer on turn 1. | ~3.3 / 3.1 rounds, ~8–9 min; starting seat 15.2% / 16.3%. |
| **Chaotic / High Interaction** | Fly 9, Thief/Supplier/Officer 5, Fan 5, Si Oyen 4; draw 3, 4 moves; starting player draws 2 fewer on turn 1. | ~9 Flies per game (vs ~6), ~13–14 min; starting seat 17.0% / 15.8%. |

The **"starting player draws fewer on turn 1"** option exists because shorter
games magnify the first-mover edge: without it, Fast had the starting seat at
~21% (6p, fair 16.7%) and Chaotic at ~22%; with reductions of 1 and 2 cards it
is back near the fair share. Skipping the whole draw over-corrected (≈9% at 6p).

Also available as one-click resets: **Official (Base)** and **Official
(Rendang)** decks opened up to 2–7 players.

## 5. Practical advice

- 2–5 players who want the real thing: **Classic Base**.
- 5–7 players: **Classic Rendang** is fine; switch to **Balanced** if you dislike
  games ending on an empty Nasi Lemak pile or shared wins.
- 3 players with Rendang feeling stuck under Crows: Custom → official Rendang
  preset with **Crows = 1**.
- Short lunch break: **Fast Game**.
