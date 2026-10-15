import { describe, expect, it } from 'vitest';
import { applyAction, removePlayer, systemResolveThief, systemSkipTurn } from '../../src/game/rules/engine';
import { projectGame } from '../../src/game/view';
import { bad, cardOf, chooseAllThiefCards, hand, ok, setHand, setup } from './helpers';

function thiefGame() {
  const game = setup({ players: 4 });
  setHand(game, 'p0', ['thief']);
  setHand(game, 'p1', ['nasi', 'telur', 'timun']);
  setHand(game, 'p2', ['sambal', 'kacang']);
  setHand(game, 'p3', []);
  ok(game, 'p0', { type: 'play', card: 'thief', cardId: cardOf(game, 'p0', 'thief').id });
  return game;
}

describe('manual face-down Thief', () => {
  it('shows anonymous backs to the actor without leaking real ids or kinds', () => {
    const game = thiefGame();
    const actor = projectGame(game, 'p0');
    expect(actor.turn.pending?.type).toBe('thief');
    expect(actor.turn.pending?.choices).toHaveLength(3);
    expect(actor.turn.pending?.targetHand).toBeUndefined();
    for (const viewer of ['p0', 'p2', null]) {
      const json = JSON.stringify(projectGame(game, viewer));
      for (const card of hand(game, 'p1')) expect(json).not.toContain(`"${card.id}"`);
    }
    expect(projectGame(game, 'p1').turn.pending?.choices).toBeUndefined();
    expect(projectGame(game, null).turn.pending?.choices).toBeUndefined();
  });

  it('honours the selected back, then moves to each other nonempty opponent once', () => {
    const game = thiefGame();
    const pending = game.turn.pending;
    if (pending?.type !== 'thief') throw new Error('missing thief');
    const selected = pending.choices[1]!;
    const cardId = selected.cardId;
    expect(game.turn.movesUsed).toBe(1);
    ok(game, 'p0', { type: 'thiefTake', targetId: 'p1', choiceId: selected.id });
    expect(hand(game, 'p0').some(card => card.id === cardId)).toBe(true);
    expect(game.turn.pending?.targetId).toBe('p2');
    expect(game.turn.movesUsed).toBe(1);
    chooseAllThiefCards(game);
    expect(game.turn.pending).toBeNull();
    expect(hand(game, 'p0')).toHaveLength(2);
    expect(hand(game, 'p1')).toHaveLength(2);
    expect(hand(game, 'p2')).toHaveLength(1);
    expect(game.totalMoves).toBe(1);
    expect(projectGame(game, 'p3').log.some(entry => entry.key === 'thief-private')).toBe(false);
  });

  it('rejects forged targets, real card ids, duplicate choices and bystander actions without mutations', () => {
    const game = thiefGame();
    const pending = game.turn.pending;
    if (pending?.type !== 'thief') throw new Error('missing thief');
    const selected = pending.choices[0]!;
    bad(game, 'p0', { type: 'thiefTake', targetId: 'p2', choiceId: selected.id }, 'invalid-thief-choice');
    bad(game, 'p0', { type: 'thiefTake', targetId: 'p1', choiceId: selected.cardId }, 'invalid-thief-choice');
    bad(game, 'p1', { type: 'thiefTake', targetId: 'p1', choiceId: selected.id }, 'not-your-turn');
    bad(game, 'p0', { type: 'endTurn' }, 'resolve-pending-first');
    ok(game, 'p0', { type: 'thiefTake', targetId: 'p1', choiceId: selected.id });
    bad(game, 'p0', { type: 'thiefTake', targetId: 'p1', choiceId: selected.id }, 'invalid-thief-choice');
  });

  it('preserves the same choices in saved state and on repeated private projections', () => {
    const game = thiefGame();
    expect(projectGame(structuredClone(game), 'p0').turn.pending).toEqual(projectGame(game, 'p0').turn.pending);
  });

  it('skips a target that leaves and completes the remaining thefts', () => {
    const game = thiefGame();
    removePlayer(game, 'p1');
    expect(game.turn.pending?.targetId).toBe('p2');
    chooseAllThiefCards(game);
    expect(game.turn.pending).toBeNull();
    expect(hand(game, 'p0')).toHaveLength(1);
  });

  it('timeout resolves all remaining backs and never charges a second action', () => {
    const game = thiefGame();
    systemResolveThief(game);
    expect(game.turn.pending).toBeNull();
    expect(game.totalMoves).toBe(1);
    expect(hand(game, 'p0')).toHaveLength(2);
  });

  it('AFK resolution advances exactly one turn even when Thief was the last move', () => {
    const game = thiefGame();
    game.turn.movesUsed = game.config.movesPerTurn;
    const turn = game.turn.number;
    systemSkipTurn(game, 'afk');
    expect(game.turn.number).toBe(turn + 1);
    expect(game.turn.pending).toBeNull();
    expect(game.log.filter(entry => entry.key === 'thief-take')).toHaveLength(2);
    expect(applyAction(game, 'p0', { type: 'thiefTake', targetId: 'p2', choiceId: 'x' }).ok).toBe(false);
  });
});
