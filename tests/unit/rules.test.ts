import { describe, expect, it } from 'vitest';
import { applyAction, packsOf, removePlayer, systemSkipTurn } from '../../src/game/rules/engine';
import { projectGame } from '../../src/game/view';
import { RECIPE, bad, cardOf, giveNasiLemak, hand, ok, setHand, setup } from './helpers';

describe('turns and moves', () => {
  it('allows at most 3 moves, then the turn passes and the next player draws 2', () => {
    const s = setup({ players: 3 });
    setHand(s, 'p0', ['supplier', 'supplier', 'supplier', 'supplier']);
    for (let i = 0; i < 3; i++) ok(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'supplier').id, card: 'supplier', ingredient: 'nasi' });
    expect(s.turn.playerId).toBe('p1');
    expect(s.turn.number).toBe(2);
    expect(s.turn.drawnIds).toHaveLength(2);
  });

  it('rejects moves from players whose turn it is not', () => {
    const s = setup({ players: 3 });
    bad(s, 'p1', { type: 'endTurn' }, 'not-your-turn');
    bad(s, 'p2', { type: 'make', cardIds: [] }, 'not-your-turn');
  });

  it('a player may end their turn early', () => {
    const s = setup({ players: 2 });
    ok(s, 'p0', { type: 'endTurn' });
    expect(s.turn.playerId).toBe('p1');
  });

  it('reshuffles the discard pile when the draw pile runs out', () => {
    const s = setup({ players: 2 });
    s.discardPile.push(...s.drawPile.splice(0));
    const before = s.discardPile.length;
    ok(s, 'p0', { type: 'endTurn' });
    expect(s.reshuffles).toBe(1);
    expect(s.drawPile.length).toBe(before - 2);
  });

  it('rejects garbage actions', () => {
    const s = setup();
    bad(s, 'p0', { type: 'nope' } as never, 'bad-request');
    bad(s, 'p0', { type: 'make', cardIds: 'x' } as never, 'bad-request');
    bad(s, 'p9', { type: 'endTurn' }, 'unknown-player');
  });
});

describe('making Nasi Lemak', () => {
  it('needs 5 different ingredients; discards them and awards a face-down Nasi Lemak card', () => {
    const s = setup();
    const cards = setHand(s, 'p0', [...RECIPE, 'fly']);
    const nlBefore = s.nlPile.length;
    ok(s, 'p0', { type: 'make', cardIds: cards.slice(0, 5).map((c) => c.id) });
    const p0 = s.players[0]!;
    expect(p0.nasiLemak).toHaveLength(1);
    expect(s.nlPile.length).toBe(nlBefore - 1);
    expect(p0.hand.map((c) => c.kind)).toEqual(['fly']);
    expect(s.discardPile.slice(-5).map((c) => c.kind).sort()).toEqual([...RECIPE].sort());
    expect(s.turn.movesUsed).toBe(1);
  });

  it('rejects duplicates, missing ingredients and action cards', () => {
    const s = setup();
    const cards = setHand(s, 'p0', ['nasi', 'nasi', 'telur', 'kacang', 'sambal', 'fly', 'timun']);
    bad(s, 'p0', { type: 'make', cardIds: cards.slice(0, 5).map((c) => c.id) }, 'invalid-recipe');
    bad(s, 'p0', { type: 'make', cardIds: [cards[1]!.id, cards[2]!.id, cards[3]!.id, cards[4]!.id, cards[5]!.id] }, 'invalid-recipe');
    bad(s, 'p0', { type: 'make', cardIds: [cards[1]!.id, cards[2]!.id, cards[3]!.id, cards[4]!.id] }, 'invalid-recipe');
    bad(s, 'p0', { type: 'make', cardIds: [cards[0]!.id, cards[0]!.id, cards[2]!.id, cards[3]!.id, cards[4]!.id] }, 'duplicate-card');
    bad(s, 'p0', { type: 'make', cardIds: ['zz', cards[2]!.id, cards[3]!.id, cards[4]!.id, cards[6]!.id] }, 'card-not-in-hand');
  });

  it('Rendang replaces any missing ingredient', () => {
    const s = setup({ mode: 'classic-rendang', players: 3 });
    const cards = setHand(s, 'p0', ['nasi', 'rendang', 'kacang', 'rendang', 'timun']);
    ok(s, 'p0', { type: 'make', cardIds: cards.map((c) => c.id) });
    expect(s.players[0]!.nasiLemak).toHaveLength(1);
  });

  it('Rendang does not make duplicates legal', () => {
    const s = setup({ mode: 'classic-rendang', players: 3 });
    const cards = setHand(s, 'p0', ['nasi', 'nasi', 'rendang', 'kacang', 'timun']);
    bad(s, 'p0', { type: 'make', cardIds: cards.map((c) => c.id) }, 'invalid-recipe');
  });
});

