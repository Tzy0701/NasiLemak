import { useMemo, useState } from 'react';
import { RoomAvatar as Avatar } from './RoomAvatar';
import { GameCard } from '../../components/GameCard';
import { Modal } from '../../components/Modal';
import { BASE_INGREDIENTS, type Card, type CardKind, isIngredient, isTradeable } from '../../game/cards/catalog';
import { RECIPE_SIZE } from '../../game/rules/config';
import { findRecipe, isValidRecipe } from '../../game/rules/engine';
import type { GameAction, KindCount } from '../../game/types';
import type { PlayerView } from '../../game/view';
import { t } from '../i18n';
import { type TableInfo, canMake, canTrade, kindName, playableReason, sortHand } from './helpers';

export type Flow =
  | { type: 'detail'; card: Card }
  | { type: 'make' }
  | { type: 'play'; card: Card }
  | { type: 'trade' }
  | { type: 'counter' }
  | { type: 'chase' }
  | { type: 'menu' }
  | { type: 'log' }
  | { type: 'endTurn' }
  | { type: 'confirmAbort' }
  | { type: 'confirmLeave' }
  | { type: 'how' }
  | { type: 'cards' }
  | { type: 'settings' };

type Act = (a: GameAction) => Promise<boolean>;

// ---------------------------------------------------------------------------

