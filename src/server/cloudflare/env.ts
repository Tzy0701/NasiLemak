import type { GameRoom } from './GameRoom';

export interface Env {
  ROOMS: DurableObjectNamespace<GameRoom>;
  ASSETS: Fetcher;
  ALLOWED_ORIGINS?: string;
  /** Local tests only. Never set this in production. */
  FAST_TIMERS?: string;
}
