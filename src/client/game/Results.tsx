import { RoomAvatar as Avatar } from './RoomAvatar';
import { GameCard } from '../../components/GameCard';
import { Modal } from '../../components/Modal';
import { t } from '../i18n';
import type { TableInfo } from './helpers';

export function Results({
  info,
  isHost,
  onRematch,
  onLobby,
  onClose,
}: {
  info: TableInfo;
  isHost: boolean;
  onRematch: () => void;
  onLobby: () => void;
  onClose: () => void;
}) {
  const r = info.v.result!;
  const youWon = r.winnerIds.includes(info.v.youId ?? '');
  const headline = youWon
    ? t('results.you')
    : r.winnerIds.length === 1
      ? t('results.winner', { name: info.name(r.winnerIds[0]) })
      : t('results.winners');
  const sorted = [...r.standings].sort((a, b) => b.packs - a.packs || b.cards - a.cards);
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={t('results.title')}
      testId="results"
      footer={
        isHost ? (
          <>
            <button className="btn-ghost" onClick={onLobby} data-testid="back-to-lobby">
              {t('results.lobby')}
            </button>
            <button className="btn-gold" onClick={onRematch} data-testid="rematch">
              {t('results.rematch')}
            </button>
          </>
        ) : (
          <p className="text-sm text-kopi-700">{t('results.waitHost')}</p>
        )
      }
    >
      <div className="mb-4 text-center">
        <div className="mx-auto mb-2 flex animate-float justify-center">
          <GameCard kind="nasiLemak" size="md" packs={2} />
        </div>
        <h2 className="break-words font-display text-3xl font-bold text-sambal-600" data-testid="winner-headline">
          {headline}
        </h2>
        <p className="text-sm text-kopi-700">{t(`results.reason.${r.reason}`)}</p>
      </div>
      <h3 className="mb-2 font-semibold">{t('results.standings')}</h3>
      <ol className="space-y-2">
        {sorted.map((s, i) => {
          const values = r.revealed[s.playerId] ?? [];
          const player = info.v.players.find((p) => p.id === s.playerId);
          const winner = r.winnerIds.includes(s.playerId);
          return (
            <li
              key={s.playerId}
              data-testid="standing"
              className={`standing-row grid items-center gap-2 rounded-2xl px-3 py-2 ${winner ? 'bg-kunyit-300/50' : 'bg-santan-100'}`}
            >
              <span className="w-5 font-display text-lg font-bold">{i + 1}</span>
              <Avatar id={s.playerId} name={info.name(s.playerId)} size={30} />
              <span className="min-w-0 break-words font-bold">{info.name(s.playerId)}</span>
              <div className="standing-cards flex flex-wrap gap-1">
                {player?.nasiLemak.map((nl, j) => (
                  <GameCard key={nl.id} kind="nasiLemak" size="xs" packs={values[j]} fly={nl.hasFly} />
                ))}
              </div>
              <span className="font-display text-xl font-semibold" data-testid="standing-packs">
                {s.packs}
              </span>
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}
