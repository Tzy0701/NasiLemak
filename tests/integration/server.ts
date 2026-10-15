import { type ChildProcess, spawn } from 'node:child_process';

export interface DevServer {
  url: string;
  proc: ChildProcess;
  stop: () => Promise<void>;
}

/** Real network tests can run against either host, with isolated persistent state. */
export async function startServer(port: number, backend = process.env.TEST_BACKEND ?? 'node'): Promise<DevServer> {
  const env = { ...process.env, FAST_TIMERS: '1', ROOM_STORE_PATH: `.room-data/test-${port}`, HOST: '127.0.0.1' };
  const args = backend === 'cloudflare'
    ? ['node_modules/wrangler/bin/wrangler.js', 'dev', '--config', 'tests/wrangler.test.jsonc', '--local', '--port', String(port), '--persist-to', `.wrangler/test-${port}`]
    : ['node_modules/tsx/dist/cli.mjs', 'src/server/node/main.ts', '--port', String(port)];
  const proc = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    windowsHide: true,
  });
  let output = '';
  proc.stdout?.on('data', (d) => (output += String(d)));
  proc.stderr?.on('data', (d) => (output += String(d)));
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${url}/api/health`);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    if (proc.exitCode !== null) throw new Error(`dev server exited:\n${output}`);
    await new Promise((r) => setTimeout(r, 400));
  }
  if (Date.now() >= deadline) throw new Error(`dev server did not start:\n${output}`);
  return {
    url,
    proc,
    stop: async () => {
      if (proc.exitCode !== null) return;
      if (process.platform === 'win32') {
        await new Promise<void>((resolve) => {
          const killer = spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          killer.once('exit', () => resolve());
          killer.once('error', () => { proc.kill(); resolve(); });
        });
        return;
      }
      try {
        process.kill(-proc.pid!, 'SIGTERM');
      } catch {
        proc.kill('SIGTERM');
      }
      await new Promise<void>((res) => {
        const t = setTimeout(() => {
          try {
            process.kill(-proc.pid!, 'SIGKILL');
          } catch {
            /* gone */
          }
          res();
        }, 5000);
        proc.once('exit', () => {
          clearTimeout(t);
          res();
        });
      });
    },
  };
}