describe('action cards', () => {
  it('Supplier: every other player hands over ALL of the announced ingredient', () => {
    const s = setup({ players: 3 });
    setHand(s, 'p0', ['supplier']);
    setHand(s, 'p1', ['telur', 'telur', 'nasi']);
    setHand(s, 'p2', ['telur', 'kacang']);
    ok(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'supplier').id, card: 'supplier', ingredient: 'telur' });
    expect(hand(s, 'p0').map((c) => c.kind)).toEqual(['telur', 'telur', 'telur']);
    expect(hand(s, 'p1').map((c) => c.kind)).toEqual(['nasi']);
    expect(hand(s, 'p2').map((c) => c.kind)).toEqual(['kacang']);
    expect(s.discardPile.at(-1)!.kind).toBe('supplier');
  });

  it('Supplier: if nobody has it the card is spent (no second announcement)', () => {
    const s = setup({ players: 2 });
    setHand(s, 'p0', ['supplier']);
    setHand(s, 'p1', ['nasi']);
    ok(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'supplier').id, card: 'supplier', ingredient: 'timun' });
    expect(hand(s, 'p0')).toHaveLength(0);
    expect(s.turn.movesUsed).toBe(1);
  });

  it('Supplier: Rendang cannot be announced', () => {
    const s = setup({ mode: 'classic-rendang', players: 3 });
    setHand(s, 'p0', ['supplier']);
    bad(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'supplier').id, card: 'supplier', ingredient: 'rendang' as never }, 'bad-ingredient');
  });

  it('Thief: steals one card from every other player who has cards', () => {
    const s = setup({ players: 4 });
    setHand(s, 'p0', ['thief']);
    setHand(s, 'p1', ['nasi', 'telur']);
    setHand(s, 'p2', []);
    setHand(s, 'p3', ['fan']);
    ok(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'thief').id, card: 'thief' });
    expect(hand(s, 'p0')).toHaveLength(2);
    expect(hand(s, 'p1')).toHaveLength(1);
    expect(hand(s, 'p3')).toHaveLength(0);
    // Private log entries only for thief + victim.
    const priv = s.log.filter((e) => e.key === 'thief-private');
    expect(priv).toHaveLength(2);
    expect(priv[0]!.to).toEqual(['p0', 'p1']);
  });

  it('Thief: unusable when nobody has cards', () => {
    const s = setup({ players: 2 });
    setHand(s, 'p0', ['thief']);
    setHand(s, 'p1', []);
    bad(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'thief').id, card: 'thief' }, 'no-valid-target');
  });

  it('Wholesaler: reveals top 3, keeps only the ingredients, discards the rest', () => {
    const s = setup({ players: 2 });
    setHand(s, 'p0', ['wholesaler']);
    s.drawPile.push({ id: 'a', kind: 'fly' }, { id: 'b', kind: 'nasi' }, { id: 'c', kind: 'telur' });
    ok(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'wholesaler').id, card: 'wholesaler' });
    expect(hand(s, 'p0').map((c) => c.kind).sort()).toEqual(['nasi', 'telur']);
    expect(s.discardPile.map((c) => c.kind)).toEqual(['wholesaler', 'fly']);
    expect(s.lastReveal!.cards.map((c) => c.id)).toEqual(['c', 'b', 'a']);
  });

  it('Officer: reveals the target hand ONLY to the officer, who takes 2 cards', () => {
    const s = setup({ players: 3 });
    setHand(s, 'p0', ['officer', 'nasi']);
    const target = setHand(s, 'p1', ['rendang' as never, 'telur', 'fan']);
    ok(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'officer').id, card: 'officer', targetId: 'p1' });
    expect(s.turn.pending).toMatchObject({ type: 'officer', targetId: 'p1', take: 2 });
    expect(projectGame(s, 'p0').turn.pending!.targetHand).toHaveLength(3);
    expect(projectGame(s, 'p1').turn.pending!.targetHand).toBeUndefined();
    expect(projectGame(s, 'p2').turn.pending!.targetHand).toBeUndefined();
    // No other move while choosing.
    bad(s, 'p0', { type: 'endTurn' }, 'resolve-pending-first');
    bad(s, 'p0', { type: 'officerTake', cardIds: [target[0]!.id] }, 'wrong-count');
    bad(s, 'p2', { type: 'officerTake', cardIds: [target[0]!.id, target[1]!.id] }, 'not-your-turn');
    ok(s, 'p0', { type: 'officerTake', cardIds: [target[0]!.id, target[2]!.id] });
    expect(hand(s, 'p1').map((c) => c.kind)).toEqual(['telur']);
    expect(hand(s, 'p0')).toHaveLength(3);
    expect(s.turn.pending).toBeNull();
    expect(s.turn.movesUsed).toBe(1);
  });

  it('Officer: target with one card gives one; empty hand gives nothing', () => {
    const s = setup({ players: 3 });
    setHand(s, 'p0', ['officer', 'officer']);
    setHand(s, 'p1', ['nasi']);
    setHand(s, 'p2', []);
    ok(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'officer').id, card: 'officer', targetId: 'p1' });
    expect(s.turn.pending!.take).toBe(1);
    ok(s, 'p0', { type: 'officerTake', cardIds: [hand(s, 'p1')[0]!.id] });
    ok(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'officer').id, card: 'officer', targetId: 'p2' });
    expect(s.turn.pending).toBeNull();
  });

  it('Officer cannot target yourself', () => {
    const s = setup({ players: 2 });
    setHand(s, 'p0', ['officer']);
    bad(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'officer').id, card: 'officer', targetId: 'p0' }, 'cannot-target-self');
  });

  it('Mak Cik Nasi Lemak: makes a Nasi Lemak with only 3 different ingredients', () => {
    const s = setup({ players: 2 });
    setHand(s, 'p0', ['makcik', 'nasi', 'telur', 'timun', 'nasi']);
    const ids = [cardOf(s, 'p0', 'nasi').id, cardOf(s, 'p0', 'telur').id, cardOf(s, 'p0', 'timun').id];
    ok(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'makcik').id, card: 'makcik', ingredientIds: ids });
    expect(s.players[0]!.nasiLemak).toHaveLength(1);
    expect(hand(s, 'p0').map((c) => c.kind)).toEqual(['nasi']);
    expect(s.turn.movesUsed).toBe(1);
  });

  it('Mak Cik: rejects duplicate or wrong-count ingredients', () => {
    const s = setup({ players: 2 });
    setHand(s, 'p0', ['makcik', 'nasi', 'nasi', 'timun', 'telur']);
    const nasi = hand(s, 'p0').filter((c) => c.kind === 'nasi');
    bad(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'makcik').id, card: 'makcik', ingredientIds: [nasi[0]!.id, nasi[1]!.id, cardOf(s, 'p0', 'timun').id] }, 'invalid-recipe');
    bad(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'makcik').id, card: 'makcik', ingredientIds: [nasi[0]!.id, cardOf(s, 'p0', 'timun').id] }, 'invalid-recipe');
  });

  it('Fly: disables an opponent Nasi Lemak; it no longer counts', () => {
    const s = setup({ players: 2 });
    const nl = giveNasiLemak(s, 'p1', 2);
    setHand(s, 'p0', ['fly', 'fly']);
    expect(packsOf(s.players[1]!)).toBe(2);
    ok(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'fly').id, card: 'fly', targetId: 'p1', nlId: nl });
    expect(packsOf(s.players[1]!)).toBe(0);
    bad(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'fly').id, card: 'fly', targetId: 'p1', nlId: nl }, 'already-has-fly');
    const own = giveNasiLemak(s, 'p0', 1);
    bad(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'fly').id, card: 'fly', targetId: 'p0', nlId: own }, 'cannot-target-self');
    bad(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'fly').id, card: 'fly', targetId: 'p1', nlId: own }, 'unknown-nasi-lemak');
  });

  it('Fly Swatter: kills a Fly on your own Nasi Lemak (fly + swatter discarded)', () => {
    const s = setup({ players: 2 });
    const mine = giveNasiLemak(s, 'p0', 2, true);
    const theirs = giveNasiLemak(s, 'p1', 1, true);
    setHand(s, 'p0', ['swatter']);
    bad(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'swatter').id, card: 'swatter', nlId: theirs }, 'not-your-nasi-lemak');
    ok(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'swatter').id, card: 'swatter', nlId: mine });
    expect(packsOf(s.players[0]!)).toBe(2);
    expect(s.discardPile.slice(-2).map((c) => c.kind)).toEqual(['fly', 'swatter']);
  });

  it('Fan: blows the Fly from your Nasi Lemak onto another player', () => {
    const s = setup({ players: 3 });
    const mine = giveNasiLemak(s, 'p0', 2, true);
    const theirs = giveNasiLemak(s, 'p2', 2);
    setHand(s, 'p0', ['fan']);
    ok(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'fan').id, card: 'fan', fromNlId: mine, targetId: 'p2', toNlId: theirs });
    expect(packsOf(s.players[0]!)).toBe(2);
    expect(packsOf(s.players[2]!)).toBe(0);
  });

  it('Fan needs a Fly on your own Nasi Lemak and an unflied target', () => {
    const s = setup({ players: 2 });
    const mine = giveNasiLemak(s, 'p0', 2);
    const theirs = giveNasiLemak(s, 'p1', 2, true);
    setHand(s, 'p0', ['fan']);
    bad(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'fan').id, card: 'fan', fromNlId: mine, targetId: 'p1', toNlId: theirs }, 'no-fly-there');
  });

  it('cannot play a card you do not have, or claim the wrong card type', () => {
    const s = setup({ players: 2 });
    setHand(s, 'p0', ['thief']);
    bad(s, 'p0', { type: 'play', cardId: 'nope', card: 'thief' }, 'card-not-in-hand');
    bad(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'thief').id, card: 'wholesaler' }, 'wrong-card');
  });
});

