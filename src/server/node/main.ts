import { createGameServer } from './server';
const portArg = process.argv.indexOf('--port');
const port = Number(portArg >= 0 ? process.argv[portArg + 1] : process.env.PORT ?? 8790);
const app = await createGameServer({
  directory: process.env.ROOM_STORE_PATH === ':memory:' ? null : process.env.ROOM_STORE_PATH,
  assets: process.env.STATIC_DIR,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean),
  fastTimers: process.env.FAST_TIMERS === '1',
});
app.server.listen(port, process.env.HOST ?? '0.0.0.0', () => console.log(`Nasi Lemak ready on http://localhost:${port}`));
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void app.stop().then(() => process.exit(0)); });
