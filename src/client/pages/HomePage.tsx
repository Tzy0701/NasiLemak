import { type FormEvent, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { ART_ROOT, CardArt } from '../../components/art/CardArt';
import { isValidRoomCode, normaliseRoomCode } from '../../shared/protocol';
import { t } from '../i18n';
import { ApiError, createRoom, joinRoom } from '../net/api';
import { getPrefs, latestSession, saveSession, setPrefs, usePrefs } from '../prefs';
import { navigate } from '../router';
import { CardReferenceModal, HowToPlayModal, SettingsModal } from '../ui/InfoModals';
import { LanguageButton } from '../ui/LanguageButton';

function errorText(e: unknown): string {
  const code = e instanceof ApiError ? e.code : 'network';
  return t(`errors.${code}`) !== `errors.${code}` ? t(`errors.${code}`) : t('errors.unknown', { code });
}

export function Cover() {
  return (
    <img src={`${ART_ROOT}/hero.png`} alt="" draggable={false} fetchPriority="high" className="home-cover mx-auto w-full max-w-lg object-contain" aria-hidden="true" />
  );
}

export function HomePage() {
  const prefs = usePrefs();
  const [name, setName] = useState(getPrefs().lastName);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<'how' | 'cards' | 'settings' | null>(null);
  const last = latestSession();

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(t('errors.bad-name'));
    setBusy('create');
    setError(null);
    try {
      const res = await createRoom(name.trim());
      setPrefs({ lastName: name.trim() });
      saveSession(res);
      navigate(`/r/${res.code}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    const c = normaliseRoomCode(code);
    if (!isValidRoomCode(c)) return setError(t('errors.room-not-found'));
    if (!name.trim()) return setError(t('errors.bad-name'));
    setBusy('join');
    setError(null);
    try {
      const res = await joinRoom(c, name.trim());
      setPrefs({ lastName: name.trim() });
      saveSession(res);
      navigate(`/r/${res.code}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="home-page min-h-full">
      <header className="home-hero relative overflow-hidden pb-10 pt-6 text-center text-white">
        <div className="absolute right-3 top-3 flex gap-2">
          <LanguageButton />
          <button className="btn-ghost btn-sm" onClick={() => setModal('settings')}>
            {t('common.settings')}
          </button>
        </div>
        <Cover />
        <button className="avatar-profile" onClick={() => setModal('settings')} data-testid="choose-avatar">
          <Avatar id="profile" name={t('common.chooseAvatar')} avatar={prefs.avatar} size={48} />
          <span>{t('common.chooseAvatar')}</span>
        </button>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight drop-shadow sm:text-5xl">
          {t('app.title')}
        </h1>
        <p className="mx-auto mt-2 max-w-xl px-4 text-leaf-50/90">{t('app.tagline')}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button className="btn-gold btn-sm" onClick={() => setModal('how')}>
            {t('common.howToPlay')}
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setModal('cards')}>
            {t('common.cards')}
          </button>
        </div>
      </header>

      <main className="mx-auto -mt-6 max-w-5xl px-4 pb-16">
        {error && (
          <div role="alert" className="mb-4 rounded-2xl bg-sambal-500 px-4 py-3 font-semibold text-white shadow">
            {error}
          </div>
        )}
        {last && (
          <button className="btn-leaf mb-4 w-full" onClick={() => navigate(`/r/${last.code}`)}>
            {t('home.rejoin', { code: last.code })}
          </button>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <form onSubmit={onCreate} className="panel p-5" data-testid="create-form">
            <h2 className="text-2xl font-semibold text-sambal-600">{t('home.createTitle')}</h2>
            <p className="mb-4 text-sm text-kopi-700">{t('home.createHint')}</p>
            <label className="mb-1 block text-sm font-bold">{t('common.yourName')}</label>
            <input
              className="input mb-4"
              value={name}
              maxLength={20}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('common.namePlaceholder')}
              autoComplete="nickname"
              data-testid="create-name"
            />
          <button className="btn-gold w-full" disabled={busy !== null} data-testid="create-room">
              {busy === 'create' ? t('common.loading') : t('common.create')}
            </button>
          </form>
          <form onSubmit={onJoin} className="panel p-5" data-testid="join-form">
            <h2 className="text-2xl font-semibold text-leaf-700">{t('home.joinTitle')}</h2>
            <p className="mb-4 text-sm text-kopi-700">{t('home.joinHint')}</p>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-bold">{t('common.roomCode')}</label>
                <input
                  className="input font-display uppercase tracking-[0.2em]"
                  value={code}
                  maxLength={6}
                  onChange={(e) => setCode(normaliseRoomCode(e.target.value))}
                  placeholder={t('common.codePlaceholder')}
                  autoCapitalize="characters"
                  data-testid="join-code"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold">{t('common.yourName')}</label>
                <input
                  className="input"
                  value={name}
                  maxLength={20}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('common.namePlaceholder')}
                  data-testid="join-name"
                />
              </div>
            </div>
            <button className="btn-leaf w-full" disabled={busy !== null} data-testid="join-room">
              {busy === 'join' ? t('common.loading') : t('common.join')}
            </button>
          </form>
        </div>

        <section className="mt-10">
          <h2 className="heritage-heading mb-4 text-center text-3xl font-semibold">{t('home.modesTitle')}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {(
              [
                ['modeBase', 'nasi', 'bg-leaf-500'],
                ['modeRendang', 'rendang', 'bg-rendang-500'],
                ['modeCustom', 'makcik', 'bg-kunyit-400'],
              ] as const
            ).map(([k, art, color]) => (
              <article key={k} className="panel overflow-hidden">
                <div className={`${color} mode-art flex h-28 items-center justify-center`}>
                  <CardArt kind={art} className="h-24 w-24 drop-shadow-lg" />
                </div>
                <div className="p-4">
                  <h3 className="text-xl font-semibold">{t(`home.${k}`)}</h3>
                  <p className="mt-1 text-sm text-kopi-700">{t(`home.${k}Desc`)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-santan-200">{t('app.fanMade')}</p>
      </main>
      <HowToPlayModal open={modal === 'how'} onClose={() => setModal(null)} />
      <CardReferenceModal open={modal === 'cards'} onClose={() => setModal(null)} />
      <SettingsModal open={modal === 'settings'} onClose={() => setModal(null)} />
    </div>
  );
}
