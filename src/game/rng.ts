/**
 * Deterministic, serialisable PRNG (sfc32). The state lives inside the
 * GameState so a Durable Object can be evicted and restored mid-game without
 * changing future shuffles. The server seeds it with crypto.getRandomValues,
 * tests and simulations seed it explicitly.
 */
export type RngState = [number, number, number, number];

export function seedRng(seed: ArrayLike<number>): RngState {
  const s: RngState = [seed[0]! >>> 0, seed[1]! >>> 0, seed[2]! >>> 0, seed[3]! >>> 0];
  if ((s[0] | s[1] | s[2] | s[3]) === 0) s[3] = 0x9e3779b9;
  // Warm up so similar seeds diverge quickly.
  for (let i = 0; i < 16; i++) nextUint32(s);
  return s;
}

export function seedFromNumber(n: number): RngState {
  return seedRng([n >>> 0, Math.imul(n, 0x85ebca6b) >>> 0, 0x2545f491, Math.imul(n ^ 0xdeadbeef, 0xc2b2ae35) >>> 0]);
}

export function cryptoSeed(): RngState {
  const buf = new Uint32Array(4);
  crypto.getRandomValues(buf);
  return seedRng(buf);
}

/** Mutates `s` in place and returns a uint32. */
export function nextUint32(s: RngState): number {
  let [a, b, c, d] = s;
  a >>>= 0;
  b >>>= 0;
  c >>>= 0;
  d >>>= 0;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) >>> 0;
  s[0] = a >>> 0;
  s[1] = b >>> 0;
  s[2] = c >>> 0;
  s[3] = d >>> 0;
  return t;
}

/** Unbiased integer in [0, n). */
export function randInt(s: RngState, n: number): number {
  if (n <= 0) throw new Error('randInt: n must be positive');
  const limit = Math.floor(0x100000000 / n) * n;
  let x: number;
  do {
    x = nextUint32(s);
  } while (x >= limit);
  return x % n;
}

/** Fisher–Yates shuffle in place. */
export function shuffleInPlace<T>(s: RngState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}