describe('Rendang expansion: Crow and Si Oyen', () => {
  it('first Nasi Lemak maker gets a Crow; the next maker gets the second one', () => {
    const s = setup({ mode: 'classic-rendang', players: 3 });
    setHand(s, 'p0', RECIPE);
    ok(s, 'p0', { type: 'make', cardIds: hand(s, 'p0').map((c) => c.id) });
    expect(s.crows[0]!.holderId).toBe('p0');
    ok(s, 'p0', { type: 'endTurn' });
    setHand(s, 'p1', RECIPE);
    ok(s, 'p1', { type: 'make', cardIds: hand(s, 'p1').map((c) => c.id) });
    expect(s.crows.map((c) => c.holderId).sort()).toEqual(['p0', 'p1']);
  });

  it('a player with a Crow cannot make Nasi Lemak (including with Mak Cik)', () => {
    const s = setup({ mode: 'classic-rendang', players: 3 });
    s.crows[0]!.holderId = 'p0';
    setHand(s, 'p0', [...RECIPE, 'makcik']);
    bad(s, 'p0', { type: 'make', cardIds: hand(s, 'p0').slice(0, 5).map((c) => c.id) }, 'crow-blocks');
    bad(
      s,
      'p0',
      { type: 'play', cardId: cardOf(s, 'p0', 'makcik').id, card: 'makcik', ingredientIds: hand(s, 'p0').slice(0, 3).map((c) => c.id) },
      'crow-blocks',
    );
  });

  it('chasing the Crow: give it 1 ingredient (a move) and send it to a player without a Crow', () => {
    const s = setup({ mode: 'classic-rendang', players: 3 });
    s.crows[0]!.holderId = 'p0';
    s.crows[1]!.holderId = 'p2';
    setHand(s, 'p0', ['telur', 'fly']);
    bad(s, 'p0', { type: 'passCrow', crowId: 'w0', cardId: cardOf(s, 'p0', 'telur').id, targetId: 'p2' }, 'target-has-crow');
    bad(s, 'p0', { type: 'passCrow', crowId: 'w0', cardId: cardOf(s, 'p0', 'fly').id, targetId: 'p1' }, 'crow-needs-ingredient');
    bad(s, 'p0', { type: 'passCrow', crowId: 'w1', cardId: cardOf(s, 'p0', 'telur').id, targetId: 'p1' }, 'not-your-crow');
    ok(s, 'p0', { type: 'passCrow', crowId: 'w0', cardId: cardOf(s, 'p0', 'telur').id, targetId: 'p1' });
    expect(s.crows[0]!.holderId).toBe('p1');
    expect(s.crows[0]!.stash.map((c) => c.kind)).toEqual(['telur']);
    expect(s.turn.movesUsed).toBe(1);
    // The stash is public (face up on the table).
    expect(projectGame(s, 'p2').players[1]!.crow).toEqual({ id: 'w0', stashCount: 1, stashKinds: ['telur'] });
  });

  it('Si Oyen captures a Crow, returns it to the pile and gives you its stash', () => {
    const s = setup({ mode: 'classic-rendang', players: 3 });
    s.crows[0]!.holderId = 'p1';
    s.crows[0]!.stash = [
      { id: 's1', kind: 'nasi' },
      { id: 's2', kind: 'rendang' },
    ];
    setHand(s, 'p0', ['sioyen']);
    ok(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'sioyen').id, card: 'sioyen', crowId: 'w0' });
    expect(s.crows[0]!.holderId).toBeNull();
    expect(s.crows[0]!.stash).toHaveLength(0);
    expect(hand(s, 'p0').map((c) => c.id)).toEqual(['s1', 's2']);
    // The Crow goes to whoever makes the next Nasi Lemak.
    setHand(s, 'p0', RECIPE);
    ok(s, 'p0', { type: 'make', cardIds: hand(s, 'p0').map((c) => c.id) });
    expect(s.crows.find((c) => c.holderId === 'p0')).toBeDefined();
  });

  it('Si Oyen can capture your own Crow, but not a Crow still in the pile', () => {
    const s = setup({ mode: 'classic-rendang', players: 3 });
    setHand(s, 'p0', ['sioyen', 'sioyen']);
    bad(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'sioyen').id, card: 'sioyen', crowId: 'w0' }, 'crow-not-in-play');
    s.crows[0]!.holderId = 'p0';
    ok(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'sioyen').id, card: 'sioyen', crowId: 'w0' });
    expect(s.crows[0]!.holderId).toBeNull();
  });
});

