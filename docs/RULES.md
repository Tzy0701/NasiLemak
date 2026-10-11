# Rules implemented in Nasi Lemak Online

This document lists exactly how the rules engine (`src/game/rules/engine.ts`)
plays *Nasi Lemak: The Game* and *The Rendang Expansion*, and — importantly —
which parts come from the official almanacs and which parts are our own
interpretation where the text could not be verified.

## Sources and how they were read

| Source | Status |
| --- | --- |
| Base almanac – `facultyoffun.com/s/Nasi-Lemak-The-Game-_Almanac_ENG.pdf` (mirror on `static1.squarespace.com`) | **Could not be downloaded** from the build environment (network policy blocked both hosts). Its text was read through web-search indexing of the official PDF, which returned verbatim quotes of most sections. |
| Rendang almanac – `facultyoffun.com/s/Nasi-Lemak_RendangExpansion_Almanac_ENGBM.pdf` | Same as above. |
| Faculty of Fun product page, Kosmo, Free Malaysia Today, Board Game Café review, KuPlay / Asian Board Games Festival listings | Used only to cross-check component counts and card names. |

If you own the physical almanac, please compare it with the
"Interpretations" section below — each item is a single, isolated place in
the engine and easy to change.

## Verified from the official almanac text

**Components (base, 90 cards):** 50 ingredients (10 each of Coconut Rice,
Egg, Peanuts, Sambal Bilis, Cucumber), 25 action cards (Supplier 3, Thief 3,
Wholesaler 3, Officer 3, Mak Cik Nasi Lemak 3, Fly 5, Fly Swatter 2, Fan 3),
15 Nasi Lemak cards with a golden back (8 × 1 pack, 7 × 2 packs).

**Rendang Expansion (+20 = 110 cards):** 6 Rendang, 11 action/special
(Crow 2, Si Oyen 3, +1 each Supplier, Thief, Wholesaler, Officer, Mak Cik,
Fly), 3 Nasi Lemak cards. Base 2–5 players, with expansion up to 7. All base
rules apply.

**Setup:** Nasi Lemak cards are shuffled into their own face-down pile. The
other cards are shuffled and 7 are dealt to each player; the rest is the draw
pile. Expansion: the 2 Crows sit in the middle as a **separate pile** (never
shuffled into the draw pile); the 3 expansion Nasi Lemak cards are shuffled
into the Nasi Lemak pile.

**Turn:** draw 2 cards (not a move), then up to 3 moves in any order:
make a Nasi Lemak, trade, play an action card (each card = 1 move). Used
action cards go to the discard pile. When the draw pile runs out the discard
pile is reshuffled into a new draw pile.

**Making Nasi Lemak:** discard one of each of the 5 ingredients, take the top
Nasi Lemak card and keep it face down.

**Trading:** only the player whose turn it is may start a negotiation.
Ingredient cards, Fly Swatters and Fans can be traded (and Rendang, per the
expansion); other action cards cannot. Trades need not be 1-for-1.

**Action cards**
- *Supplier* – announce an ingredient; every other player gives you all of it.
  If nobody has it you cannot announce another one. Rendang cannot be
  announced (expansion).
- *Thief* – steal a card from all other players.
- *Wholesaler* – reveal the top 3 cards of the draw pile and keep only the
  ingredient cards among them.
- *Officer* – look at all the cards of another player and take 2.
- *Mak Cik Nasi Lemak* – make a Nasi Lemak with only 3 different ingredients
  instead of 5 (see interpretation 1 for the name mapping).
- *Fly* – placed on a Nasi Lemak; a Nasi Lemak with a Fly does not count.
- *Fly Swatter* – kills a Fly on your own Nasi Lemak.
- *Fan* – fans a Fly away to another player's Nasi Lemak.

**Rendang Expansion**
- *Rendang* – wildcard ingredient that can replace any of the 5 ingredients;
  tradeable; cannot be announced with the Supplier.
