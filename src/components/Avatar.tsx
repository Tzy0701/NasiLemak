import { spriteStyle } from './art/CardArt';
import { isValidAvatar } from '../shared/protocol';
function portraitIndex(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 7;
}
export function Avatar({ id, name, size = 36, ring, bot = false, avatar }: { id: string; name: string; size?: number; ring?: boolean; bot?: boolean; avatar?: number | null }) {
  const index = isValidAvatar(avatar) ? avatar : bot ? 7 : portraitIndex(id);
  const file = index < 8 ? 'avatars' : index < 16 ? 'avatars-chinese' : 'avatars-extra';
  return <span className={`player-avatar shrink-0 ${ring ? 'animate-pulse-ring' : ''}`} data-avatar={index} style={{ width: size, height: size, ...spriteStyle(file, 4, 2, index % 8) }} title={name} aria-hidden="true" />;
}
