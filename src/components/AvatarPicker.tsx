import { Avatar } from './Avatar';
import { AVATAR_COUNT } from '../shared/protocol';

export function AvatarPicker({ value, onChange, disabled }: { value?: number | null; onChange: (avatar: number) => void; disabled?: boolean }) {
  return <div className="avatar-picker" role="group" aria-label="Choose your avatar">
    {Array.from({ length: AVATAR_COUNT }, (_, avatar) => <button key={avatar} type="button" disabled={disabled} aria-label={`Avatar ${avatar + 1}`} aria-pressed={value === avatar} data-testid={`avatar-choice-${avatar}`} onClick={() => onChange(avatar)}>
      <Avatar id={`choice-${avatar}`} name={`Avatar ${avatar + 1}`} avatar={avatar} size={60} />
    </button>)}
  </div>;
}
