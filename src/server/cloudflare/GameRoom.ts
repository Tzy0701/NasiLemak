import { DurableObject } from 'cloudflare:workers';
import { GameRoom as RoomService } from '../rooms/GameRoom';
import type { Env } from './env';

/** Keep the original class and binding names so existing SQLite rooms survive. */
export class GameRoom extends DurableObject<Env> {
  private service: RoomService;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Handle the browser heartbeat without waking a hibernating room or
    // reloading/writing its game state. The client uses pong only as liveness.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong","now":0}'));
    this.service = new RoomService(ctx, env);
  }

  create(code: string, name: unknown, avatar?: unknown) { return this.service.create(code, name, avatar); }
  join(name: unknown, avatar?: unknown) { return this.service.join(name, avatar); }
  info() { return this.service.info(); }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const pair = new WebSocketPair();
    if (!await this.service.connect(pair[1])) return new Response('Room unavailable', { status: 404 });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) { return this.service.webSocketMessage(socket, message); }
  webSocketClose(socket: WebSocket, code: number) { return this.service.webSocketClose(socket, code); }
  webSocketError(socket: WebSocket) { return this.service.webSocketError(socket); }
  alarm() { return this.service.alarm(); }
}