export function CardDetail({
  card,
  info,
  onClose,
  onPlay,
  onMake,
  onTrade,
}: {
  card: Card;
  info: TableInfo;
  onClose: () => void;
  onPlay: (c: Card) => void;
  onMake: () => void;
  onTrade: () => void;
}) {
  const playable = playableReason(info, card);
  const isAction = !isIngredient(card.kind);
  return (
    <Modal
      open
      onClose={onClose}
      title={kindName(card.kind)}
      testId="card-detail"
      footer={
        <>
          {isIngredient(card.kind) && canMake(info) && (
            <button className="btn-leaf" onClick={onMake}>
              {t('game.make')}
            </button>
          )}
          {isTradeable(card.kind) && canTrade(info) && (
            <button className="btn-gold" onClick={onTrade}>
              {t('game.trade')}
            </button>
          )}
          {isAction && (
            <button className="btn-primary" disabled={!playable} onClick={() => onPlay(card)} data-testid="play-this">
              {t('game.playThis')}
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col items-center gap-3">
        <GameCard kind={card.kind} size="lg" />
        {isAction && !info.myTurn && <p className="text-sm text-kopi-700">{t('game.notYourTurn')}</p>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

export function RecipePicker({
  info,
  size,
  exclude,
  onClose,
  onConfirm,
  title,
}: {
  info: TableInfo;
  size: number;
  exclude?: string;
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
  title: string;
}) {
  const ingredients = useMemo(() => sortHand(info.v.hand.filter((c) => isIngredient(c.kind) && c.id !== exclude)), [info.v.hand, exclude]);
  const [sel, setSel] = useState<string[]>(() => findRecipe(ingredients, size)?.map((c) => c.id) ?? []);
  const chosen = ingredients.filter((c) => sel.includes(c.id));
  const valid = isValidRecipe(chosen, size);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= size ? s : [...s, id]));
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      testId="recipe-picker"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-leaf" disabled={!valid} onClick={() => onConfirm(sel)} data-testid="confirm-recipe">
            {t('common.confirm')} ({chosen.length}/{size})
          </button>
        </>
      }
    >
      <p className="mb-1 font-semibold">{t('game.pickRecipe', { n: size })}</p>
      <p className="mb-3 text-sm text-kopi-700">{t('game.pickRecipeHint')}</p>
      <div className="flex flex-wrap gap-2">
        {ingredients.map((c) => (
          <GameCard key={c.id} kind={c.kind} size="sm" selected={sel.includes(c.id)} onClick={() => toggle(c.id)} testId="recipe-card" />
        ))}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function PlayerChoice({ players, onPick, testId }: { players: PlayerView[]; onPick: (p: PlayerView) => void; testId?: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" data-testid={testId}>
      {players.map((p) => (
        <button
          key={p.id}
          className="flex items-center gap-3 rounded-2xl border-2 border-santan-300 bg-white px-3 py-2 text-left hover:border-leaf-400"
          onClick={() => onPick(p)}
          data-testid="pick-player"
          data-player={p.name}
        >
          <Avatar id={p.id} name={p.name} size={32} />
          <span className="flex-1 truncate font-bold">{p.name}</span>
          <span className="text-xs text-kopi-700">{t('game.cardsInHand', { n: p.handCount })}</span>
        </button>
      ))}
    </div>
  );
}

function NlChoice({
  owners,
  filter,
  onPick,
}: {
  owners: PlayerView[];
  filter: (hasFly: boolean) => boolean;
  onPick: (owner: PlayerView, nlId: string) => void;
}) {
  return (
    <div className="space-y-3">
      {owners.map((p) => {
        const nls = p.nasiLemak.filter((n) => filter(n.hasFly));
        if (!nls.length) return null;
        return (
          <div key={p.id}>
            <div className="mb-1 flex items-center gap-2 text-sm font-bold">
              <Avatar id={p.id} name={p.name} size={24} /> {p.name}
            </div>
            <div className="flex flex-wrap gap-2">
              {nls.map((n) => (
                <GameCard key={n.id} kind="nasiLemak" size="sm" fly={n.hasFly} packs={n.packs} onClick={() => onPick(p, n.id)} testId="pick-nl" />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Collects the parameters an action card needs, then submits it. */
export function PlayCardFlow({ card, info, act, onClose }: { card: Card; info: TableInfo; act: Act; onClose: () => void }) {
  const { me, opponents, v } = info;
  const live = opponents.filter((o) => !o.gone);
  const [fanFrom, setFanFrom] = useState<string | null>(null);
  const submit = async (a: GameAction) => {
    if (await act(a)) onClose();
  };
  const title = kindName(card.kind);
  const cancel = (
    <button className="btn-ghost" onClick={onClose}>
      {t('common.cancel')}
    </button>
  );

  switch (card.kind) {
    case 'makcik':
      return (
        <RecipePicker
          info={info}
          size={v.config.makcikIngredients}
          exclude={card.id}
          title={title}
          onClose={onClose}
          onConfirm={(ids) => submit({ type: 'play', cardId: card.id, card: 'makcik', ingredientIds: ids })}
        />
      );
    case 'supplier':
      return (
        <Modal open onClose={onClose} title={title} footer={cancel} testId="flow-supplier">
          <p className="mb-3 font-semibold">{t('game.chooseIngredient')}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {BASE_INGREDIENTS.map((k) => (
              <button key={k} className="flex flex-col items-center gap-1" onClick={() => submit({ type: 'play', cardId: card.id, card: 'supplier', ingredient: k })} data-testid={`announce-${k}`}>
                <GameCard kind={k} size="sm" />
              </button>
            ))}
          </div>
        </Modal>
      );
    case 'thief':
    case 'wholesaler':
      return (
        <Modal
          open
          onClose={onClose}
          title={title}
          testId={`flow-${card.kind}`}
          footer={
            <>
              {cancel}
              <button className="btn-primary" onClick={() => submit({ type: 'play', cardId: card.id, card: card.kind as 'thief' })} data-testid="confirm-play">
                {t('game.playThis')}
              </button>
            </>
          }
        >
          <div className="flex justify-center">
            <GameCard kind={card.kind} size="lg" />
          </div>
        </Modal>
      );
    case 'officer':
      return (
        <Modal open onClose={onClose} title={title} footer={cancel} testId="flow-officer">
          <p className="mb-3 font-semibold">{t('game.chooseTarget')}</p>
          <PlayerChoice players={live} onPick={(p) => submit({ type: 'play', cardId: card.id, card: 'officer', targetId: p.id })} />
        </Modal>
      );
    case 'fly':
      return (
        <Modal open onClose={onClose} title={title} footer={cancel} testId="flow-fly">
          <p className="mb-3 font-semibold">{t('game.chooseNl')}</p>
          <NlChoice owners={live} filter={(f) => !f} onPick={(p, nlId) => submit({ type: 'play', cardId: card.id, card: 'fly', targetId: p.id, nlId })} />
        </Modal>
      );
    case 'swatter':
      return (
        <Modal open onClose={onClose} title={title} footer={cancel} testId="flow-swatter">
          <p className="mb-3 font-semibold">{t('game.chooseOwnFlied')}</p>
          {me && <NlChoice owners={[me]} filter={(f) => f} onPick={(_, nlId) => submit({ type: 'play', cardId: card.id, card: 'swatter', nlId })} />}
        </Modal>
      );
    case 'fan':
      return (
        <Modal open onClose={onClose} title={title} footer={cancel} testId="flow-fan">
          {!fanFrom ? (
            <>
              <p className="mb-3 font-semibold">{t('game.chooseOwnFlied')}</p>
              {me && <NlChoice owners={[me]} filter={(f) => f} onPick={(_, nlId) => setFanFrom(nlId)} />}
            </>
          ) : (
            <>
              <p className="mb-3 font-semibold">{t('game.chooseTargetNl')}</p>
              <NlChoice
                owners={live}
                filter={(f) => !f}
                onPick={(p, nlId) => submit({ type: 'play', cardId: card.id, card: 'fan', fromNlId: fanFrom, targetId: p.id, toNlId: nlId })}
              />
            </>
          )}
        </Modal>
      );
    case 'sioyen': {
      const holders = v.players.filter((p) => p.crow);
      return (
        <Modal open onClose={onClose} title={title} footer={cancel} testId="flow-sioyen">
          <p className="mb-3 font-semibold">{t('game.chooseCrow')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {holders.map((p) => (
              <button
                key={p.id}
                className="flex items-center gap-3 rounded-2xl border-2 border-santan-300 bg-white px-3 py-2 text-left hover:border-leaf-400"
                onClick={() => submit({ type: 'play', cardId: card.id, card: 'sioyen', crowId: p.crow!.id })}
                data-testid="pick-crow"
              >
                <GameCard kind="crow" size="xs" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{p.id === v.youId ? t('common.you') : p.name}</div>
                  <div className="text-xs text-kopi-700">{t('game.stash', { n: p.crow!.stashCount })}</div>
                </div>
              </button>
            ))}
          </div>
        </Modal>
      );
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------

export function ChaseCrowFlow({ info, act, onClose }: { info: TableInfo; act: Act; onClose: () => void }) {
  const { v, me, opponents } = info;
  const [cardId, setCardId] = useState<string | null>(null);
  const targets = opponents.filter((o) => !o.gone && !o.crow);
  const ingredients = sortHand(v.hand.filter((c) => isIngredient(c.kind)));
  return (
    <Modal
      open
      onClose={onClose}
      title={t('game.chaseTitle')}
      testId="flow-chase"
      footer={
        <button className="btn-ghost" onClick={onClose}>
          {t('common.cancel')}
        </button>
      }
    >
      <p className="mb-3 text-sm text-kopi-700">{t('game.chaseHint')}</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {ingredients.map((c) => (
          <GameCard key={c.id} kind={c.kind} size="sm" selected={cardId === c.id} onClick={() => setCardId(c.id)} testId="chase-card" />
        ))}
      </div>
      {cardId && me?.crow && (
        <>
          <p className="mb-2 font-semibold">{t('game.chooseTarget')}</p>
          <PlayerChoice
            players={targets}
            onPick={async (p) => {
              if (await act({ type: 'passCrow', crowId: me.crow!.id, cardId, targetId: p.id })) onClose();
            }}
          />
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------

export function OfficerTake({ info, act }: { info: TableInfo; act: Act }) {
  const pending = info.v.turn.pending!;
  const hand = sortHand(pending.targetHand ?? []);
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= pending.take ? [...s.slice(1), id] : [...s, id]));
  return (
    <Modal
      open
      required
      title={t('game.officerPick', { n: pending.take, name: info.name(pending.targetId) })}
      testId="officer-take"
      footer={
        <button className="btn-primary" disabled={sel.length !== pending.take} onClick={() => act({ type: 'officerTake', cardIds: sel })} data-testid="confirm-officer">
          {t('common.confirm')} ({sel.length}/{pending.take})
        </button>
      }
    >
      <div className="flex flex-wrap gap-2">
        {hand.map((c) => (
          <GameCard key={c.id} kind={c.kind} size="sm" selected={sel.includes(c.id)} onClick={() => toggle(c.id)} testId="officer-card" />
        ))}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

const TRADE_KINDS: CardKind[] = [...BASE_INGREDIENTS, 'rendang', 'swatter', 'fan'];

export function TradeComposer({
  info,
  act,
  onClose,
  counter,
}: {
  info: TableInfo;
  act: Act;
  onClose: () => void;
  counter?: boolean;
}) {
  const { v, opponents } = info;
  const trade = v.turn.trade;
  const fixedPartner = counter && trade ? (trade.proposerId === v.youId ? trade.targetId : trade.proposerId) : null;
  const [partner, setPartner] = useState<string | null>(fixedPartner);
  const [offer, setOffer] = useState<string[]>([]);
  const [want, setWant] = useState<KindCount>({});
  const mine = sortHand(v.hand.filter((c) => isTradeable(c.kind)));
  const kinds = TRADE_KINDS.filter((k) => k !== 'rendang' || v.config.rendang > 0);
  const wantTotal = Object.values(want).reduce((a, b) => a + (b ?? 0), 0);
  const ok = !!partner && offer.length > 0 && wantTotal > 0;
  const bump = (k: CardKind, d: number) => setWant((w) => ({ ...w, [k]: Math.max(0, Math.min(6, (w[k] ?? 0) + d)) }));

  const send = async () => {
    if (!partner) return;
    const clean = Object.fromEntries(Object.entries(want).filter(([, n]) => (n ?? 0) > 0)) as KindCount;
    const ok = counter && trade
      ? await act({ type: 'counterTrade', tradeId: trade.id, offerCardIds: offer, wantKinds: clean })
      : await act({ type: 'proposeTrade', targetId: partner, offerCardIds: offer, wantKinds: clean });
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={counter ? t('trade.counterTitle', { name: info.name(partner ?? '') }) : t('trade.title')}
      testId="trade-composer"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-gold" disabled={!ok} onClick={send} data-testid="send-trade">
            {t('trade.send')}
          </button>
        </>
      }
    >
      <p className="mb-3 text-xs text-kopi-700">{t('trade.hint')}</p>
      {!fixedPartner && (
        <>
          <h3 className="mb-2 font-semibold">{t('trade.with')}</h3>
          <div className="mb-4 flex flex-wrap gap-2">
            {opponents
              .filter((o) => !o.gone)
              .map((o) => (
                <button
                  key={o.id}
                  onClick={() => setPartner(o.id)}
                  data-testid="trade-partner"
                  data-player={o.name}
                  className={`flex items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 font-bold ${partner === o.id ? 'border-kunyit-400 bg-kunyit-300/40' : 'border-santan-300 bg-white'}`}
                >
                  <Avatar id={o.id} name={o.name} size={28} /> {o.name}
                </button>
              ))}
          </div>
        </>
      )}
      <h3 className="mb-2 font-semibold">{t('trade.offer')}</h3>
      <div className="mb-4 flex flex-wrap gap-2">
        {mine.length === 0 && <p className="text-sm text-kopi-700">{t('trade.tradeable')}</p>}
        {mine.map((c) => (
          <GameCard
            key={c.id}
            kind={c.kind}
            size="sm"
            selected={offer.includes(c.id)}
            onClick={() => setOffer((o) => (o.includes(c.id) ? o.filter((x) => x !== c.id) : [...o, c.id]))}
            testId="offer-card"
          />
        ))}
      </div>
      <h3 className="mb-2 font-semibold">{t('trade.want')}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {kinds.map((k) => (
          <div key={k} className="flex items-center gap-2 rounded-xl bg-white/80 p-1.5" data-testid={`want-${k}`}>
            <GameCard kind={k} size="xs" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold">{kindName(k)}</div>
              <div className="flex items-center gap-1">
                <button className="h-8 w-8 rounded-full bg-santan-200 font-bold" onClick={() => bump(k, -1)} aria-label={`${kindName(k)} -1`}>
                  −
                </button>
                <span className="w-5 text-center font-display font-semibold">{want[k] ?? 0}</span>
                <button className="h-8 w-8 rounded-full bg-santan-200 font-bold" onClick={() => bump(k, 1)} aria-label={`${kindName(k)} +1`} data-testid={`want-${k}-plus`}>
                  +
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** Shown to whoever must answer the current offer (target, or proposer after a counter). */
export function TradeResponse({ info, act, onCounter }: { info: TableInfo; act: Act; onCounter: () => void }) {
  const tr = info.v.turn.trade!;
  const offererName = info.name(tr.offererId);
  const wants = Object.entries(tr.wantKinds ?? {}) as [CardKind, number][];
  const affordable = wants.every(([k, n]) => info.v.hand.filter((c) => c.kind === k).length >= n);
  const isProposer = tr.proposerId === info.v.youId;
  return (
    <Modal open required wide title={t('trade.incoming', { name: offererName })} testId="trade-response">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 font-semibold text-leaf-700">{t('trade.theyGive', { name: offererName })}</h3>
          <div className="flex flex-wrap gap-2">
            {(tr.offerCards ?? []).map((c) => (
              <GameCard key={c.id} kind={c.kind} size="sm" />
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 font-semibold text-sambal-600">{t('trade.youGive')}</h3>
          <div className="flex flex-wrap gap-2">
            {wants.map(([k, n]) => (
              <div key={k} className="relative">
                <GameCard kind={k} size="sm" />
                <span className="absolute -right-2 -top-2 rounded-full bg-sambal-500 px-2 text-sm font-bold text-white">×{n}</span>
              </div>
            ))}
          </div>
          {!affordable && <p className="mt-2 text-sm font-semibold text-sambal-600">{t('trade.cantAfford')}</p>}
        </div>
      </div>
      <p className="mt-3 text-xs text-kopi-700">{t('trade.round', { n: tr.round })}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button className="btn-ghost" onClick={() => act({ type: 'respondTrade', tradeId: tr.id, response: 'reject' })} data-testid="reject-trade">
          {t('trade.reject')}
        </button>
        <button className="btn-gold" onClick={onCounter} disabled={tr.round >= 6} data-testid="counter-trade">
          {t('trade.counter')}
        </button>
        <button
          className="btn-leaf"
          disabled={!affordable}
          onClick={() => act({ type: 'respondTrade', tradeId: tr.id, response: 'accept' })}
          data-testid="accept-trade"
        >
          {t('trade.accept')}
        </button>
        {isProposer && (
          <button className="btn-ghost text-sambal-600" onClick={() => act({ type: 'cancelTrade', tradeId: tr.id })}>
            {t('trade.cancel')}
          </button>
        )}
      </div>
    </Modal>
  );
}

export { RECIPE_SIZE };
