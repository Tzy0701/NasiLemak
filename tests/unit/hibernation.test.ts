import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameRoom, TIMINGS } from '../../src/server/rooms/GameRoom';
import type { RoomContext, RoomSocket, RoomStorage } from '../../src/server/runtime';

class Socket implements RoomSocket {
  readyState = 1;
  attachment: unknown = null;
  messages: Record<string, unknown>[] = [];
  send(data: string) { this.messages.push(JSON.parse(data) as Record<string, unknown>); }
  close() { this.readyState = 3; }
  serializeAttachment(value: unknown) { this.attachment = structuredClone(value); }
  deserializeAttachment() { return structuredClone(this.attachment); }
}

/** Retain sockets, attachments and saved data while replacing the JS service. */
class Context implements RoomContext {
  data: Record<string, unknown> = {};
  alarm: number | null = null;
  writes = 0;
  alarmWrites = 0;
  sockets: RoomSocket[] = [];
  initialized = Promise.resolve();
  storage: RoomStorage = {
    get: async <T>(key: string) => structuredClone(this.data[key]) as T | undefined,
    put: async (key: string | Record<string, unknown>, value?: unknown) => { this.writes++; Object.assign(this.data, structuredClone(typeof key === 'string' ? { [key]: value } : key)); },
    delete: async key => { const existed = key in this.data; delete this.data[key]; return existed; },
    deleteAll: async () => { this.data = {}; },
    getAlarm: async () => this.alarm,
    setAlarm: async time => { this.alarmWrites++; this.alarm = time; },
    deleteAlarm: async () => { this.alarm = null; },
  };
  blockConcurrencyWhile(callback: () => Promise<void>) { this.initialized = callback(); }
  getWebSockets() { return this.sockets.filter(s => s.readyState === 1); }
  acceptWebSocket(socket: RoomSocket) { this.sockets.push(socket); }
  async wake() { const room = new GameRoom(this, {}); await this.initialized; return room; }
}

afterEach(() => vi.restoreAllMocks());

async function table() {
  const context = new Context();
  const room = await context.wake();
  const created = await room.create('TEST23', 'Host');
  if (!created.ok) throw new Error(created.error);
  const socket = new Socket();
  await room.connect(socket);
  await room.webSocketMessage(socket, JSON.stringify({ t: 'auth', token: created.res.token }));
  return { context, room, socket, credentials: created.res };
}

describe('hibernating room lifecycle', () => {
  it('loads connected rooms without any state or alarm writes', async () => {
    const { context, socket } = await table();
    const writes = context.writes, alarmWrites = context.alarmWrites, alarm = context.alarm;
    for (let i = 0; i < 4; i++) {
      const room = await context.wake();
      await room.info();
      await room.webSocketMessage(socket, '{"t":"ping"}');
    }
    expect(context.writes).toBe(writes);
    expect(context.alarmWrites).toBe(alarmWrites);
    expect(context.alarm).toBe(alarm);
  });

  it('retains reaction cooldown and deduplication across hibernation and player tabs without storage writes', async () => {
    const now = Date.now();
    const date = vi.spyOn(Date, 'now').mockReturnValue(now);
    const { context, room, socket, credentials } = await table();
    const second = new Socket();
    await room.connect(second);
    await room.webSocketMessage(second, JSON.stringify({ t: 'auth', token: credentials.token }));
    const writes = context.writes, alarmWrites = context.alarmWrites;
    const social = { t: 'social', id: 'original', kind: 'sticker', preset: 'cat' };
    await room.webSocketMessage(socket, JSON.stringify(social));
    const resumed = await context.wake();
    date.mockReturnValue(now + 1000);
    await resumed.webSocketMessage(second, JSON.stringify(social));
    await resumed.webSocketMessage(second, JSON.stringify({ ...social, id: 'too-soon' }));
    expect(second.messages.filter(m => m.t === 'social')).toHaveLength(1);
    expect(second.messages.at(-1)).toMatchObject({ t: 'ack', error: 'social-rate-limited' });
    date.mockReturnValue(now + 2100);
    await resumed.webSocketMessage(second, JSON.stringify({ ...social, id: 'later' }));
    expect(second.messages.filter(m => m.t === 'social')).toHaveLength(2);
    expect(context.writes).toBe(writes);
    expect(context.alarmWrites).toBe(alarmWrites);
  });

  it('recovers a lost connection and schedules only final empty-room cleanup', async () => {
    const { context } = await table();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    context.sockets = [];
    context.alarm = null; // The stored alarm is being delivered to a fresh instance.
    const room = await context.wake();
    expect(context.alarm).toBeNull(); // Constructor does not replace the firing alarm.
    await room.alarm();
    expect(context.alarm).toBeGreaterThan(now + TIMINGS.idleCleanupEmpty - 1000);
    expect(context.alarm).toBeLessThanOrEqual(now + TIMINGS.idleCleanupEmpty);
  });
});
