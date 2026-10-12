import { Avatar } from './Avatar';
import { AVATAR_COUNT } from '../shared/protocol';
import { t } from '../client/i18n';

export function AvatarPicker({ value, onChange, disabled }: { value?: number | null; onChange: (avatar: number) => void; disabled?: boolean }) {
  return <div className="avatar-picker" role="group" aria-label={t('common.chooseAvatar')}>
    {Array.from({ length: AVATAR_COUNT }, (_, avatar) => <button key={avatar} type="button" disabled={disabled} aria-label={t('common.avatar', { n: avatar + 1 })} aria-pressed={value === avatar} data-testid={`avatar-choice-${avatar}`} onClick={() => onChange(avatar)}>
      <Avatar id={`choice-${avatar}`} name={t('common.avatar', { n: avatar + 1 })} avatar={avatar} size={60} />
    </button>)}
  </div>;
}
