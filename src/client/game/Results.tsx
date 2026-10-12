import { RoomAvatar as Avatar } from './RoomAvatar';
import { GameCard } from '../../components/GameCard';
import { Modal } from '../../components/Modal';
import { t } from '../i18n';
import type { TableInfo } from './helpers';
import { CrownIcon } from '../../components/Icons';
import type { CSSProperties } from 'react';

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
  const champions = sorted.filter(s => r.winnerIds.includes(s.playerId));
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
      <div className={`victory-scene ${youWon ? 'you-won' : ''}`}>
        <div className="victory-confetti" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ '--i': i, '--x': `${(i * 37) % 100}%`, '--delay': `${(i % 7) * 85}ms` } as CSSProperties} />)}</div>
        <p className="victory-eyebrow">{t('results.celebration')}</p>
        <div className="victory-crown" aria-hidden="true"><CrownIcon /></div>
        <h2 className="victory-headline" data-testid="winner-headline">{headline}</h2>
        <div className="champion-gallery">
          {champions.map(s => <div className="champion" key={s.playerId} data-testid="champion">
            <div className="champion-portrait"><Avatar id={s.playerId} name={info.name(s.playerId)} size={88} /></div>
            <strong>{info.name(s.playerId)}</strong>
            <span className="champion-title">{t(champions.length > 1 ? 'results.sharedChampion' : 'results.champion')}</span>
            <span className="champion-score">{t('results.valid', { n: s.packs })}</span>
          </div>)}
        </div>
        <p className="victory-reason">{t(`results.reason.${r.reason}`)}</p>
      </div>
      <div className="mb-3"><h3 className="font-semibold">{t('results.standings')}</h3><p className="text-xs text-kopi-700">{t('results.revealed')}</p></div>
      <ol className="space-y-2">
        {sorted.map((s, i) => {
          const values = r.revealed[s.playerId] ?? [];
          const player = info.v.players.find((p) => p.id === s.playerId);
          const winner = r.winnerIds.includes(s.playerId);
          return (
            <li
              key={s.playerId}
              data-testid="standing"
              className={`standing-row grid items-center gap-2 rounded-2xl px-3 py-2 ${winner ? 'standing-winner' : 'bg-santan-100'}`}
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
                {s.packs}<small className="standing-unit">{t('results.packs')}</small>
              </span>
              <div className="standing-meta">{t('results.wrapped', { n: player?.nasiLemak.length ?? s.cards + s.fliedCards })} · {t('results.blocked', { n: s.fliedCards })}</div>
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}
