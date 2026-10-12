import { GameCard } from '../../components/GameCard';
import { Modal } from '../../components/Modal';
import { CardArt } from '../../components/art/CardArt';
import { t } from '../i18n';
import type { TableInfo } from './helpers';
import { kindName } from './helpers';

export type Inspection = { type: 'player'; playerId: string; nlId?: string } | { type: 'pile'; pile: 'draw' | 'discard' | 'nasiLemak' | 'crow' };

export function TableInspector({ inspection, info, onClose }: { inspection: Inspection; info: TableInfo; onClose: () => void }) {
  const { v } = info;
  if (inspection.type === 'pile') {
    const { pile } = inspection;
    const data = {
      draw: { title: t('game.drawPile'), count: v.drawCount, kind: 'back', hint: t('game.drawHint') },
      discard: { title: t('game.discard'), count: v.discardCount, kind: v.discardTop?.kind ?? 'back', hint: t('game.discardHint') },
      nasiLemak: { title: t('game.nlPile'), count: v.nlPileCount, kind: 'nasiLemak', hint: t('game.nlHint') },
      crow: { title: t('game.crowPile'), count: v.crowPile.length, kind: 'crow', hint: t('game.crowHint') },
    } as const;
    const d = data[pile];
    return <Modal open onClose={onClose} title={t('game.inspectPile', { name: d.title })} testId="pile-details">
      <div className="flex justify-center"><GameCard kind={d.kind} size="lg" /></div>
      <p className="mt-4 text-center font-bold">{t('common.cardsCount', { n: d.count })}</p>
      <p className="mt-2 text-center">{d.hint}</p>
    </Modal>;
  }
  const p = v.players.find(p => p.id === inspection.playerId);
  if (!p) return null;
  const flies = p.nasiLemak.filter(n => n.hasFly).length;
  const cards = inspection.nlId ? p.nasiLemak.filter(n => n.id === inspection.nlId) : p.nasiLemak;
  const crowPanel = <section className="inspection-crow my-3 border-t border-santan-300 pt-3" data-testid="inspect-crow">
    {p.crow ? <>
      <div className="flex items-center gap-2"><CardArt kind="crow" className="h-12 w-12" /><div><h3 className="font-bold">{t('game.crowStash')}</h3><p>{t('game.stash', { n: p.crow.stashCount })}</p></div></div>
      <p className="my-2 text-sm">{t('game.crowBlocks')}</p>
      <div className="flex flex-wrap gap-2">{p.crow.stashKinds.map((kind, i) => <div key={i} className="flex items-center gap-1 rounded-lg bg-santan-200 px-2 py-1"><CardArt kind={kind} className="h-8 w-8" /><span className="text-sm">{kindName(kind)}</span></div>)}</div>
      {!p.crow.stashCount && <p className="text-sm">{t('game.noStash')}</p>}
    </> : <p className="text-sm text-kopi-700">{t('game.noCrow')}</p>}
  </section>;
  return <Modal open onClose={onClose} title={t('game.tableDetails', { name: p.name })} testId="table-details">
    <div className="inspection-summary">
      <div><span>{t('game.validPacks')}</span><strong data-testid="inspect-valid-packs">{p.packs ?? '？'}</strong></div>
      <div><span>{t('game.parcels', { n: p.nasiLemak.length })}</span><strong>{t('game.blockedParcels', { n: flies })}</strong></div>
    </div>
    {p.packs === undefined && <p className="mb-3 text-sm text-kopi-700" data-testid="hidden-score-hint">{t('game.hiddenPacks')}</p>}
    {p.crow && !inspection.nlId && crowPanel}
    <div className="space-y-3">
      {!cards.length && <p>{t('game.noNasiLemak')}</p>}
      {cards.map(nl => <div key={nl.id} className="inspect-parcel" data-testid="inspect-parcel">
        <GameCard kind="nasiLemak" size="sm" packs={nl.packs} fly={nl.hasFly} />
        <div className="min-w-0">
          <h3 className="font-bold">{t('game.parcelNumber', { n: p.nasiLemak.findIndex(n => n.id === nl.id) + 1 })}</h3>
          <p className="parcel-value" data-testid="inspect-card-value">{nl.packs === undefined ? t('game.parcelHidden') : t('game.parcelValue', { n: nl.packs })}</p>
          {nl.hasFly && <><p className="fly-status">{t('game.flyBlocked')}</p><p className="mt-1 text-sm">{t('game.removeFlyHint')}</p></>}
        </div>
      </div>)}
    </div>
    {(!p.crow || inspection.nlId) && crowPanel}
  </Modal>;
}
