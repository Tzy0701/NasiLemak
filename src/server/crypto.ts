import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../shared/protocol';

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** Unbiased random string from an alphabet using crypto.getRandomValues. */
export function randomString(length: number, alphabet: string): string {
  const out: string[] = [];
  const limit = 256 - (256 % alphabet.length);
  const buf = new Uint8Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < limit) out.push(alphabet[b % alphabet.length]!);
      if (out.length === length) break;
    }
  }
  return out.join('');
}

export function randomId(length = 12): string {
  return randomString(length, ID_ALPHABET);
}

export function randomRoomCode(): string {
  return randomString(ROOM_CODE_LENGTH, ROOM_CODE_ALPHABET);
}

/** 256-bit secret, base64url. */
export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
