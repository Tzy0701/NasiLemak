import type { GameAction } from '../../game/types';
import type { GameView } from '../../game/view';
import type { ClientMessage, LobbyOp, RoomView, ServerMessage } from '../../shared/protocol';

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface RoomSnapshot {
  status: ConnStatus;
  room: RoomView | null;
  game: GameView | null;
  /** Set when the server says our seat is gone (kicked/left/closed/bad token). */
  ended: null | 'kicked' | 'left' | 'room-closed' | 'bad-token';
  lastError: string | null;
}

interface PendingReq {
  msg: ClientMessage;
  resolve: (r: { ok: boolean; error?: string }) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT = 12_000;

function newId(): string {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Resilient WebSocket client for one room: authenticates with the seat
 * token, reconnects with backoff, keeps a heartbeat and re-sends un-acked
 * requests after reconnecting (the server de-duplicates by request id).
 */
export class RoomClient {
  private ws: WebSocket | null = null;
  private snap: RoomSnapshot = { status: 'connecting', room: null, game: null, ended: null, lastError: null };
  private listeners = new Set<() => void>();
  private pending = new Map<string, PendingReq>();
  private retry = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private disposed = false;

  constructor(
    code: string,
    private token: string,
    private url: string = RoomClient.defaultUrl(code),
  ) {}

  static defaultUrl(code: string): string {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/api/rooms/${encodeURIComponent(code)}/ws`;
  }

  start(): void {
    this.connect();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.wake);
      document.addEventListener('visibilitychange', this.wake);
    }
    this.heartbeat = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.raw({ t: 'ping' });
        if (Date.now() - this.lastMessageAt > 45_000) this.ws.close();
      }
    }, 15_000);
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.wake);
      document.removeEventListener('visibilitychange', this.wake);
    }
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.resolve({ ok: false, error: 'network' });
    }
    this.pending.clear();
    this.ws?.close();
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  getSnapshot = (): RoomSnapshot => this.snap;

  lobby(body: LobbyOp): Promise<{ ok: boolean; error?: string }> {
    return this.request({ t: 'lobby', id: newId(), body });
  }

  game(action: GameAction): Promise<{ ok: boolean; error?: string }> {
    const turn = this.snap.game?.turn.number ?? -1;
    return this.request({ t: 'game', id: newId(), turn, action });
  }

  private wake = (): void => {
    if (this.disposed || this.snap.ended) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.retry = 0;
      this.connect();
    }
  };

  private set(patch: Partial<RoomSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const f of this.listeners) f();
  }

  private connect(): void {
    if (this.disposed || this.snap.ended) return;
    this.set({ status: this.snap.room ? 'reconnecting' : 'connecting' });
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.lastMessageAt = Date.now();
      ws.send(JSON.stringify({ t: 'auth', token: this.token } satisfies ClientMessage));
    };
    ws.onmessage = (ev) => {
      this.lastMessageAt = Date.now();
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      this.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.disposed || this.snap.ended) {
        this.set({ status: 'closed' });
        return;
      }
      this.set({ status: 'reconnecting' });
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(8000, 400 * 2 ** this.retry) + Math.random() * 300;
    this.retry += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private onMessage(msg: ServerMessage): void {
    switch (msg.t) {
      case 'state': {
        const first = this.snap.status !== 'open';
        this.retry = 0;
        this.set({ status: 'open', room: msg.room, game: msg.game });
        if (first) {
          // Re-send anything that was in flight when the socket dropped.
          for (const p of this.pending.values()) this.raw(p.msg);
        }
        break;
      }
      case 'ack': {
        const p = this.pending.get(msg.id);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(msg.id);
          p.resolve(msg.ok ? { ok: true } : { ok: false, error: msg.error ?? 'unknown' });
        }
        break;
      }
      case 'kicked':
        this.set({ ended: msg.reason, status: 'closed' });
        this.ws?.close();
        break;
      case 'error':
        if (msg.error === 'bad-token') {
          this.set({ ended: 'bad-token', status: 'closed' });
        } else {
          this.set({ lastError: msg.error });
        }
        break;
      case 'pong':
        break;
    }
  }

  private raw(msg: ClientMessage): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  private request(msg: Extract<ClientMessage, { id: string }>): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(msg.id);
        resolve({ ok: false, error: 'timeout' });
      }, REQUEST_TIMEOUT);
      this.pending.set(msg.id, { msg, resolve, timer });
      if (this.snap.status === 'open') this.raw(msg);
    });
  }
}
