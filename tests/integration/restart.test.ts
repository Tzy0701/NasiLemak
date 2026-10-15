import { describe, expect, it } from 'vitest';
import { TestPlayer, expectOk, makeRoom, readyAll } from './client';
import { playGame } from './driver';
import { startServer } from './server';

describe('server restart with retained local files', () => {
  it('restores room files; players reconnect and finish the game', async () => {
    const port = 8793;
    let server = await startServer(port);
    const players = await makeRoom(server.url, 3);
    expectOk(await players[0]!.lobby({ op: 'setAvatar', avatar: 8 }));
    expectOk(await players[0]!.lobby({ op: 'setMode', mode: 'classic-rendang' }));
    await readyAll(players);
    expectOk(await players[0]!.lobby({ op: 'start' }));
    for (const p of players) await p.waitFor(() => p.game?.status === 'playing', 5000, 'start');
    await playGame(players, ['collector', 'trader', 'aggressive'], { maxActions: 25 });
    const before = players.map((p) => ({ hand: p.game!.hand.map((c) => c.id).sort(), turn: p.game!.turn.number, version: p.room!.version }));

    // Kill the process: room memory and sockets are gone; local files remain.
    await server.stop();
    players.forEach((p) => p.drop());
    server = await startServer(port);

    const again: TestPlayer[] = [];
    for (const p of players) {
      const np = new TestPlayer(server.url, p.name, p.code, p.playerId, p.token);
      await np.connect();
      again.push(np);
    }
    again.forEach((p, i) => {
      expect(p.game!.hand.map((c) => c.id).sort()).toEqual(before[i]!.hand);
      expect(p.game!.turn.number).toBe(before[i]!.turn);
    });
    expect(again[0]!.me!.avatar).toBe(8);
    await playGame(again, ['collector', 'trader', 'aggressive']);
    for (const p of again) await p.waitFor(() => p.game?.status === 'finished', 10_000, 'finish broadcast after restart');
    expect(again[0]!.game!.status).toBe('finished');
    again.forEach((p) => p.close());
    await server.stop();
  });
});
