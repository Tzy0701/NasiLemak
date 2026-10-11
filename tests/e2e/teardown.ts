import { readFileSync, rmSync } from 'node:fs';

/** Never leave `wrangler deploy` pointing at the fast-timer test build. */
export default function teardown() {
  const file = '.wrangler/deploy/config.json';
  try {
    if (readFileSync(file, 'utf8').includes('dist-test')) rmSync(file);
  } catch {
    /* nothing to clean */
  }
}
