import { getPrefs } from './prefs';

/** Tiny synthesized sound effects (WebAudio, no assets). Respects the sound toggle. */
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', delay = 0, gain = 0.08): void {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = a.currentTime + delay;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export type Sfx = 'turn' | 'card' | 'make' | 'error' | 'win' | 'trade' | 'fly';

export function play(sfx: Sfx): void {
  if (!getPrefs().sound) return;
  switch (sfx) {
    case 'turn':
      tone(660, 0.15, 'triangle');
      tone(880, 0.2, 'triangle', 0.12);
      break;
    case 'card':
      tone(420, 0.06, 'square', 0, 0.03);
      break;
    case 'make':
      [523, 659, 784].forEach((f, i) => tone(f, 0.22, 'triangle', i * 0.09));
      break;
    case 'error':
      tone(200, 0.18, 'sawtooth', 0, 0.04);
      break;
    case 'win':
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', i * 0.12));
      break;
    case 'trade':
      tone(740, 0.1, 'sine');
      tone(560, 0.12, 'sine', 0.1);
      break;
    case 'fly':
      tone(180, 0.25, 'sawtooth', 0, 0.025);
      break;
  }
}
