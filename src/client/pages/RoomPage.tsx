import { type FormEvent, createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { RoomInfoResponse } from '../../shared/protocol';
import { t } from '../i18n';
import { ApiError, joinRoom, roomInfo } from '../net/api';
import { RoomClient, type RoomSnapshot } from '../net/RoomClient';
import { clearSession, getPrefs, getSession, saveSession, setPrefs } from '../prefs';
import { navigate } from '../router';
import { GameTable } from '../game/GameTable';
import { Lobby } from './Lobby';
import { Cover } from './HomePage';

interface RoomCtx {
  client: RoomClient;
  snap: RoomSnapshot;
}

const Ctx = createContext<RoomCtx | null>(null);

export function useRoom(): RoomCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useRoom outside RoomPage');
  return c;
}

export function RoomPage({ code }: { code: string }) {
  const [session, setSession] = useState(() => getSession(code));
  if (!session) return <JoinForm code={code} onJoined={() => setSession(getSession(code))} />;
  return <ConnectedRoom key={session.token} code={code} token={session.token} />;
}

function ConnectedRoom({ code, token }: { code: string; token: string }) {
  const [client] = useState(() => new RoomClient(code, token));
  useEffect(() => {
    client.start();
    return () => client.dispose();
  }, [client]);
  const snap = useSyncExternalStore(client.subscribe, client.getSnapshot);

  if (snap.ended) {
    return <Ended code={code} reason={snap.ended} />;
  }
  if (!snap.room) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <Cover />
        <p className="animate-pulse font-display text-xl text-leaf-700">{t('game.connection.connecting')}</p>
      </div>
    );
  }
  return (
    <Ctx.Provider value={{ client, snap }}>
      {snap.status !== 'open' && (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-[60] bg-kunyit-400 py-1 text-center text-sm font-bold text-kopi-900 shadow"
          data-testid="reconnecting"
        >
          {t('game.connection.reconnecting')}
        </div>
      )}
      {snap.room.status === 'lobby' || !snap.game ? <Lobby /> : <GameTable key={snap.room.gamesPlayed} />}
    </Ctx.Provider>
  );
}

function Ended({ code, reason }: { code: string; reason: NonNullable<RoomSnapshot['ended']> }) {
  useEffect(() => {
    clearSession(code);
  }, [code]);
  const msg = t(`room.${reason === 'bad-token' ? 'badToken' : reason === 'room-closed' ? 'closed' : reason}`);
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-display text-2xl">{msg}</p>
      <div className="flex gap-2">
        {reason === 'bad-token' && (
          <button className="btn-leaf" onClick={() => location.reload()}>
            {t('common.join')}
          </button>
        )}
        <button className="btn-primary" onClick={() => navigate('/')}>
          {t('common.back')}
        </button>
      </div>
    </div>
  );
}

function JoinForm({ code, onJoined }: { code: string; onJoined: () => void }) {
  const [info, setInfo] = useState<RoomInfoResponse | null | 'missing'>(null);
  const [name, setName] = useState(getPrefs().lastName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    roomInfo(code)
      .then(setInfo)
      .catch(() => setInfo('missing'));
  }, [code]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(t('errors.bad-name'));
    setBusy(true);
    setError(null);
    try {
      const res = await joinRoom(code, name.trim());
      setPrefs({ lastName: name.trim() });
      saveSession(res);
      onJoined();
    } catch (err) {
      const c = err instanceof ApiError ? err.code : 'network';
      setError(
        c === 'game-in-progress' ? t('join.inProgress') : c === 'room-full' ? t('join.full') : c === 'room-not-found' ? t('join.notFound') : t(`errors.${c}`),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center p-4">
      <Cover />
      <form onSubmit={submit} className="panel w-full max-w-md p-6" data-testid="room-join-form">
        <h1 className="mb-1 text-3xl font-semibold text-leaf-700">{t('join.title', { code })}</h1>
        {info === 'missing' ? (
          <p className="mb-4 text-sambal-600">{t('join.notFound')}</p>
        ) : info && info.status !== 'lobby' ? (
          <p className="mb-4 text-sambal-600">{t('join.inProgress')}</p>
        ) : info ? (
          <p className="mb-4 text-sm text-kopi-700">
            {t(`home.${info.mode === 'classic-base' ? 'modeBase' : info.mode === 'classic-rendang' ? 'modeRendang' : 'modeCustom'}`)} ·{' '}
            {info.players}/{info.maxPlayers}
          </p>
        ) : (
          <p className="mb-4 text-sm text-kopi-700">{t('common.loading')}</p>
        )}
        <label className="mb-1 block text-sm font-bold">{t('common.yourName')}</label>
        <input
          className="input mb-4"
          autoFocus
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('common.namePlaceholder')}
          data-testid="room-join-name"
        />
        {error && (
          <p role="alert" className="mb-3 font-semibold text-sambal-600">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => navigate('/')}>
            {t('common.back')}
          </button>
          <button className="btn-leaf flex-1" disabled={busy || info === 'missing'} data-testid="room-join-submit">
            {t('join.enter')}
          </button>
        </div>
      </form>
    </div>
  );
}
