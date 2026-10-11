import type { GameAction } from '../../src/game/types';
import type { GameView } from '../../src/game/view';
import type { CreateRoomResponse, LobbyOp, RoomView, ServerMessage } from '../../src/shared/protocol';

let reqSeq = 0;

export interface Received {
  msg: ServerMessage;
  raw: string;
}

/** A real player: HTTP join + its own WebSocket connection. */
export class TestPlayer {
  ws: WebSocket | null = null;
  room: RoomView | null = null;
  game: GameView | null = null;
  received: Received[] = [];
  kicked: string | null = null;
  errors: string[] = [];
  private waiters: (() => void)[] = [];
  private acks = new Map<string, (m: { ok: boolean; error?: string }) => void>();

  constructor(
    public base: string,
    public name: string,
    public code: string,
    public playerId: string,
    public token: string,
  ) {}

  static async create(base: string, name: string): Promise<TestPlayer> {
    const r = await fetch(`${base}/api/rooms`, { method: 'POST', body: JSON.stringify({ name }), headers: { 'content-type': 'application/json' } });
    if (!r.ok) throw new Error(`create failed ${r.status} ${await r.text()}`);
    const j = (await r.json()) as CreateRoomResponse;
    const p = new TestPlayer(base, name, j.code, j.playerId, j.token);
    await p.connect();
    return p;
  }

  static async join(base: string, code: string, name: string): Promise<TestPlayer> {
    const r = await fetch(`${base}/api/rooms/${code}/join`, { method: 'POST', body: JSON.stringify({ name }), headers: { 'content-type': 'application/json' } });
    if (!r.ok) throw new Error(`join failed ${r.status} ${await r.text()}`);
    const j = (await r.json()) as CreateRoomResponse;
    const p = new TestPlayer(base, name, j.code, j.playerId, j.token);
    await p.connect();
    return p;
  }

  get me() {
    return this.room?.members.find((m) => m.id === this.playerId);
  }

  async connect(token = this.token): Promise<void> {
    const url = this.base.replace(/^http/, 'ws') + `/api/rooms/${this.code}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    const versionBefore = this.room?.version ?? -1;
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        ws.send(JSON.stringify({ t: 'auth', token }));
        resolve();
      };
      ws.onerror = () => reject(new Error('ws error'));
    });
    ws.onmessage = (ev) => this.onMessage(String(ev.data));
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.notify();
    };
    if (token === this.token) await this.waitFor(() => (this.room?.version ?? -1) > versionBefore, 10_000, 'first state');
  }

  /** Drop the connection abruptly (simulates closing the tab / losing signal). */
  drop(): void {
    this.ws?.close();
    this.ws = null;
  }

  private onMessage(raw: string) {
    const msg = JSON.parse(raw) as ServerMessage;
    this.received.push({ msg, raw });
    if (msg.t === 'state') {
      this.room = msg.room;
      this.game = msg.game;
    } else if (msg.t === 'ack') {
      this.acks.get(msg.id)?.(msg);
      this.acks.delete(msg.id);
    } else if (msg.t === 'kicked') {
      this.kicked = msg.reason;
    } else if (msg.t === 'error') {
      this.errors.push(msg.error);
    }
    this.notify();
  }

  private notify() {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }

  async waitFor(pred: () => boolean, timeout = 10_000, what = 'condition'): Promise<void> {
    const deadline = Date.now() + timeout;
    while (!pred()) {
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`${this.name}: timeout waiting for ${what}`);
      await new Promise<void>((res) => {
        const t = setTimeout(res, Math.min(left, 250));
        this.waiters.push(() => {
          clearTimeout(t);
          res();
        });
      });
    }
  }

  sendRaw(data: string): void {
    this.ws!.send(data);
  }

  request(msg: Record<string, unknown>, id = `r${++reqSeq}`): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${this.name}: no ack for ${JSON.stringify(msg)}`)), 15_000);
      this.acks.set(id, (m) => {
        clearTimeout(t);
        resolve(m.ok ? { ok: true } : { ok: false, error: m.error });
      });
      this.ws!.send(JSON.stringify({ ...msg, id }));
    });
  }

  lobby(body: LobbyOp, id?: string) {
    return this.request({ t: 'lobby', body }, id);
  }

  act(action: GameAction, turn = this.game?.turn.number ?? -1, id?: string) {
    return this.request({ t: 'game', turn, action }, id);
  }

  close() {
    this.ws?.close();
  }
}

export async function makeRoom(base: string, n: number, prefix = 'P'): Promise<TestPlayer[]> {
  const host = await TestPlayer.create(base, `${prefix}0`);
  const players = [host];
  for (let i = 1; i < n; i++) players.push(await TestPlayer.join(base, host.code, `${prefix}${i}`));
  await host.waitFor(() => host.room!.members.length === n, 10_000, 'all joined');
  return players;
}

export async function readyAll(players: TestPlayer[]) {
  for (const p of players.slice(1)) expectOk(await p.lobby({ op: 'setReady', ready: true }));
}

export function expectOk(r: { ok: boolean; error?: string }) {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
}
