import type { Page, WebSocketRoute } from '@playwright/test';
import { ALL_CARD_KINDS, type CardKind } from '../../src/game/cards/catalog';
import { customPreset } from '../../src/game/custom/customRules';
import { seedFromNumber } from '../../src/game/rng';
import { createGame } from '../../src/game/rules/engine';
import { projectGame } from '../../src/game/view';
import type { ServerMessage } from '../../src/shared/protocol';
export function layoutState(count = 7): Extract<ServerMessage, {
  t: 'state';
}> {
  const config = { ...customPreset('balanced'), movesPerTurn: 6, targetPacks: 20 };
  const players = Array.from({ length: count }, (_, i) => ({ id: `layout-${i}`, name: ['Alexandriaabcdefghijk', '王小明与朋友一起玩椰浆饭游戏', 'Siti Nur Aisyah Amira', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'Mei Ling', 'Ravi Kumar', 'Daniel'][i]!.slice(0, 20) }));
  const state = createGame({ mode: 'custom', config, players, rng: seedFromNumber(42), firstPlayerIndex: 0 });
  const kinds: CardKind[] = [...ALL_CARD_KINDS, 'nasi', 'telur', 'sambal', 'timun'];
  state.players[0]!.hand = kinds.map((kind, i) => ({ id: `layout-card-${i}`, kind }));
  state.players.forEach((p, i) => {
    p.nasiLemak = Array.from({ length: i === 0 ? 3 : 5 }, (_, j) => ({ card: { id: `layout-nl-${i}-${j}`, packs: j % 2 ? 2 : 1 }, fly: j === 0 ? { id: `layout-fly-${i}`, kind: 'fly' } : null }));
  });
  state.crows[0]!.holderId = players[1]!.id;
  state.crows[0]!.stash = [{ id: 'stash-1', kind: 'sambal' }];
  state.turn.drawnIds = ['layout-card-0', 'layout-card-1'];
  const game = projectGame(state, players[0]!.id);
  game.lastReveal = { actorId: players[1]!.id, cards: game.hand.slice(0, 5), kept: ['layout-card-0'] };
  return { t: 'state', game, room: { code: 'AUD234', status: 'playing', hostId: players[0]!.id, youId: players[0]!.id, mode: 'custom', length: 'short', config, customProblems: [], members: players.map((p, i) => ({ ...p, ready: true, connected: true, isHost: i === 0, isBot: false, inGame: true, avatar: i + 8 })), gamesPlayed: 1, version: 1, afkSkipSec: 60 } };
}
export async function installLayoutRoom(page: Page, initial = layoutState(), prefs: { language?: 'en' | 'zh'; reducedMotion?: boolean } = {}) {
  let current = structuredClone(initial);
  const sockets = new Set<WebSocketRoute>();
  const publish = (state: typeof initial) => { current = structuredClone(state); for (const socket of sockets)
    socket.send(JSON.stringify(current)); };
  await page.addInitScript((prefs) => {
    localStorage.setItem('nl.prefs.v1', JSON.stringify({ language: prefs.language ?? 'en', sound: false, reducedMotion: prefs.reducedMotion ?? true, lastName: 'Alexandriaabcdefghijk', avatar: 8 }));
    localStorage.setItem('nl.sessions.v1', JSON.stringify({ AUD234: { code: 'AUD234', playerId: 'layout-0', token: 'layout-test-only', savedAt: Date.now() } }));
  }, prefs);
  // Reconnect probes existence over HTTP as well as opening a socket.
  await page.route('**/api/rooms/AUD234', route => route.fulfill({ json: { code: current.room.code, status: current.room.status, players: current.room.members.length, maxPlayers: 7, mode: current.room.mode } }));
  await page.routeWebSocket('**/api/rooms/AUD234/ws', socket => {
    sockets.add(socket);
    socket.onClose(() => sockets.delete(socket));
    socket.onMessage(raw => {
      const msg = JSON.parse(String(raw));
      if (msg.t === 'auth')
        socket.send(JSON.stringify(current));
      else if (msg.t === 'ping')
        socket.send(JSON.stringify({ t: 'pong', now: Date.now() }));
      else if (msg.id)
        socket.send(JSON.stringify({ t: 'ack', id: msg.id, ok: true }));
    });
  });
  return {
    publish,
    disconnect: () => { for (const socket of sockets)
      socket.close({ code: 1001 }); },
    send: (message: ServerMessage) => { for (const socket of sockets)
      socket.send(JSON.stringify(message)); },
    get state() { return structuredClone(current); },
  };
}
export function finishedLayoutState(count = 7) {
  const snapshot = layoutState(count);
  const game = snapshot.game!;
  game.status = 'finished';
  snapshot.room.status = 'finished';
  game.nlPileCount = 0;
  game.players.forEach((p, i) => {
    p.nasiLemak.forEach((nl, j) => nl.packs = i === 1 && j === 4 ? 2 : j % 2 ? 2 : 1);
    p.packs = p.nasiLemak.filter(nl => !nl.hasFly).reduce((total, nl) => total + nl.packs!, 0);
  });
  game.result = { reason: 'nl-depleted', winnerIds: ['layout-1'], standings: game.players.map(p => ({ playerId: p.id, packs: p.packs!, cards: p.nasiLemak.filter(nl => !nl.hasFly).length, fliedCards: p.nasiLemak.filter(nl => nl.hasFly).length })), revealed: Object.fromEntries(game.players.map(p => [p.id, p.nasiLemak.map(nl => nl.packs!)])) };
  return snapshot;
}