- *Crow* – when a player makes the first Nasi Lemak, a Crow is placed in front
  of them; the next player to make one gets the second Crow. While a Crow is
  in front of you, you cannot make a new Nasi Lemak. On your turn you may
  chase it to another player by "giving" it one ingredient (a move); the
  ingredients collected under the Crow travel with it. Only one Crow per
  player; a Crow must go to a player without one.
- *Si Oyen* – captures the Crow and sends it back to the Crow pile; you get all
  ingredients collected under it. The Crow goes to whoever makes the next
  Nasi Lemak.

**End of game:** the game ends when a player has made 5 Nasi Lemak (packs)
cumulatively during their turn. Alternative ending: play until the Nasi Lemak
pile is empty; the player with the most Nasi Lemak (without Fly) wins; tie →
the player with the most Nasi Lemak cards wins.

## Interpretations (could not be verified word-for-word)

1. **Which card is Mak Cik?** The almanac excerpt describes a card that
   "allows the player to make a Nasi Lemak with only 3 different ingredients"
   but the extracted text did not attach the name. Every other action has a
   confirmed effect, so by elimination this is *Mak Cik Nasi Lemak*. Playing
   it counts as **one** move (playing the card *is* making the Nasi Lemak).
2. **Pack values of the 3 expansion Nasi Lemak cards** are not stated in any
   text we could read. We assume **2 × 1 pack + 1 × 2 packs** (keeps the base
   ratio). Change `OFFICIAL_RENDANG.nlOnePack / nlTwoPack` if your copy differs.
3. **Thief** takes a **random** card from each other player's hand (the digital
   equivalent of drawing blindly from a fanned hand).
4. **Wholesaler**: revealed cards are public; the non-ingredient cards go to the
   **discard pile**. Rendang counts as an ingredient.
5. **Officer** takes `min(2, target hand size)` cards; the peek is private to
   the Officer's player. While choosing, no other move can be made.
6. **Fly / Fan**: at most one Fly per Nasi Lemak card; you cannot Fly your own
   Nasi Lemak. Swatter and Fan are played as normal moves on your own turn
   (no out-of-turn reactions). The swatted Fly and the Swatter go to the discard pile.
7. **Rendang wildcards** fill any missing ingredients, so 5 Rendang are a legal
   (if wasteful) Nasi Lemak. Duplicated base ingredients are never legal.
8. **Crow arrival**: whenever a player without a Crow makes a Nasi Lemak (including
   via Mak Cik) and a Crow is waiting in the pile, they receive it.
   Si Oyen may capture **any** Crow in play, including your own.
9. **Trading**: both sides must give at least one card. A proposal costs a
   move only when it is accepted; rejected/cancelled/expired offers are free.
   The proposer offers concrete cards and asks for card *types* (the other hand
   is hidden); the other player may accept, reject, or counter (up to 6 rounds).
   Only the two players involved see the contents of an offer. While a trade is
   open the active player cannot make other moves.
10. **Win timing**: checked after every move. Short game: the active player
    reaching the target wins immediately. If the Nasi Lemak pile empties first
    (in either length), the alternative ending is scored at once.
    "Most Nasi Lemak cards" in the tie-break counts cards without a Fly;
    a remaining tie is a shared victory.
11. **Starting player** is random. **Hand limit:** none.
12. **Turn end**: the turn ends automatically after the last move (or when the
    player presses End Turn).

## Online-only additions (not in the box)

- A player who is offline when their turn comes is skipped after 60 s; the host
  can also skip them manually. Offers to/from an offline player are cancelled
  after 20 s; any offer expires after 2 minutes.
- A player who leaves mid-game is removed: their hand is discarded, their Crow
  returns to the pile, and they cannot win.
- The host can end a game early; it is then scored like the alternative ending.
- Custom mode only: optional turn timer and the "starting player draws fewer
  on turn 1" catch-up rule (see `docs/BALANCE.md`).
