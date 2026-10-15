import { spawn } from 'node:child_process';
const children = [
  spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'watch', 'src/server/node/main.ts'], { stdio: 'inherit', windowsHide: true }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'inherit', windowsHide: true }),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
for (const child of children) child.on('exit', stop);
