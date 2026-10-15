/** The room owns rules and privacy; the host supplies sockets, storage and one timer. */
export interface RoomSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

export interface RoomStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(values: Record<string, unknown>): Promise<void>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  deleteAll(): Promise<void>;
  getAlarm(): Promise<number | null>;
  setAlarm(time: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

export interface RoomContext {
  storage: RoomStorage;
  blockConcurrencyWhile(callback: () => Promise<void>): void;
  getWebSockets(): RoomSocket[];
  acceptWebSocket(socket: RoomSocket): void;
}

export interface RoomEnv { FAST_TIMERS?: string }
