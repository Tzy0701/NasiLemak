import type { GameRoom } from './rooms/GameRoom';

export interface Env {
  ROOMS: DurableObjectNamespace<GameRoom>;
  ASSETS: Fetcher;
  /** Optional comma-separated list of extra allowed WebSocket origins. */
  ALLOWED_ORIGINS?: string;
  /** '1' shortens AFK/trade/bot timers – integration tests only. */
  FAST_TIMERS?: string;
}
