export const STICKERS = ['laugh', 'cry', 'smug', 'shock', 'thanks', 'hurry', 'cat', 'crow', 'hungry', 'cheer', 'sneak', 'love'] as const;
export const PHRASES = ['yourTurn', 'wait', 'needEgg', 'trade', 'noSteal', 'delicious', 'thanks', 'again', 'nice', 'oops', 'goodLuck', 'bye'] as const;
export type SocialKind = 'sticker' | 'phrase';
export interface SocialEvent { id: string; senderId: string; targetId: string; kind: SocialKind; preset: string; at: number }
export interface TableScore { playerId: string; name: string; avatar?: number; games: number; wins: number; packs: number; streak: number; bestStreak: number }
