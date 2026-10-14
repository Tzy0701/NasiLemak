/**
 * One Durable Object per private room. It is the single source of truth for
 * the lobby and the game: it authenticates players, validates every intent
 * with the rules engine, persists state to SQLite-backed storage and pushes a
 * personalised snapshot to each connected WebSocket (Hibernation API).
 */
import { DurableObject } from 'cloudflare:workers';
import { BOT_KINDS, type BotKind, botDecide } from '../../game/bots/bots';
import { CUSTOM_PRESET_IDS, customPreset, customProblems, sanitizeCustomConfig } from '../../game/custom/customRules';
import { type GameConfig, type GameLength, type GameMode, officialConfig } from '../../game/rules/config';
import {
  abortGame,
  applyAction,
  createGame,
  removePlayer,
  systemCancelTrade,
  systemSkipTurn,
} from '../../game/rules/engine';
import { cryptoSeed } from '../../game/rng';
import type { GameAction, GameState } from '../../game/types';
import { projectGame } from '../../game/view';
import {
  type ClientMessage,
  type CreateRoomResponse,
  type LobbyOp,
  MAX_MESSAGE_BYTES,
  MAX_ROOM_PLAYERS,
  type RoomInfoResponse,
  type RoomView,
  type ServerMessage,
  sanitiseName,
  isValidAvatar,
} from '../../shared/protocol';
import { randomId, randomToken, sha256Hex, timingSafeEqualHex } from '../crypto';
import type { Env } from '../env';

// Timings (ms)
export const TIMINGS = {
  authTimeout: 15_000,
  tradeTimeout: 120_000,
  tradeDisconnectGrace: 20_000,
  afkSkip: 60_000,
  hostTransfer: 45_000,
  botDelay: 1_100,
  idleCleanupEmpty: 30 * 60_000,
  idleCleanupAny: 48 * 60 * 60_000,
};

/** Shortened timers used by the integration tests (FAST_TIMERS=1). */
const FAST_TIMINGS: typeof TIMINGS = {
  authTimeout: 4_000,
  tradeTimeout: 5_000,
  tradeDisconnectGrace: 1_500,
  afkSkip: 2_500,
  hostTransfer: 2_500,
  botDelay: 120,
  idleCleanupEmpty: 30_000,
  idleCleanupAny: 48 * 60 * 60_000,
};

interface Member {
  avatar?: number;
  id: string;
  name: string;
  tokenHash: string;
  ready: boolean;
  isBot: boolean;
  botKind?: BotKind;
  joinedAt: number;
  /** null = connected (or bot). */
  disconnectedAt: number | null;
}

interface RoomRecord {
  code: string;
  createdAt: number;
  hostId: string;
  members: Member[];
  mode: GameMode;
  length: GameLength;
  customConfig: GameConfig;
  status: 'lobby' | 'playing' | 'finished';
  gamesPlayed: number;
  version: number;
  /** Last successful human intent or authentication; background work never refreshes it. */
  lastActivity: number;
  /** All humans disconnected: freeze game timers until someone returns. Optional for old rooms. */
  pausedAt?: number | null;
  timers: {
    tradeKey: string | null;
    tradeAt: number;
    turnKey: number;
    turnAt: number;
  };
}

interface SocketAttachment {
  pid: string | null;
  at: number;
}

interface Bucket {
  tokens: number;
  last: number;
  strikes: number;
}

type LobbyResult = string | null;

const RATE = { perSec: 15, burst: 40, maxStrikes: 200 };