describe('trading', () => {
  it('propose → accept swaps cards and costs the proposer one move', () => {
    const s = setup({ players: 3 });
    setHand(s, 'p0', ['nasi', 'fan', 'fly']);
    setHand(s, 'p1', ['telur', 'telur', 'kacang']);
    ok(s, 'p0', { type: 'proposeTrade', targetId: 'p1', offerCardIds: [cardOf(s, 'p0', 'nasi').id, cardOf(s, 'p0', 'fan').id], wantKinds: { telur: 1 } });
    expect(s.turn.movesUsed).toBe(0);
    // Hidden from the bystander, visible to both parties.
    expect(projectGame(s, 'p2').turn.trade!.offerCards).toBeUndefined();
    expect(projectGame(s, 'p1').turn.trade!.offerCards!.map((c) => c.kind)).toEqual(['nasi', 'fan']);
  });

  it('accept performs the exchange', () => {
    const s = setup({ players: 3 });
    setHand(s, 'p0', ['nasi', 'fan']);
    setHand(s, 'p1', ['telur', 'telur', 'kacang']);
    ok(s, 'p0', { type: 'proposeTrade', targetId: 'p1', offerCardIds: [cardOf(s, 'p0', 'nasi').id], wantKinds: { telur: 2 } });
    const id = s.turn.trade!.id;
    bad(s, 'p2', { type: 'respondTrade', tradeId: id, response: 'accept' }, 'not-your-decision');
    bad(s, 'p0', { type: 'respondTrade', tradeId: id, response: 'accept' }, 'not-your-decision');
    bad(s, 'p0', { type: 'play', cardId: 'x', card: 'thief' }, 'trade-in-progress');
    ok(s, 'p1', { type: 'respondTrade', tradeId: id, response: 'accept' });
    expect(hand(s, 'p0').map((c) => c.kind).sort()).toEqual(['fan', 'telur', 'telur']);
    expect(hand(s, 'p1').map((c) => c.kind).sort()).toEqual(['kacang', 'nasi']);
    expect(s.turn.movesUsed).toBe(1);
    expect(s.turn.trade).toBeNull();
  });

  it('reject costs no move; target cannot accept without the requested cards', () => {
    const s = setup({ players: 2 });
    setHand(s, 'p0', ['nasi']);
    setHand(s, 'p1', ['kacang']);
    ok(s, 'p0', { type: 'proposeTrade', targetId: 'p1', offerCardIds: [cardOf(s, 'p0', 'nasi').id], wantKinds: { timun: 1 } });
    bad(s, 'p1', { type: 'respondTrade', tradeId: s.turn.trade!.id, response: 'accept' }, 'trade-missing-cards');
    ok(s, 'p1', { type: 'respondTrade', tradeId: s.turn.trade!.id, response: 'reject' });
    expect(s.turn.movesUsed).toBe(0);
    expect(s.turn.trade).toBeNull();
  });

  it('counter-offers flip who answers; the proposer can then accept', () => {
    const s = setup({ players: 2 });
    setHand(s, 'p0', ['nasi', 'telur']);
    setHand(s, 'p1', ['kacang', 'sambal']);
    ok(s, 'p0', { type: 'proposeTrade', targetId: 'p1', offerCardIds: [cardOf(s, 'p0', 'nasi').id], wantKinds: { kacang: 1, sambal: 1 } });
    const id = s.turn.trade!.id;
    ok(s, 'p1', { type: 'counterTrade', tradeId: id, offerCardIds: [cardOf(s, 'p1', 'kacang').id], wantKinds: { nasi: 1 } });
    expect(s.turn.trade!.awaitingId).toBe('p0');
    ok(s, 'p0', { type: 'respondTrade', tradeId: id, response: 'accept' });
    expect(hand(s, 'p0').map((c) => c.kind).sort()).toEqual(['kacang', 'telur']);
    expect(hand(s, 'p1').map((c) => c.kind).sort()).toEqual(['nasi', 'sambal']);
    expect(s.turn.movesUsed).toBe(1);
  });

  it('only ingredients, Rendang, Fly Swatters and Fans can be traded', () => {
    const s = setup({ players: 2 });
    setHand(s, 'p0', ['thief', 'swatter']);
    bad(s, 'p0', { type: 'proposeTrade', targetId: 'p1', offerCardIds: [cardOf(s, 'p0', 'thief').id], wantKinds: { nasi: 1 } }, 'not-tradeable');
    bad(s, 'p0', { type: 'proposeTrade', targetId: 'p1', offerCardIds: [cardOf(s, 'p0', 'swatter').id], wantKinds: { officer: 1 } }, 'not-tradeable');
    bad(s, 'p0', { type: 'proposeTrade', targetId: 'p1', offerCardIds: [cardOf(s, 'p0', 'swatter').id], wantKinds: {} }, 'trade-needs-both-sides');
    ok(s, 'p0', { type: 'proposeTrade', targetId: 'p1', offerCardIds: [cardOf(s, 'p0', 'swatter').id], wantKinds: { fan: 1 } });
  });

  it('only the active player can start a negotiation, and can cancel it', () => {
    const s = setup({ players: 2 });
    setHand(s, 'p1', ['nasi']);
    bad(s, 'p1', { type: 'proposeTrade', targetId: 'p0', offerCardIds: [cardOf(s, 'p1', 'nasi').id], wantKinds: { telur: 1 } }, 'not-your-turn');
    setHand(s, 'p0', ['nasi']);
    ok(s, 'p0', { type: 'proposeTrade', targetId: 'p1', offerCardIds: [cardOf(s, 'p0', 'nasi').id], wantKinds: { telur: 1 } });
    bad(s, 'p1', { type: 'cancelTrade', tradeId: s.turn.trade!.id }, 'not-your-decision');
    ok(s, 'p0', { type: 'cancelTrade', tradeId: s.turn.trade!.id });
    expect(s.turn.trade).toBeNull();
  });

  it('ending the turn cancels an open trade', () => {
    const s = setup({ players: 2 });
    setHand(s, 'p0', ['nasi']);
    ok(s, 'p0', { type: 'proposeTrade', targetId: 'p1', offerCardIds: [cardOf(s, 'p0', 'nasi').id], wantKinds: { telur: 1 } });
    ok(s, 'p0', { type: 'endTurn' });
    expect(s.turn.trade).toBeNull();
    expect(s.turn.playerId).toBe('p1');
  });
});

