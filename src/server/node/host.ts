import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WebSocket } from 'ws';
import { GameRoom } from '../rooms/GameRoom';
import type { RoomContext, RoomEnv, RoomSocket, RoomStorage } from '../runtime';

export class NodeSocket implements RoomSocket {
  private attachment: unknown = null;
  constructor(readonly ws: WebSocket) {}
  get readyState() { return this.ws.readyState; }
  send(data: string) { this.ws.send(data); }
  close(code = 1000, reason = '') { this.ws.close(code, reason); }
  serializeAttachment(value: unknown) { this.attachment = value; }
  deserializeAttachment() { return this.attachment; }
}
interface SavedRoom { data: Record<string, unknown>; alarm: number | null }

/** One serial queue and one scheduled wake-up per room. */
export class RoomHost {
  readonly room: GameRoom;
  private sockets = new Set<RoomSocket>();
  private data: Record<string, unknown>;
  private alarmTime: number | null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private initialized: Promise<void> = Promise.resolve();
  private stopped = false;
  constructor(readonly code: string, private directory: string | null, saved: SavedRoom | null, env: RoomEnv) {
    this.data = saved?.data ?? {};
    this.alarmTime = saved?.alarm ?? null;
    const flush = () => this.flush();
    const storage: RoomStorage = {
      get: async <T>(key: string) => structuredClone(this.data[key]) as T | undefined,
      put: async (key: string | Record<string, unknown>, value?: unknown) => {
        Object.assign(this.data, structuredClone(typeof key === 'string' ? { [key]: value } : key));
        await flush();
      },
      delete: async key => { const exists = key in this.data; delete this.data[key]; await flush(); return exists; },
      deleteAll: async () => { this.data = {}; if (this.directory) await rm(join(this.directory, `${code}.json`), { force: true }); },
      getAlarm: async () => this.alarmTime,
      setAlarm: async time => { this.alarmTime = time; this.arm(); await flush(); },
      deleteAlarm: async () => { this.alarmTime = null; this.arm(); },
    };
    const ctx: RoomContext = {
      storage, blockConcurrencyWhile: callback => { this.initialized = callback(); },
      getWebSockets: () => [...this.sockets], acceptWebSocket: socket => { this.sockets.add(socket); },
    };
    this.room = new GameRoom(ctx, env);
    this.arm();
  }
  run<T>(callback: (room: GameRoom) => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => { await this.initialized; return callback(this.room); });
    this.queue = result.catch(() => undefined);
    return result;
  }
  connect(socket: NodeSocket) { return this.run(room => room.connect(socket)); }
  async disconnected(socket: NodeSocket, code: number) {
    await this.run(async room => { this.sockets.delete(socket); await room.webSocketClose(socket, code); });
  }
  private async flush(): Promise<void> {
    if (!this.directory) return;
    await mkdir(this.directory, { recursive: true });
    const filename = join(this.directory, `${this.code}.json`);
    await writeFile(`${filename}.tmp`, JSON.stringify({ data: this.data, alarm: this.alarmTime } satisfies SavedRoom), { mode: 0o600 });
    await rename(`${filename}.tmp`, filename);
  }
  private arm(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.stopped || this.alarmTime === null) return;
    this.timer = setTimeout(() => {
      void this.run(async room => {
        if (this.alarmTime === null || this.alarmTime > Date.now()) { this.arm(); return; }
        this.alarmTime = null;
        await room.alarm();
      }).catch(error => { console.error('room alarm failed', this.code, error); this.alarmTime = Date.now() + 30_000; this.arm(); });
    }, Math.max(1, Math.min(2_147_483_647, this.alarmTime - Date.now())));
    this.timer.unref();
  }
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    const sockets = [...this.sockets];
    for (const socket of sockets) socket.close(1012, 'server restarting');
    await this.run(async room => {
      this.sockets.clear();
      for (const socket of sockets) await room.webSocketClose(socket, 1012);
    });
  }
  get empty() { return !this.data.room && this.sockets.size === 0; }
  get connectionCount() { return this.sockets.size; }
  static async load(directory: string | null, env: RoomEnv): Promise<Map<string, RoomHost>> {
    const rooms = new Map<string, RoomHost>();
    if (!directory) return rooms;
    await mkdir(directory, { recursive: true });
    for (const name of await readdir(directory)) {
      if (!/^[A-Z2-9]{6}\.json$/.test(name)) continue;
      let saved: SavedRoom;
      try { saved = JSON.parse(await readFile(join(directory, name), 'utf8')) as SavedRoom; }
      catch { console.error('Unreadable room file; skipping', name); continue; }
      if (!saved.data?.room) continue;
      const code = name.slice(0, -5), host = new RoomHost(code, directory, saved, env);
      await host.run(room => room.info());
      if (!host.empty) rooms.set(code, host);
    }
    return rooms;
  }
}
