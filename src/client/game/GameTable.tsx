import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { GameCard } from '../../components/GameCard';
import { LogIcon, MenuIcon } from '../../components/Icons';
import { Modal } from '../../components/Modal';
import { CardArt } from '../../components/art/CardArt';
import { RECIPE_SIZE } from '../../game/rules/config';
import type { GameAction } from '../../game/types';
import type { LobbyOp } from '../../shared/protocol';
import { t } from '../i18n';
import { useRoom } from '../pages/RoomPage';
import { play } from '../sound';
import { CardReferenceModal, HowToPlayModal, SettingsModal } from '../ui/InfoModals';
import { Toasts, pushError, pushToast } from '../ui/toast';
import { ChaseCrowFlow, CardDetail, type Flow, OfficerTake, PlayCardFlow, RecipePicker, TradeComposer, TradeResponse } from './Flows';
import { Results } from './Results';
import { CenterPiles, OpponentSeat } from './TablePieces';
import { canChaseCrow, canMake, canTrade, formatLog, kindName, sortHand, tableInfo, useMediaQuery } from './helpers';

function useCountdown(deadline: number | null): number | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
}

export function GameTable() {
  const { client, snap } = useRoom();
  const room = snap.room!;
  const v = snap.game!;
  const info = useMemo(() => tableInfo(v), [v]);
  const { me, myTurn, opponents } = info;
  const isHost = room.hostId === room.youId;
  const wide = useMediaQuery('(min-width: 1024px)');
  const roomy = useMediaQuery('(min-width: 640px)');
  const [flow, setFlow] = useState<Flow | null>(null);
  const [showResults, setShowResults] = useState(true);
  const countdown = useCountdown(v.turn.deadline);
  const members = useMemo(() => new Map(room.members.map((m) => [m.id, m])), [room.members]);

  const act = useCallback(
    async (a: GameAction) => {
      const res = await client.game(a);
      if (!res.ok) {
        pushError(res.error);
        play('error');
      } else play('card');
      return res.ok;
    },
    [client],
  );
  const lobby = useCallback(
    async (op: LobbyOp) => {
      const res = await client.lobby(op);
      if (!res.ok) pushError(res.error);
      return res.ok;
    },
    [client],
  );

  // --- event feedback: toasts + sounds for new log entries -----------------
  const lastSeq = useRef<number | null>(null);
  useEffect(() => {
    const maxSeq = v.log.length ? v.log[v.log.length - 1]!.seq : 0;
    if (lastSeq.current === null) {
      lastSeq.current = maxSeq;
      return;
    }
    const fresh = v.log.filter((e) => e.seq > lastSeq.current!);
    lastSeq.current = maxSeq;
    for (const e of fresh) {
      if (e.key === 'turn-start' && e.actor === v.youId) {
        pushToast(t('game.yourTurn'), 'turn');
        play('turn');
      } else if (e.key === 'make') {
        play('make');
        if (e.actor !== v.youId) pushToast(formatLog(e, info), 'info');
      } else if (e.key === 'make-private') {
        pushToast(formatLog(e, info), 'good');
      } else if (e.key === 'fly' && e.target === v.youId) {
        play('fly');
        pushToast(formatLog(e, info), 'error');
      } else if (
        (e.to && e.actor !== v.youId && e.key !== 'draw-private') ||
        (e.target === v.youId && ['officer', 'fan', 'crow-pass', 'sioyen', 'supplier-gave'].includes(e.key)) ||
        e.key === 'crow-arrives' ||
        e.key.startsWith('trade-') ||
        e.key.startsWith('game-over')
      ) {
        if (e.key.startsWith('trade-') && e.key !== 'trade-private') play('trade');
        if (!(e.key === 'trade-private' && e.actor === v.youId)) pushToast(formatLog(e, info), 'info');
      }
    }
    if (fresh.some((e) => e.key.startsWith('game-over'))) {
      setShowResults(true);
      play(v.result?.winnerIds.includes(v.youId ?? '') ? 'win' : 'make');
    }
  }, [v.log, v.youId, v.result, info]);

  // Close local flows when the turn moves on.
  useEffect(() => {
    if (!myTurn && flow && ['make', 'play', 'trade', 'chase', 'endTurn'].includes(flow.type)) setFlow(null);
  }, [myTurn, flow]);

  const hand = useMemo(() => sortHand(v.hand), [v.hand]);
  // Identical cards are stacked with a ×N badge so phones need less scrolling.
  const groups = useMemo(() => {
    const out: { card: (typeof hand)[number]; count: number; isNew: boolean }[] = [];
    for (const c of hand) {
      const last = out[out.length - 1];
      const fresh = v.turn.drawnIds.includes(c.id);
      if (last && last.card.kind === c.kind) {
        last.count++;
        last.isNew ||= fresh;
      } else out.push({ card: c, count: 1, isNew: fresh });
    }
    return out;
  }, [hand, v.turn.drawnIds]);
  const current = v.players.find((p) => p.id === v.turn.playerId);
  const currentMember = current ? members.get(current.id) : undefined;
  const tr = v.turn.trade;
  const pending = v.turn.pending;
  const iMustAnswerTrade = tr && tr.awaitingId === v.youId;
  const myPacks = me?.packs ?? 0;

  const endTurn = () => {
    if (v.turn.movesLeft > 0) setFlow({ type: 'endTurn' });
    else void act({ type: 'endTurn' });
  };

  const statusLine = v.status === 'finished'
    ? t('results.title')
    : myTurn
      ? `${t('game.yourTurn')} · ${t('game.movesLeft', { n: v.turn.movesLeft })}`
      : t('game.waitingFor', { name: current?.name ?? '?' });

  const logPanel = (
    <ol className="space-y-1 text-[0.82rem] leading-snug" data-testid="game-log">
      {[...v.log].reverse().map((e) => (
        <li key={e.seq} className={`rounded-lg px-2 py-1 ${e.to ? 'bg-kunyit-300/30' : e.key === 'turn-start' ? 'bg-leaf-100 font-bold' : 'bg-white/60'}`}>
          {formatLog(e, info)}
        </li>
      ))}
    </ol>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Toasts />
      {/* Top bar */}
      <header className="safe-top z-30 flex items-center gap-2 bg-leaf-800 px-3 pb-1.5 text-white shadow">
        <button className="rounded-xl p-2 hover:bg-white/10" onClick={() => setFlow({ type: 'menu' })} aria-label={t('game.menu')} data-testid="menu-button">
          <MenuIcon />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div
            className={`mx-auto inline-flex max-w-full items-center gap-2 truncate rounded-full px-3 py-1 font-display text-sm font-semibold sm:text-base ${
              myTurn ? 'animate-pulse-ring bg-kunyit-400 text-kopi-900' : 'bg-white/10'
            }`}
            data-testid="turn-banner"
          >
            {statusLine}
            {countdown !== null && v.status === 'playing' && <span className="rounded-full bg-kopi-900/20 px-2 text-xs">{t('game.deadline', { n: countdown })}</span>}
          </div>
        </div>
        <span className="hidden font-display text-sm tracking-widest text-leaf-100 sm:inline">{room.code}</span>
        {!wide && (
          <button className="rounded-xl p-2 hover:bg-white/10" onClick={() => setFlow({ type: 'log' })} aria-label={t('game.log')} data-testid="log-button">
            <LogIcon />
          </button>
        )}
      </header>

      <div className="flex min-h-0 min-w-0 flex-1">
        {/* Table */}
        <div className="table-felt flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Opponents */}
          <section
            className={`no-scrollbar flex gap-2 overflow-x-auto px-3 py-2 ${roomy ? 'flex-wrap justify-center' : ''}`}
            data-testid="opponents"
          >
            {opponents.map((p) => (
              <OpponentSeat key={p.id} p={p} member={members.get(p.id)} active={p.id === v.turn.playerId && v.status === 'playing'} compact={!roomy} />
            ))}
          </section>

          {/* Centre */}
          <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-3 py-2">
            <CenterPiles v={v} name={(id) => info.name(id)} />
            {currentMember && !currentMember.connected && !currentMember.isBot && v.status === 'playing' && (
              <div className="flex items-center gap-2 rounded-2xl bg-kopi-900/50 px-3 py-1.5 text-xs font-semibold text-white" data-testid="absent-banner">
                {t('game.absent', { name: current?.name ?? '?', n: room.afkSkipSec })}
                {isHost && (
                  <button className="btn-gold btn-sm" onClick={() => lobby({ op: 'skipTurn' })}>
                    {t('game.skipTurn')}
                  </button>
                )}
              </div>
            )}
            {tr && !iMustAnswerTrade && (
              <div className="flex items-center gap-2 rounded-2xl bg-kunyit-300 px-3 py-1.5 text-sm font-semibold text-kopi-900 shadow" data-testid="trade-banner">
                {tr.proposerId === v.youId || tr.targetId === v.youId
                  ? t('trade.waiting', { name: info.name(tr.awaitingId) })
                  : t('trade.othersTrading', { a: info.name(tr.proposerId), b: info.name(tr.targetId) })}
                {tr.proposerId === v.youId && (
                  <button className="btn-ghost btn-sm" onClick={() => act({ type: 'cancelTrade', tradeId: tr.id })} data-testid="cancel-trade">
                    {t('trade.cancel')}
                  </button>
                )}
              </div>
            )}
            {pending && pending.actorId !== v.youId && (
              <div className="rounded-2xl bg-kopi-900/50 px-3 py-1.5 text-xs font-semibold text-white">
                {t('game.officerWaiting', { name: info.name(pending.actorId), target: info.name(pending.targetId) })}
              </div>
            )}
          </section>

          {/* My area */}
          <section className="safe-bottom rounded-t-3xl bg-santan-100/95 px-2 pt-2 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.5)]" data-testid="my-area">
            <div className="flex items-center gap-2 px-1">
              {me && <Avatar id={me.id} name={me.name} size={30} ring={myTurn} />}
              <div className="min-w-0">
                <div className="truncate text-sm font-bold leading-tight">{me?.name}</div>
                <div className="text-xs text-kopi-700" data-testid="my-packs">
                  {t('common.packs', { n: myPacks })} / {v.config.length === 'short' ? v.config.targetPacks : '∞'}
                </div>
              </div>
              <div className="no-scrollbar flex flex-1 items-center gap-1 overflow-x-auto" data-testid="my-nasi-lemak">
                {me?.nasiLemak.map((nl) => (
                  <GameCard key={nl.id} kind="nasiLemak" size="xs" packs={nl.packs} fly={nl.hasFly} className="animate-pop" />
                ))}
              </div>
              {me?.crow && (
                <div className="flex items-center gap-1 rounded-full bg-kopi-900 py-0.5 pl-0.5 pr-2 text-xs font-bold text-white" title={t('game.crowBlocks')} data-testid="my-crow">
                  <CardArt kind="crow" className="h-7 w-7" />
                  {me.crow.stashCount}
                </div>
              )}
            </div>

            {/* Action bar */}
            {v.status === 'playing' && myTurn && (
              <div className="mt-2 flex items-start gap-2 px-1 pb-1" data-testid="action-bar">
                <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                  <button className="btn-leaf btn-sm" disabled={!canMake(info)} onClick={() => setFlow({ type: 'make' })} data-testid="action-make">
                    {t('game.make')}
                  </button>
                  <button className="btn-gold btn-sm" disabled={!canTrade(info)} onClick={() => setFlow({ type: 'trade' })} data-testid="action-trade">
                    {t('game.trade')}
                  </button>
                  {me?.crow && (
                    <button className="btn-ghost btn-sm" disabled={!canChaseCrow(info)} onClick={() => setFlow({ type: 'chase' })} data-testid="action-chase">
                      {t('game.chaseCrow')}
                    </button>
                  )}
                </div>
                <button className="btn-primary btn-sm shrink-0" disabled={!!pending} onClick={endTurn} data-testid="action-end-turn">
                  {t('game.endTurn')}
                </button>
              </div>
            )}
            {myTurn && me?.crow && <p className="px-1 text-xs font-semibold text-sambal-600">{t('game.crowBlocks')}</p>}

            {/* Hand */}
            <div className="no-scrollbar flex snap-x gap-1.5 overflow-x-auto px-1 pb-2 pt-3 sm:justify-center sm:gap-2" data-testid="hand">
              {hand.length === 0 && <p className="py-6 text-sm italic text-kopi-700">{t('game.noCards')}</p>}
              {groups.map(({ card: c, count, isNew }) => (
                <div key={c.id} className="relative snap-start" data-testid="hand-stack">
                  {count > 1 && (
                    <div className="absolute inset-0 translate-x-1.5 translate-y-1 rounded-2xl border-4 bg-santan-200" style={{ borderColor: 'rgba(0,0,0,0.15)' }} aria-hidden="true" />
                  )}
                  <GameCard
                    kind={c.kind}
                    size="md"
                    onClick={() => setFlow({ type: 'detail', card: c })}
                    className={isNew ? 'animate-deal' : ''}
                    testId="hand-card"
                    label={`${kindName(c.kind)}${count > 1 ? ` ×${count}` : ''}`}
                  />
                  {count > 1 && (
                    <span className="absolute -right-1 bottom-2 rounded-full bg-kopi-900 px-2 py-0.5 font-display text-sm font-bold text-white shadow" data-testid="stack-count">
                      ×{count}
                    </span>
                  )}
                  {isNew && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-sambal-500 px-1.5 text-[0.6rem] font-bold text-white shadow">NEW</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Desktop log column */}
        {wide && (
          <aside className="flex w-80 shrink-0 flex-col border-l border-santan-300 bg-santan-50">
            <h2 className="border-b border-santan-300 px-4 py-2 text-lg font-semibold">{t('game.log')}</h2>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">{logPanel}</div>
          </aside>
        )}
      </div>

      {/* Required server-driven prompts */}
      {pending && pending.actorId === v.youId && v.status === 'playing' && <OfficerTake info={info} act={act} />}
      {iMustAnswerTrade && v.status === 'playing' && flow?.type !== 'counter' && (
        <TradeResponse info={info} act={act} onCounter={() => setFlow({ type: 'counter' })} />
      )}

      {/* Local flows */}
      {flow?.type === 'detail' && (
        <CardDetail
          card={flow.card}
          info={info}
          onClose={() => setFlow(null)}
          onPlay={(c) => setFlow({ type: 'play', card: c })}
          onMake={() => setFlow({ type: 'make' })}
          onTrade={() => setFlow({ type: 'trade' })}
        />
      )}
      {flow?.type === 'make' && (
        <RecipePicker
          info={info}
          size={RECIPE_SIZE}
          title={t('game.make')}
          onClose={() => setFlow(null)}
          onConfirm={async (ids) => {
            if (await act({ type: 'make', cardIds: ids })) setFlow(null);
          }}
        />
      )}
      {flow?.type === 'play' && <PlayCardFlow card={flow.card} info={info} act={act} onClose={() => setFlow(null)} />}
      {flow?.type === 'trade' && <TradeComposer info={info} act={act} onClose={() => setFlow(null)} />}
      {flow?.type === 'counter' && tr && <TradeComposer info={info} act={act} counter onClose={() => setFlow(null)} />}
      {flow?.type === 'chase' && <ChaseCrowFlow info={info} act={act} onClose={() => setFlow(null)} />}
      {flow?.type === 'endTurn' && (
        <Modal
          open
          onClose={() => setFlow(null)}
          title={t('game.endTurn')}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setFlow(null)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary"
                data-testid="confirm-end-turn"
                onClick={async () => {
                  setFlow(null);
                  await act({ type: 'endTurn' });
                }}
              >
                {t('game.endTurn')}
              </button>
            </>
          }
        >
          {t('game.endTurnConfirm', { n: v.turn.movesLeft })}
        </Modal>
      )}
      {flow?.type === 'log' && (
        <Modal open onClose={() => setFlow(null)} title={t('game.log')}>
          {logPanel}
        </Modal>
      )}
      {flow?.type === 'menu' && (
        <Modal open onClose={() => setFlow(null)} title={t('game.menu')} testId="game-menu">
          <div className="grid gap-2">
            <button className="btn-ghost" onClick={() => setFlow({ type: 'how' })}>
              {t('common.howToPlay')}
            </button>
            <button className="btn-ghost" onClick={() => setFlow({ type: 'cards' })}>
              {t('common.cards')}
            </button>
            <button className="btn-ghost" onClick={() => setFlow({ type: 'settings' })}>
              {t('common.settings')}
            </button>
            {v.status === 'finished' && (
              <button className="btn-gold" onClick={() => (setShowResults(true), setFlow(null))}>
                {t('results.title')}
              </button>
            )}
            {isHost && v.status === 'playing' && (
              <button className="btn-ghost text-sambal-600" onClick={() => setFlow({ type: 'confirmAbort' })}>
                {t('game.abort')}
              </button>
            )}
            <button className="btn-ghost text-sambal-600" onClick={() => setFlow({ type: 'confirmLeave' })} data-testid="leave-game">
              {t('game.leaveGame')}
            </button>
          </div>
        </Modal>
      )}
      {flow?.type === 'confirmAbort' && (
        <Modal
          open
          onClose={() => setFlow(null)}
          title={t('game.abort')}
          footer={
            <button className="btn-primary" onClick={() => (setFlow(null), lobby({ op: 'abort' }))}>
              {t('common.confirm')}
            </button>
          }
        >
          {t('game.abortConfirm')}
        </Modal>
      )}
      {flow?.type === 'confirmLeave' && (
        <Modal
          open
          onClose={() => setFlow(null)}
          title={t('game.leaveGame')}
          footer={
            <button className="btn-primary" onClick={() => (setFlow(null), lobby({ op: 'leave' }))} data-testid="confirm-leave-game">
              {t('common.confirm')}
            </button>
          }
        >
          {t('game.leaveGameConfirm')}
        </Modal>
      )}
      <HowToPlayModal open={flow?.type === 'how'} onClose={() => setFlow(null)} />
      <CardReferenceModal open={flow?.type === 'cards'} onClose={() => setFlow(null)} />
      <SettingsModal open={flow?.type === 'settings'} onClose={() => setFlow(null)} />

      {v.status === 'finished' && showResults && (
        <Results
          info={info}
          isHost={isHost}
          onClose={() => setShowResults(false)}
          onRematch={() => lobby({ op: 'rematch' })}
          onLobby={() => lobby({ op: 'backToLobby' })}
        />
      )}
    </div>
  );
}