describe('winning', () => {
  it('short game: reaching the target packs during your turn wins immediately', () => {
    const s = setup({ players: 3 });
    giveNasiLemak(s, 'p0', 2);
    giveNasiLemak(s, 'p0', 2);
    s.nlPile.push({ id: 'big', packs: 1 });
    setHand(s, 'p0', RECIPE);
    ok(s, 'p0', { type: 'make', cardIds: hand(s, 'p0').map((c) => c.id) });
    expect(s.status).toBe('finished');
    expect(s.result).toMatchObject({ reason: 'target', winnerIds: ['p0'] });
    expect(applyAction(s, 'p1', { type: 'endTurn' })).toEqual({ ok: false, error: 'game-over' });
  });

  it('Nasi Lemak with a Fly do not count towards the target', () => {
    const s = setup({ players: 2 });
    giveNasiLemak(s, 'p0', 2);
    giveNasiLemak(s, 'p0', 2, true);
    s.nlPile.push({ id: 'one', packs: 1 });
    setHand(s, 'p0', RECIPE);
    ok(s, 'p0', { type: 'make', cardIds: hand(s, 'p0').map((c) => c.id) });
    expect(s.status).toBe('playing');
    expect(packsOf(s.players[0]!)).toBe(3);
  });

  it('removing your last Fly can win the game on your turn', () => {
    const s = setup({ players: 2 });
    giveNasiLemak(s, 'p0', 2);
    giveNasiLemak(s, 'p0', 1);
    const flied = giveNasiLemak(s, 'p0', 2, true);
    setHand(s, 'p0', ['swatter']);
    ok(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'swatter').id, card: 'swatter', nlId: flied });
    expect(s.result?.winnerIds).toEqual(['p0']);
  });

  it('long game: ends when the Nasi Lemak pile runs out; most packs wins, tie → most cards', () => {
    const s = setup({ players: 3, config: { length: 'long' } });
    s.nlPile = [{ id: 'last', packs: 1 }];
    giveNasiLemak(s, 'p1', 2);
    giveNasiLemak(s, 'p1', 2);
    giveNasiLemak(s, 'p2', 2);
    giveNasiLemak(s, 'p2', 1);
    giveNasiLemak(s, 'p0', 2);
    setHand(s, 'p0', RECIPE);
    ok(s, 'p0', { type: 'make', cardIds: hand(s, 'p0').map((c) => c.id) });
    // p0: 3 packs/2 cards, p1: 4/2, p2: 3/2 → p1 wins
    expect(s.result).toMatchObject({ reason: 'nl-depleted', winnerIds: ['p1'] });
  });

  it('long game tie on packs is broken by number of Nasi Lemak cards; full tie is shared', () => {
    const s = setup({ players: 3, config: { length: 'long' } });
    s.nlPile = [{ id: 'last', packs: 2 }];
    giveNasiLemak(s, 'p1', 1);
    giveNasiLemak(s, 'p1', 1);
    giveNasiLemak(s, 'p1', 2); // 4 packs, 3 cards
    giveNasiLemak(s, 'p2', 2);
    giveNasiLemak(s, 'p2', 2); // 4 packs, 2 cards
    giveNasiLemak(s, 'p0', 2); // + last 2 → 4 packs, 2 cards
    setHand(s, 'p0', RECIPE);
    ok(s, 'p0', { type: 'make', cardIds: hand(s, 'p0').map((c) => c.id) });
    expect(s.result!.winnerIds).toEqual(['p1']);

    const t = setup({ players: 2, config: { length: 'long' } });
    t.nlPile = [{ id: 'last', packs: 2 }];
    giveNasiLemak(t, 'p1', 2);
    setHand(t, 'p0', RECIPE);
    ok(t, 'p0', { type: 'make', cardIds: hand(t, 'p0').map((c) => c.id) });
    expect(t.result!.winnerIds.sort()).toEqual(['p0', 'p1']);
  });

  it('long game ignores the 5-pack target', () => {
    const s = setup({ players: 2, config: { length: 'long' } });
    giveNasiLemak(s, 'p0', 2);
    giveNasiLemak(s, 'p0', 2);
    s.nlPile.push({ id: 'x', packs: 2 });
    setHand(s, 'p0', RECIPE);
    ok(s, 'p0', { type: 'make', cardIds: hand(s, 'p0').map((c) => c.id) });
    expect(s.status).toBe('playing');
  });
});

