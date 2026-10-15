/**
 * WebSocket / HTTP protocol shared by the browser client and the Worker.
 * The browser only ever sends *intents*; the Durable Object validates and
 * applies them and answers with a personalised state snapshot.
 */
import type { BotKind } from '../game/bots/bots';
import type { CustomPresetId } from '../game/custom/customRules';
import type { GameConfig, GameLength, GameMode } from '../game/rules/config';
import type { GameAction } from '../game/types';
import type { GameView } from '../game/view';
import type { SocialEvent, SocialKind, TableScore } from './social';

export const MAX_NAME_LENGTH = 20;
export const MAX_ROOM_PLAYERS = 7;
export const ROOM_CODE_LENGTH = 6;
/** Unambiguous alphabet (no 0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const MAX_MESSAGE_BYTES = 8192;
export const AVATAR_COUNT = 24;
export function isValidAvatar(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < AVATAR_COUNT;
}

export type LobbyOp =
  | { op: 'setAvatar'; avatar: number }
  | { op: 'setReady'; ready: boolean }
  | { op: 'setMode'; mode: GameMode }
  | { op: 'setLength'; length: GameLength }
  | { op: 'setCustomConfig'; config: unknown }
  | { op: 'applyPreset'; preset: CustomPresetId }
  | { op: 'start' }
  | { op: 'kick'; playerId: string }
  | { op: 'transferHost'; playerId: string }
  | { op: 'addBot'; bot: BotKind }
  | { op: 'removeBot'; playerId: string }
  | { op: 'rematch' }
  | { op: 'backToLobby' }
  | { op: 'abort' }
  | { op: 'skipTurn' }
  | { op: 'leave' }
  | { op: 'rename'; name: string };

export type ClientMessage =
  | { t: 'auth'; token: string }
  | { t: 'lobby'; id: string; body: LobbyOp }
  | { t: 'game'; id: string; turn: number; action: GameAction }
  | { t: 'ping' }
  | SocialMessage;
// Social messages are ephemeral and never consume a game move.
export type SocialMessage = { t: 'social'; id: string; kind: SocialKind; preset: string; targetId?: string };

export interface MemberView {
  /** Optional for rooms created before avatar selection. */
  avatar?: number;
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
  botKind?: BotKind;
  /** Gone from the current game (left / kicked). */
  inGame: boolean;
}

export interface RoomView {
  code: string;
  status: 'lobby' | 'playing' | 'finished';
  hostId: string;
  youId: string;
  mode: GameMode;
  length: GameLength;
  /** Effective config for the selected mode (official ones are read-only). */
  config: GameConfig;
  customProblems: string[];
  members: MemberView[];
  gamesPlayed: number;
  version: number;
  /** Seconds before an absent player's turn is skipped. */
  afkSkipSec: number;
  tableScores?: TableScore[];
}

export type ServerMessage =
  | { t: 'social'; event: SocialEvent }
  | { t: 'state'; room: RoomView; game: GameView | null }
  | { t: 'ack'; id: string; ok: boolean; error?: string }
  | { t: 'pong'; now: number }
  | { t: 'kicked'; reason: 'kicked' | 'left' | 'room-closed' }
  | { t: 'error'; error: string };

export interface CreateRoomResponse {
  code: string;
  playerId: string;
  token: string;
}

export type JoinRoomResponse = CreateRoomResponse;

export interface RoomInfoResponse {
  code: string;
  status: RoomView['status'];
  players: number;
  maxPlayers: number;
  mode: GameMode;
}

export function normaliseRoomCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  return true;
}

export function sanitiseName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Strip control chars, collapse whitespace.
  const name = raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return name.length ? name : null;
}
