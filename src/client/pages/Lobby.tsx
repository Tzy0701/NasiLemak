import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { GameCard } from '../../components/GameCard';
import { ChatIcon, CopyIcon, CrownIcon, DotIcon } from '../../components/Icons';
import { Modal } from '../../components/Modal';
import type { BotKind } from '../../game/bots/bots';
import { type GameConfig, type GameMode, OFFICIAL_BASE, OFFICIAL_RENDANG, deckSize } from '../../game/rules/config';
import type { LobbyOp } from '../../shared/protocol';
import { t } from '../i18n';
import { roomUrl } from '../router';
import { CardReferenceModal, HowToPlayModal, SettingsModal } from '../ui/InfoModals';
import { Toasts, pushError, pushToast } from '../ui/toast';
import { CustomRulesEditor } from './CustomRulesEditor';
import { useRoom } from './RoomPage';
import { navigate } from '../router';

const MODES: { id: GameMode; key: string; cfg?: GameConfig }[] = [
  { id: 'classic-base', key: 'modeBase', cfg: OFFICIAL_BASE },
  { id: 'classic-rendang', key: 'modeRendang', cfg: OFFICIAL_RENDANG },
  { id: 'custom', key: 'modeCustom' },
];

export function Lobby() {
  const { client, snap } = useRoom();
  const room = snap.room!;
  const me = room.members.find((m) => m.id === room.youId)!;
  const isHost = room.hostId === room.youId;
  const [modal, setModal] = useState<'how' | 'cards' | 'settings' | 'leave' | null>(null);
  const [copied, setCopied] = useState(false);
  const [botKind, setBotKind] = useState<BotKind>('collector');
  const url = roomUrl(room.code);

  const send = async (body: LobbyOp) => {
    const res = await client.lobby(body);
    if (!res.ok) pushError(res.error);
    return res.ok;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      pushToast(url, 'info', 6000);
    }
  };
  const shareText = t('lobby.shareText', { code: room.code, url });
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  const cfg = room.config;
  const n = room.members.length;
  const countOk = n >= cfg.minPlayers && n <= cfg.maxPlayers;
  const othersReady = room.members.every((m) => m.id === room.hostId || m.ready);
  const customOk = room.customProblems.length === 0;
  const canStart = isHost && countOk && othersReady && customOk;

  return (
    <div className="min-h-full pb-28">
      <Toasts />
      <header className="table-felt leaf-stripes px-4 pb-6 pt-4 text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <button className="font-display text-xl font-bold" onClick={() => navigate('/')}>
            Nasi Lemak <span className="text-kunyit-300">Online</span>
          </button>
          <div className="flex gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setModal('how')}>
              {t('common.howToPlay')}
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setModal('cards')}>
              {t('common.cards')}
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setModal('settings')}>
              {t('common.settings')}
            </button>
          </div>
        </div>
        <div className="mx-auto mt-4 max-w-5xl">
          <p className="text-sm uppercase tracking-widest text-leaf-100">{t('lobby.title')}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="rounded-2xl bg-white/15 px-4 py-1 font-display text-4xl font-bold tracking-[0.25em]" data-testid="room-code">
              {room.code}
            </span>
            <button className="btn-gold btn-sm" onClick={copy} data-testid="copy-link">
              <CopyIcon /> {copied ? t('lobby.copied') : t('lobby.copyLink')}
            </button>
            <a className="btn btn-sm bg-[#25d366] text-white shadow-[0_4px_0_#128c4a]" href={whatsapp} target="_blank" rel="noreferrer">
              <ChatIcon /> {t('lobby.share')}
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-4 px-4 pt-4 lg:grid-cols-[1fr_1.3fr]">
        <section className="panel p-4" data-testid="player-list">
          <h2 className="mb-3 text-xl font-semibold">{t('lobby.players', { n })}</h2>
          <ul className="space-y-2">
            {room.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-2xl bg-santan-100 px-3 py-2" data-testid="member">
                <Avatar id={m.id} name={m.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate font-bold">
                    {m.isHost && <CrownIcon />}
                    <span className="truncate">{m.name}</span>
                    {m.id === room.youId && <span className="chip bg-kunyit-300 text-kopi-900">{t('common.you')}</span>}
                    {m.isBot && <span className="chip bg-santan-300 text-kopi-800">{t('common.bot')}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-kopi-700">
                    <DotIcon on={m.connected} /> {m.connected ? t('common.online') : t('common.offline')}
                    {m.isHost ? (
                      <span className="chip bg-kunyit-300/70">{t('common.host')}</span>
                    ) : (
                      <span className={`chip ${m.ready ? 'bg-leaf-200 text-leaf-800' : 'bg-santan-300 text-kopi-700'}`} data-testid="ready-chip">
                        {m.ready ? t('common.ready') : t('common.notReady')}
                      </span>
                    )}
                  </div>
                </div>
                {isHost && m.id !== room.youId && (
                  <div className="flex shrink-0 gap-1">
                    {!m.isBot && (
                      <button className="btn-ghost btn-sm" onClick={() => send({ op: 'transferHost', playerId: m.id })}>
                        {t('lobby.makeHost')}
                      </button>
                    )}
                    <button
                      className="btn-ghost btn-sm text-sambal-600"
                      onClick={() => send(m.isBot ? { op: 'removeBot', playerId: m.id } : { op: 'kick', playerId: m.id })}
                    >
                      {m.isBot ? t('lobby.removeBot') : t('lobby.kick')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {isHost && n < 7 && (
            <div className="mt-3 flex gap-2">
              <select className="input !min-h-9 !py-1 !text-sm" value={botKind} onChange={(e) => setBotKind(e.target.value as BotKind)} data-testid="bot-kind">
                {(['collector', 'trader', 'aggressive', 'random'] as BotKind[]).map((b) => (
                  <option key={b} value={b}>
                    {t(`lobby.botKinds.${b}`)}
                  </option>
                ))}
              </select>
              <button className="btn-ghost btn-sm shrink-0" onClick={() => send({ op: 'addBot', bot: botKind })} data-testid="add-bot">
                + {t('lobby.addBot')}
              </button>
            </div>
          )}
        </section>

        <section className="panel p-4" data-testid="mode-panel">
          <h2 className="mb-3 text-xl font-semibold">{t('lobby.mode')}</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map((mode) => {
              const active = room.mode === mode.id;
              return (
                <button
                  key={mode.id}
                  disabled={!isHost}
                  onClick={() => send({ op: 'setMode', mode: mode.id })}
                  data-testid={`mode-${mode.id}`}
                  aria-pressed={active}
                  className={`rounded-2xl border-2 p-3 text-left transition disabled:cursor-default ${
                    active ? 'border-sambal-500 bg-white shadow' : 'border-santan-300 bg-santan-100 enabled:hover:bg-white'
                  }`}
                >
                  <div className="font-display font-semibold leading-tight">{t(`home.${mode.key}`)}</div>
                  <div className="mt-1 text-xs text-kopi-700">
                    {mode.cfg ? `${mode.cfg.minPlayers}–${mode.cfg.maxPlayers}` : '2–7'} players
                  </div>
                </button>
              );
            })}
          </div>

          <h3 className="mb-2 mt-4 font-semibold">{t('lobby.length')}</h3>
          <div className="grid grid-cols-2 gap-2">
            {(['short', 'long'] as const).map((len) => (
              <button
                key={len}
                disabled={!isHost}
                onClick={() => send({ op: 'setLength', length: len })}
                aria-pressed={room.length === len}
                data-testid={`length-${len}`}
                className={`rounded-2xl border-2 p-3 text-left disabled:cursor-default ${
                  room.length === len ? 'border-leaf-500 bg-white shadow' : 'border-santan-300 bg-santan-100'
                }`}
              >
                <div className="font-display font-semibold">{t(`lobby.${len}`)}</div>
                <div className="text-xs text-kopi-700">{t(`lobby.${len}Desc`, { n: cfg.targetPacks })}</div>
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-2xl bg-santan-100 p-3 text-sm">
            <div className="mb-2 flex -space-x-3">
              {(['nasi', 'telur', 'kacang', 'sambal', 'timun'] as const).map((k) => (
                <GameCard key={k} kind={k} size="xs" />
              ))}
              {cfg.rendang > 0 && <GameCard kind="rendang" size="xs" />}
              {cfg.crows > 0 && <GameCard kind="crow" size="xs" />}
              <GameCard kind="nasiLemak" size="xs" />
            </div>
            {t('lobby.deckSummary', {
              deck: deckSize(cfg),
              nl: cfg.nlOnePack + cfg.nlTwoPack,
              one: cfg.nlOnePack,
              two: cfg.nlTwoPack,
              crows: cfg.crows,
            })}
            {room.mode !== 'custom' && <div className="mt-1 font-semibold text-leaf-700">{t('lobby.officialLocked')}</div>}
          </div>
          {room.mode === 'custom' && <CustomRulesEditor config={room.config} editable={isHost} problems={room.customProblems} onChange={send} />}
        </section>
      </main>

      <footer className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-santan-300 bg-santan-50/95 px-4 pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <button className="btn-ghost btn-sm" onClick={() => setModal('leave')} data-testid="leave-room">
            {t('lobby.leave')}
          </button>
          <div className="flex flex-1 items-center justify-end gap-2">
            {isHost ? (
              <>
                <span className="hidden text-right text-xs text-kopi-700 sm:block">
                  {!countOk
                    ? t('lobby.needPlayers', { min: cfg.minPlayers, max: cfg.maxPlayers })
                    : !othersReady
                      ? t('lobby.needReady')
                      : !customOk
                        ? t('errors.custom-invalid')
                        : ''}
                </span>
                <button className="btn-primary min-w-40" disabled={!canStart} onClick={() => send({ op: 'start' })} data-testid="start-game">
                  {t('lobby.start')}
                </button>
              </>
            ) : (
              <>
                <span className="hidden text-xs text-kopi-700 sm:block">{t('lobby.waitingHost')}</span>
                <button
                  className={me.ready ? 'btn-ghost min-w-40' : 'btn-leaf min-w-40'}
                  onClick={() => send({ op: 'setReady', ready: !me.ready })}
                  data-testid="ready-toggle"
                >
                  {me.ready ? t('lobby.unready') : t('lobby.readyUp')}
                </button>
              </>
            )}
          </div>
        </div>
        {isHost && !canStart && (
          <p className="pb-1 text-center text-xs text-kopi-700 sm:hidden">
            {!countOk ? t('lobby.needPlayers', { min: cfg.minPlayers, max: cfg.maxPlayers }) : !othersReady ? t('lobby.needReady') : t('errors.custom-invalid')}
          </p>
        )}
      </footer>

      <HowToPlayModal open={modal === 'how'} onClose={() => setModal(null)} />
      <CardReferenceModal open={modal === 'cards'} onClose={() => setModal(null)} />
      <SettingsModal open={modal === 'settings'} onClose={() => setModal(null)} />
      <Modal
        open={modal === 'leave'}
        onClose={() => setModal(null)}
        title={t('lobby.leave')}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setModal(null)}>
              {t('common.cancel')}
            </button>
            <button className="btn-primary" onClick={() => send({ op: 'leave' })} data-testid="confirm-leave">
              {t('lobby.leave')}
            </button>
          </>
        }
      >
        {t('lobby.leaveConfirm')}
      </Modal>
    </div>
  );
}