describe('players leaving and system actions', () => {
  it('a leaving player is skipped, hand discarded; last player standing wins', () => {
    const s = setup({ players: 3 });
    const handSize = hand(s, 'p1').length;
    const disc = s.discardPile.length;
    removePlayer(s, 'p1');
    expect(s.players[1]!.gone).toBe(true);
    expect(s.discardPile.length).toBe(disc + handSize);
    ok(s, 'p0', { type: 'endTurn' });
    expect(s.turn.playerId).toBe('p2');
    removePlayer(s, 'p0');
    expect(s.result).toMatchObject({ reason: 'players-left', winnerIds: ['p2'] });
  });

  it('active player leaving passes the turn and cancels their trade', () => {
    const s = setup({ players: 3 });
    setHand(s, 'p0', ['nasi']);
    ok(s, 'p0', { type: 'proposeTrade', targetId: 'p1', offerCardIds: [cardOf(s, 'p0', 'nasi').id], wantKinds: { telur: 1 } });
    removePlayer(s, 'p0');
    expect(s.turn.trade).toBeNull();
    expect(s.turn.playerId).toBe('p1');
  });

  it('a leaving player returns their Crow (stash discarded)', () => {
    const s = setup({ mode: 'classic-rendang', players: 3 });
    s.crows[0]!.holderId = 'p2';
    s.crows[0]!.stash = [{ id: 'q', kind: 'nasi' }];
    removePlayer(s, 'p2');
    expect(s.crows[0]!.holderId).toBeNull();
    expect(s.discardPile.some((c) => c.id === 'q')).toBe(true);
  });

  it('skipping an AFK turn resolves a pending Officer choice randomly', () => {
    const s = setup({ players: 3 });
    setHand(s, 'p0', ['officer']);
    setHand(s, 'p1', ['nasi', 'telur', 'kacang']);
    ok(s, 'p0', { type: 'play', cardId: cardOf(s, 'p0', 'officer').id, card: 'officer', targetId: 'p1' });
    systemSkipTurn(s, 'afk');
    expect(hand(s, 'p0')).toHaveLength(2);
    // p1 kept 1 card and then drew 2 at the start of their turn.
    expect(hand(s, 'p1')).toHaveLength(3);
    expect(s.turn.playerId).toBe('p1');
  });
});