export class GameRoom extends DurableObject<Env> {
  private room: RoomRecord | null = null;
  private game: GameState | null = null;
  private buckets = new WeakMap<WebSocket, Bucket>();
  private acks = new Map<string, Map<string, ServerMessage>>();
  private tm: typeof TIMINGS;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.tm = env.FAST_TIMERS === '1' ? FAST_TIMINGS : TIMINGS;
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomRecord>('room')) ?? null;
      this.game = (await ctx.storage.get<GameState>('game')) ?? null;
      if (this.room) {
        // A runtime restart may lose sockets without delivering close events.
        // Use the last known activity/disconnection as a conservative pause
        // boundary, including rooms persisted before pausedAt existed.
        const disconnectedAt = Math.max(this.room.lastActivity, ...this.room.members.filter((m) => !m.isBot).map((m) => m.disconnectedAt ?? 0));
        for (const member of this.room.members) {
          if (!member.isBot && member.disconnectedAt === null && this.socketsFor(member.id).length === 0) {
            member.disconnectedAt = this.room.pausedAt ?? disconnectedAt;
          }
        }
        if (!this.hasConnectedHumans() && this.room.pausedAt == null) this.room.pausedAt = disconnectedAt;
      }
    });
  }

  // -------------------------------------------------------------------------
  // RPC from the Worker
  // -------------------------------------------------------------------------

  async create(code: string, rawName: unknown, avatar?: unknown): Promise<{ ok: true; res: CreateRoomResponse } | { ok: false; error: string }> {
    if (this.room) return { ok: false, error: 'room-exists' };
    const name = sanitiseName(rawName);
    if (!name) return { ok: false, error: 'bad-name' };
    if (avatar !== undefined && !isValidAvatar(avatar)) return { ok: false, error: 'bad-request' };
    const now = Date.now();
    const { member, token } = await this.newMember(name, false);
    if (isValidAvatar(avatar)) member.avatar = avatar;
    this.room = {
      code,
      createdAt: now,
      hostId: member.id,
      members: [member],
      mode: 'classic-base',
      length: 'short',
      customConfig: customPreset('balanced'),
      status: 'lobby',
      gamesPlayed: 0,
      version: 1,
      lastActivity: now,
      pausedAt: now,
      timers: { tradeKey: null, tradeAt: 0, turnKey: 0, turnAt: 0 },
    };
    await this.persist();
    await this.scheduleAlarm();
    return { ok: true, res: { code, playerId: member.id, token } };
  }

  async join(rawName: unknown, avatar?: unknown): Promise<{ ok: true; res: CreateRoomResponse } | { ok: false; error: string }> {
    if (await this.closeIfExpired()) return { ok: false, error: 'room-not-found' };
    const room = this.room;
    if (!room) return { ok: false, error: 'room-not-found' };
    const name = sanitiseName(rawName);
    if (!name) return { ok: false, error: 'bad-name' };
    if (avatar !== undefined && !isValidAvatar(avatar)) return { ok: false, error: 'bad-request' };
    if (room.status !== 'lobby') return { ok: false, error: 'game-in-progress' };
    if (room.members.length >= MAX_ROOM_PLAYERS) return { ok: false, error: 'room-full' };
    const { member, token } = await this.newMember(this.uniqueName(name), false);
    if (isValidAvatar(avatar)) member.avatar = avatar;
    room.members.push(member);
    this.touch();
    await this.commit();
    return { ok: true, res: { code: room.code, playerId: member.id, token } };
  }

  async info(): Promise<RoomInfoResponse | null> {
    if (await this.closeIfExpired()) return null;
    const room = this.room;
    if (!room) return null;
    return {
      code: room.code,
      status: room.status,
      players: room.members.length,
      maxPlayers: MAX_ROOM_PLAYERS,
      mode: room.mode,
    };
  }

  // -------------------------------------------------------------------------
  // WebSocket (Hibernation API)
  // -------------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    if (!this.room || await this.closeIfExpired()) return new Response('Room not found', { status: 404 });
    if (this.ctx.getWebSockets().length > 64) return new Response('Too many connections', { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ pid: null, at: Date.now() } satisfies SocketAttachment);
    await this.scheduleAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (!this.room || await this.closeIfExpired()) {
      this.send(ws, { t: 'kicked', reason: 'room-closed' });
      ws.close(4004, 'room closed');
      return;
    }
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) {
      this.send(ws, { t: 'error', error: 'bad-message' });
      return;
    }
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      if (this.allow(ws)) this.send(ws, { t: 'error', error: 'bad-message' });
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof (msg as { t?: unknown }).t !== 'string') {
      if (this.allow(ws)) this.send(ws, { t: 'error', error: 'bad-message' });
      return;
    }
    if (!this.allow(ws)) {
      // Always answer requests so clients never wait for a lost ack.
      const id = (msg as { id?: unknown }).id;
      if (typeof id === 'string' && id.length <= 64) this.send(ws, { t: 'ack', id, ok: false, error: 'rate-limited' });
      return;
    }
    const att = (ws.deserializeAttachment() ?? { pid: null, at: 0 }) as SocketAttachment;

    if (msg.t === 'ping') {
      this.send(ws, { t: 'pong', now: Date.now() });
      return;
    }

    if (!att.pid) {
      if (msg.t !== 'auth' || typeof msg.token !== 'string' || msg.token.length > 200) {
        this.send(ws, { t: 'error', error: 'auth-required' });
        ws.close(4001, 'auth required');
        return;
      }
      const member = await this.memberByToken(msg.token);
      if (!member) {
        this.send(ws, { t: 'error', error: 'bad-token' });
        ws.close(4003, 'bad token');
        return;
      }
      ws.serializeAttachment({ pid: member.id, at: Date.now() } satisfies SocketAttachment);
      member.disconnectedAt = null;
      this.touch();
      await this.commit();
      return;
    }

    const member = this.room.members.find((m) => m.id === att.pid);
    if (!member) {
      this.send(ws, { t: 'kicked', reason: 'kicked' });
      ws.close(4005, 'not a member');
      return;
    }

    if (msg.t === 'lobby' || msg.t === 'game') {
      if (typeof msg.id !== 'string' || msg.id.length > 64) {
        this.send(ws, { t: 'error', error: 'bad-message' });
        return;
      }
      // Idempotency: a retried message gets the original answer, never re-runs.
      const seen = this.acks.get(member.id)?.get(msg.id);
      if (seen) {
        this.send(ws, seen);
        return;
      }
      if (msg.t === 'lobby' && msg.body?.op === 'leave') {
        // Acknowledge first: leaving closes this very socket.
        const ack: ServerMessage = { t: 'ack', id: msg.id, ok: true };
        this.send(ws, ack);
        await this.handleLobby(member, msg.body);
        this.touch();
        await this.commit();
        return;
      }
      let error: string | null;
      if (msg.t === 'lobby') error = await this.handleLobby(member, msg.body);
      else error = this.handleGame(member, msg.turn, msg.action);
      const ack: ServerMessage = error ? { t: 'ack', id: msg.id, ok: false, error } : { t: 'ack', id: msg.id, ok: true };
      this.remember(member.id, msg.id, ack);
      if (!error) {
        this.touch();
        await this.commit();
      }
      // The member may have left/been removed – only answer if still open.
      try {
        this.send(ws, ack);
      } catch {
        /* socket closed */
      }
      return;
    }
    this.send(ws, { t: 'error', error: 'bad-message' });
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'closing');
    } catch {
      /* already closed */
    }
    await this.onSocketGone(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.onSocketGone(ws);
  }

  private async onSocketGone(ws: WebSocket): Promise<void> {
    const att = (ws.deserializeAttachment() ?? { pid: null }) as SocketAttachment;
    if (!this.room || !att.pid) return;
    const member = this.room.members.find((m) => m.id === att.pid);
    if (!member || member.isBot) return;
    if (member.disconnectedAt === null && this.socketsFor(member.id, ws).length === 0) {
      member.disconnectedAt = Date.now();
      await this.commit();
    }
  }

  // -------------------------------------------------------------------------
  // Alarm: timers, bots, AFK, cleanup
  // -------------------------------------------------------------------------

  async alarm(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const now = Date.now();

    // Close sockets that never authenticated.
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as SocketAttachment | null;
      if (ws.readyState === WebSocket.OPEN && att && !att.pid && now - att.at >= this.tm.authTimeout) {
        try {
          ws.close(4001, 'auth timeout');
        } catch {
          /* ignore */
        }
      }
    }

    let changed = this.updatePresence(now);
    if (await this.closeIfExpired(now)) return;

    // Empty rooms only wake for authentication cleanup or final expiry.
    // They must not advance turns/bots or extend their own lifetime.
    if (!this.hasConnectedHumans()) {
      if (changed) await this.commit();
      else await this.scheduleAlarm();
      return;
    }

    changed = this.maybeTransferHost(now) || changed;
    changed = this.runGameTimers(now) || changed;
    if (changed) {
      await this.commit();
    } else {
      await this.scheduleAlarm();
    }
  }

  private runGameTimers(now: number): boolean {
    const room = this.room!;
    const game = this.game;
    if (!this.hasConnectedHumans() || room.status !== 'playing' || !game || game.status !== 'playing') return false;
    this.syncTimers(now);
    const t = room.timers;
    const trade = game.turn.trade;

    if (trade) {
      if (now - t.tradeAt >= this.tm.tradeTimeout) {
        systemCancelTrade(game, 'timeout');
        this.afterGameChange();
        return true;
      }
      for (const pid of [trade.proposerId, trade.targetId]) {
        const m = room.members.find((x) => x.id === pid);
        if (m && !m.isBot && m.disconnectedAt && now - m.disconnectedAt >= this.tm.tradeDisconnectGrace) {
          systemCancelTrade(game, 'disconnect');
          this.afterGameChange();
          return true;
        }
      }
    }

    const current = room.members.find((m) => m.id === game.turn.playerId);
    if (game.turn.deadline && now >= game.turn.deadline) {
      systemSkipTurn(game, 'timeout');
      this.afterGameChange();
      return true;
    }
    if (current && !current.isBot && current.disconnectedAt) {
      const since = Math.max(current.disconnectedAt, t.turnAt);
      if (now - since >= this.tm.afkSkip) {
        systemSkipTurn(game, 'afk');
        this.afterGameChange();
        return true;
      }
    }
    // A player removed from the room but still seated (should not happen) – skip.
    if (!current && !game.players.find((p) => p.id === game.turn.playerId)?.gone) {
      removePlayer(game, game.turn.playerId);
      this.afterGameChange();
      return true;
    }

    // Bots.
    const actorId = trade ? trade.awaitingId : game.turn.playerId;
    const actor = room.members.find((m) => m.id === actorId);
    if (actor?.isBot && actor.botKind) {
      const view = projectGame(game, actor.id, 40);
      const action = botDecide(actor.botKind, view, cryptoSeed()) ?? ({ type: 'endTurn' } as GameAction);
      const res = applyAction(game, actor.id, action);
      if (!res.ok) {
        if (game.turn.trade) systemCancelTrade(game, 'timeout');
        else systemSkipTurn(game, 'afk');
      }
      this.afterGameChange();
      return true;
    }
    return false;
  }

  private maybeTransferHost(now: number): boolean {
    const room = this.room!;
    const host = room.members.find((m) => m.id === room.hostId);
    if (host && !host.isBot && host.disconnectedAt && now - host.disconnectedAt >= this.tm.hostTransfer) {
      const next = room.members.find((m) => !m.isBot && m.id !== host.id && m.disconnectedAt === null && this.socketsFor(m.id).length > 0);
      if (next) {
        room.hostId = next.id;
        return true;
      }
    }
    if (!host) return this.ensureHost();
    return false;
  }

  /** Keep timers (trade age, turn start, custom turn deadline) in sync with the game. */
  private syncTimers(now: number): void {
    const room = this.room!;
    const game = this.game;
    if (!game) return;
    const tr = game.turn.trade;
    const tradeKey = tr ? `${tr.id}:${tr.round}` : null;
    if (tradeKey !== room.timers.tradeKey) {
      room.timers.tradeKey = tradeKey;
      room.timers.tradeAt = now;
    }
    if (game.turn.number !== room.timers.turnKey) {
      room.timers.turnKey = game.turn.number;
      room.timers.turnAt = now;
      game.turn.deadline = game.config.turnTimerSec > 0 && game.status === 'playing' ? now + game.config.turnTimerSec * 1000 : null;
    }
  }

  private async scheduleAlarm(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    const times: number[] = [this.cleanupAt()];
    const anyConnected = this.hasConnectedHumans();
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as SocketAttachment | null;
      if (ws.readyState === WebSocket.OPEN && att && !att.pid) times.push(att.at + this.tm.authTimeout);
    }
    const host = room.members.find((m) => m.id === room.hostId);
    if (host?.disconnectedAt && room.members.some((m) => !m.isBot && m.id !== host.id && m.disconnectedAt === null && this.socketsFor(m.id).length > 0)) {
      times.push(host.disconnectedAt + this.tm.hostTransfer);
    }
    const game = this.game;
    if (anyConnected && room.status === 'playing' && game && game.status === 'playing') {
      const tr = game.turn.trade;
      if (tr) {
        times.push(room.timers.tradeAt + this.tm.tradeTimeout);
        for (const pid of [tr.proposerId, tr.targetId]) {
          const m = room.members.find((x) => x.id === pid);
          if (m?.disconnectedAt) times.push(m.disconnectedAt + this.tm.tradeDisconnectGrace);
        }
      }
      if (game.turn.deadline) times.push(game.turn.deadline);
      const current = room.members.find((m) => m.id === game.turn.playerId);
      if (current?.disconnectedAt) times.push(Math.max(current.disconnectedAt, room.timers.turnAt) + this.tm.afkSkip);
      if (!current && !game.players.find((p) => p.id === game.turn.playerId)?.gone) times.push(now + 500);
      const actorId = tr ? tr.awaitingId : game.turn.playerId;
      if (room.members.find((m) => m.id === actorId)?.isBot) times.push(now + this.tm.botDelay);
    }
    const next = Math.max(now + 50, Math.min(...times));
    const existing = await this.ctx.storage.getAlarm();
    // Replace obsolete short timers as well as bringing new deadlines forward.
    if (existing !== next) await this.ctx.storage.setAlarm(next);
  }

  private hasConnectedHumans(): boolean {
    return this.room?.members.some((m) => !m.isBot && m.disconnectedAt === null && this.socketsFor(m.id).length > 0) ?? false;
  }

  private cleanupAt(): number {
    const room = this.room!;
    const inactive = room.lastActivity + this.tm.idleCleanupAny;
    return this.hasConnectedHumans() ? inactive : Math.min(inactive, (room.pausedAt ?? room.lastActivity) + this.tm.idleCleanupEmpty);
  }

  private async closeIfExpired(now = Date.now()): Promise<boolean> {
    if (!this.room || now < this.cleanupAt()) return false;
    await this.destroy();
    return true;
  }

  /** Freeze elapsed game/AFK time while the last human is away. */
  private updatePresence(now: number): boolean {
    const room = this.room!;
    if (!this.hasConnectedHumans()) {
      if (room.pausedAt != null) return false;
      room.pausedAt = now;
      return true;
    }
    if (room.pausedAt == null) return false;
    const pausedFor = Math.max(0, now - room.pausedAt);
    if (room.timers.tradeAt > 0) room.timers.tradeAt += pausedFor;
    if (room.timers.turnAt > 0) room.timers.turnAt += pausedFor;
    if (this.game?.turn.deadline) this.game.turn.deadline += pausedFor;
    for (const member of room.members) {
      if (!member.isBot && member.disconnectedAt !== null) member.disconnectedAt += pausedFor;
    }
    room.pausedAt = null;
    return true;
  }

  // -------------------------------------------------------------------------
  // Lobby operations
  // -------------------------------------------------------------------------

  private async handleLobby(me: Member, body: LobbyOp): Promise<LobbyResult> {
    const room = this.room!;
    if (!body || typeof body !== 'object' || typeof body.op !== 'string') return 'bad-request';
    const isHost = room.hostId === me.id;
    const inLobby = room.status === 'lobby';

    switch (body.op) {
      case 'setAvatar':
        if (!isValidAvatar(body.avatar)) return 'bad-request';
        me.avatar = body.avatar;
        return null;
      case 'setReady':
        if (!inLobby) return 'not-in-lobby';
        me.ready = body.ready === true;
        return null;
      case 'rename': {
        if (!inLobby) return 'not-in-lobby';
        const name = sanitiseName(body.name);
        if (!name) return 'bad-name';
        me.name = this.uniqueName(name, me.id);
        return null;
      }
      case 'setMode':
        if (!isHost) return 'host-only';
        if (!inLobby) return 'not-in-lobby';
        if (!['classic-base', 'classic-rendang', 'custom'].includes(body.mode)) return 'bad-request';
        room.mode = body.mode;
        this.resetReady();
        return null;
      case 'setLength':
        if (!isHost) return 'host-only';
        if (!inLobby) return 'not-in-lobby';
        if (body.length !== 'short' && body.length !== 'long') return 'bad-request';
        room.length = body.length;
        room.customConfig.length = body.length;
        this.resetReady();
        return null;
      case 'setCustomConfig': {
        if (!isHost) return 'host-only';
        if (!inLobby) return 'not-in-lobby';
        const { config } = sanitizeCustomConfig(body.config, room.customConfig);
        room.customConfig = config;
        room.length = config.length;
        this.resetReady();
        return null;
      }
      case 'applyPreset':
        if (!isHost) return 'host-only';
        if (!inLobby) return 'not-in-lobby';
        if (!CUSTOM_PRESET_IDS.includes(body.preset)) return 'bad-request';
        room.customConfig = customPreset(body.preset);
        room.length = room.customConfig.length;
        this.resetReady();
        return null;
      case 'addBot': {
        if (!isHost) return 'host-only';
        if (!inLobby) return 'not-in-lobby';
        if (!BOT_KINDS.includes(body.bot)) return 'bad-request';
        if (room.members.length >= MAX_ROOM_PLAYERS) return 'room-full';
        const n = room.members.filter((m) => m.isBot).length + 1;
        const { member } = await this.newMember(this.uniqueName(`Bot ${botLabel(body.bot)} ${n}`), true);
        member.botKind = body.bot;
        member.ready = true;
        room.members.push(member);
        return null;
      }
      case 'removeBot': {
        if (!isHost) return 'host-only';
        if (!inLobby) return 'not-in-lobby';
        const bot = room.members.find((m) => m.id === body.playerId && m.isBot);
        if (!bot) return 'bad-request';
        room.members = room.members.filter((m) => m.id !== bot.id);
        return null;
      }
      case 'kick': {
        if (!isHost) return 'host-only';
        if (body.playerId === me.id) return 'bad-request';
        const target = room.members.find((m) => m.id === body.playerId);
        if (!target) return 'bad-request';
        this.removeMember(target, 'kicked');
        return null;
      }
      case 'transferHost': {
        if (!isHost) return 'host-only';
        const target = room.members.find((m) => m.id === body.playerId && !m.isBot);
        if (!target || target.id === me.id) return 'bad-request';
        room.hostId = target.id;
        return null;
      }
      case 'leave':
        this.removeMember(me, 'left');
        if (!room.members.some((m) => !m.isBot)) {
          await this.destroy();
        }
        return null;
      case 'start': {
        if (!isHost) return 'host-only';
        if (!inLobby) return 'not-in-lobby';
        const notReady = room.members.filter((m) => m.id !== me.id && !m.ready);
        if (notReady.length) return 'players-not-ready';
        return this.startGame();
      }
      case 'rematch':
        if (!isHost) return 'host-only';
        if (room.status !== 'finished') return 'game-not-finished';
        return this.startGame();
      case 'backToLobby':
        if (!isHost) return 'host-only';
        if (room.status !== 'finished') return 'game-not-finished';
        room.status = 'lobby';
        this.game = null;
        this.resetReady();
        return null;
      case 'abort':
        if (!isHost) return 'host-only';
        if (room.status !== 'playing' || !this.game) return 'no-game';
        abortGame(this.game);
        this.afterGameChange();
        return null;
      case 'skipTurn': {
        if (!isHost) return 'host-only';
        const game = this.game;
        if (room.status !== 'playing' || !game) return 'no-game';
        const current = room.members.find((m) => m.id === game.turn.playerId);
        if (current && (current.isBot || !current.disconnectedAt)) return 'player-is-connected';
        systemSkipTurn(game, 'host');
        this.afterGameChange();
        return null;
      }
      default:
        return 'bad-request';
    }
  }

  private effectiveConfig(): GameConfig {
    const room = this.room!;
    if (room.mode === 'custom') return { ...room.customConfig, length: room.length };
    return officialConfig(room.mode, room.length);
  }

  private startGame(): LobbyResult {
    const room = this.room!;
    const config = this.effectiveConfig();
    const n = room.members.length;
    if (n < config.minPlayers || n > config.maxPlayers) return 'bad-player-count';
    if (room.mode === 'custom') {
      const problems = customProblems(config, n);
      if (problems.length) return 'custom-invalid';
    }
    try {
      this.game = createGame({
        mode: room.mode,
        config,
        players: room.members.map((m) => ({ id: m.id, name: m.name })),
        rng: cryptoSeed(),
      });
    } catch (e) {
      return e instanceof Error ? e.message : 'start-failed';
    }
    room.status = 'playing';
    room.gamesPlayed += 1;
    room.timers = { tradeKey: null, tradeAt: 0, turnKey: -1, turnAt: 0 };
    this.syncTimers(Date.now());
    return null;
  }

  // -------------------------------------------------------------------------
  // Game operations
  // -------------------------------------------------------------------------

  private handleGame(me: Member, turn: unknown, action: GameAction): string | null {
    const room = this.room!;
    const game = this.game;
    if (room.status !== 'playing' || !game) return 'no-game';
    if (me.isBot) return 'bad-request';
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') return 'bad-request';
    // Reject intents made against an older turn (stale UI, double submits).
    if (typeof turn !== 'number' || turn !== game.turn.number) return 'stale-state';
    // Work on a copy so an unexpected exception can never corrupt the room.
    const next = structuredClone(game);
    const res = applyAction(next, me.id, action);
    if (!res.ok) return res.error;
    this.game = next;
    this.afterGameChange();
    return null;
  }

  private afterGameChange(): void {
    const room = this.room!;
    const game = this.game;
    if (!game) return;
    this.syncTimers(Date.now());
    if (game.status === 'finished' && room.status === 'playing') {
      room.status = 'finished';
    }
  }

  // -------------------------------------------------------------------------
  // Members
  // -------------------------------------------------------------------------

  private async newMember(name: string, isBot: boolean): Promise<{ member: Member; token: string }> {
    const token = randomToken();
    const member: Member = {
      id: randomId(12),
      name,
      tokenHash: isBot ? '' : await sha256Hex(token),
      ready: false,
      isBot,
      joinedAt: Date.now(),
      disconnectedAt: isBot ? null : Date.now(),
    };
    return { member, token };
  }

  private async memberByToken(token: string): Promise<Member | undefined> {
    const hash = await sha256Hex(token);
    return this.room?.members.find((m) => !m.isBot && m.tokenHash && timingSafeEqualHex(m.tokenHash, hash));
  }

  private uniqueName(name: string, selfId?: string): string {
    const taken = new Set(this.room?.members.filter((m) => m.id !== selfId).map((m) => m.name.toLowerCase()) ?? []);
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 50; i++) {
      const cand = `${name.slice(0, 17)} ${i}`;
      if (!taken.has(cand.toLowerCase())) return cand;
    }
    return `${name.slice(0, 12)} ${randomId(4)}`;
  }

  private removeMember(target: Member, reason: 'kicked' | 'left'): void {
    const room = this.room!;
    room.members = room.members.filter((m) => m.id !== target.id);
    if (this.game && room.status === 'playing') {
      removePlayer(this.game, target.id);
      this.afterGameChange();
    } else if (this.game) {
      const p = this.game.players.find((x) => x.id === target.id);
      if (p) p.gone = true;
    }
    for (const ws of this.socketsFor(target.id)) {
      try {
        this.send(ws, { t: 'kicked', reason });
        ws.close(4000, reason);
      } catch {
        /* ignore */
      }
    }
    this.acks.delete(target.id);
    if (room.hostId === target.id) this.ensureHost();
  }

  private ensureHost(): boolean {
    const room = this.room!;
    if (room.members.some((m) => m.id === room.hostId && !m.isBot)) return false;
    const humans = room.members.filter((m) => !m.isBot);
    const connected = humans.find((m) => !m.disconnectedAt);
    const next = connected ?? humans[0];
    if (next) {
      room.hostId = next.id;
      return true;
    }
    return false;
  }

  private resetReady(): void {
    for (const m of this.room!.members) if (!m.isBot) m.ready = false;
  }

  // -------------------------------------------------------------------------
  // Persistence & broadcast
  // -------------------------------------------------------------------------

  private touch(): void {
    if (this.room) this.room.lastActivity = Date.now();
  }

  private async persist(): Promise<void> {
    if (!this.room) return;
    if (this.game) await this.ctx.storage.put({ room: this.room, game: this.game });
    else {
      await this.ctx.storage.put('room', this.room);
      await this.ctx.storage.delete('game');
    }
  }

  /** Persist, push fresh snapshots to everyone and re-arm timers. */
  private async commit(): Promise<void> {
    if (!this.room) return;
    this.updatePresence(Date.now());
    this.room.version += 1;
    await this.persist();
    this.broadcast();
    await this.scheduleAlarm();
  }

  private async destroy(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        this.send(ws, { t: 'kicked', reason: 'room-closed' });
        ws.close(4004, 'room closed');
      } catch {
        /* ignore */
      }
    }
    this.room = null;
    this.game = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  private socketsFor(pid: string, exclude?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => {
      if (ws === exclude) return false;
      if (ws.readyState !== WebSocket.OPEN) return false;
      const att = ws.deserializeAttachment() as SocketAttachment | null;
      return att?.pid === pid;
    });
  }

  private roomView(viewerId: string): RoomView {
    const room = this.room!;
    const config = this.effectiveConfig();
    return {
      code: room.code,
      status: room.status,
      hostId: room.hostId,
      youId: viewerId,
      mode: room.mode,
      length: room.length,
      config,
      customProblems: room.mode === 'custom' ? customProblems(config, Math.max(2, room.members.length)) : [],
      members: room.members.map((m) => ({
        id: m.id,
        name: m.name,
        ...(isValidAvatar(m.avatar) ? { avatar: m.avatar } : {}),
        ready: m.isBot ? true : m.ready,
        connected: m.isBot ? true : this.socketsFor(m.id).length > 0,
        isHost: m.id === room.hostId,
        isBot: m.isBot,
        ...(m.botKind ? { botKind: m.botKind } : {}),
        inGame: !!this.game?.players.some((p) => p.id === m.id && !p.gone),
      })),
      gamesPlayed: room.gamesPlayed,
      version: room.version,
      afkSkipSec: this.tm.afkSkip / 1000,
    };
  }

  private broadcast(): void {
    if (!this.room) return;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as SocketAttachment | null;
      if (!att?.pid || ws.readyState !== WebSocket.OPEN) continue;
      if (!this.room.members.some((m) => m.id === att.pid)) continue;
      const game = this.game ? projectGame(this.game, att.pid) : null;
      this.send(ws, { t: 'state', room: this.roomView(att.pid), game });
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket already closed */
    }
  }

  private remember(pid: string, id: string, ack: ServerMessage): void {
    let m = this.acks.get(pid);
    if (!m) {
      m = new Map();
      this.acks.set(pid, m);
    }
    m.set(id, ack);
    if (m.size > 64) m.delete(m.keys().next().value!);
  }

  /** Token bucket per socket. Abusive sockets get closed. */
  private allow(ws: WebSocket): boolean {
    const now = Date.now();
    let b = this.buckets.get(ws);
    if (!b) {
      b = { tokens: RATE.burst, last: now, strikes: 0 };
      this.buckets.set(ws, b);
    }
    b.tokens = Math.min(RATE.burst, b.tokens + ((now - b.last) / 1000) * RATE.perSec);
    b.last = now;
    if (b.tokens < 1) {
      b.strikes += 1;
      if (b.strikes > RATE.maxStrikes) {
        try {
          ws.close(4008, 'rate limited');
        } catch {
          /* ignore */
        }
      }
      return false;
    }
    b.tokens -= 1;
    return true;
  }
}

function botLabel(kind: BotKind): string {
  return { random: 'Rojak', collector: 'Chef', aggressive: 'Samseng', trader: 'Peniaga' }[kind];
}
