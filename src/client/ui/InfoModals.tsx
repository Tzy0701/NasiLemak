import { useState } from 'react';
import { AvatarPicker } from '../../components/AvatarPicker';
import { ALL_CARD_KINDS } from '../../game/cards/catalog';
import { OFFICIAL_BASE, OFFICIAL_RENDANG } from '../../game/rules/config';
import { GameCard } from '../../components/GameCard';
import { Modal } from '../../components/Modal';
import type { ArtKind } from '../../components/art/CardArt';
import { AVAILABLE_LOCALES, t, tList } from '../i18n';
import { setPrefs, usePrefs } from '../prefs';

export function HowToPlayModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sections: [string, string][] = [
    ['howTo.goalTitle', 'howTo.goal'],
    ['howTo.setupTitle', 'howTo.setup'],
  ];
  return (
    <Modal open={open} onClose={onClose} title={t('howTo.title')} wide testId="how-to-play">
      <div className="space-y-4 text-[0.95rem] leading-relaxed">
        {sections.map(([h, b]) => (
          <section key={h}>
            <h3 className="mb-1 text-lg font-semibold text-leaf-700">{t(h)}</h3>
            <p>{t(b)}</p>
          </section>
        ))}
        <section>
          <h3 className="mb-1 text-lg font-semibold text-leaf-700">{t('howTo.turnTitle')}</h3>
          <p>{t('howTo.turn')}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {tList('howTo.moves').map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
        {(
          [
            ['howTo.endTitle', 'howTo.end'],
            ['howTo.rendangTitle', 'howTo.rendang'],
            ['howTo.onlineTitle', 'howTo.online'],
            ['howTo.notesTitle', 'howTo.notes'],
          ] as const
        ).map(([h, b]) => (
          <section key={h}>
            <h3 className="mb-1 text-lg font-semibold text-leaf-700">{t(h)}</h3>
            <p>{t(b)}</p>
          </section>
        ))}
      </div>
    </Modal>
  );
}

export function CardReferenceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [focus, setFocus] = useState<ArtKind | null>(null);
  const kinds: ArtKind[] = [...ALL_CARD_KINDS, 'crow', 'nasiLemak'];
  const count = (k: ArtKind): string => {
    const base = countIn(OFFICIAL_BASE, k);
    const ren = countIn(OFFICIAL_RENDANG, k);
    return `${base} / ${ren}`;
  };
  return (
    <Modal open={open} onClose={onClose} title={t('common.cards')} wide testId="card-reference">
      <p className="mb-3 text-sm text-kopi-700">{t('common.countsLegend')}</p>
      <div className="card-reference-grid grid">
        {kinds.map((k) => (
          <button key={k} className="flex flex-col items-center gap-1" onClick={() => setFocus(k)}>
            <GameCard kind={k} size="md" packs={k === 'nasiLemak' ? 2 : undefined} />
            <span className="text-xs font-bold text-kopi-700">×{count(k)}</span>
          </button>
        ))}
      </div>
      <Modal open={focus !== null} onClose={() => setFocus(null)} title={focus ? t(`cards.${focus}.name`) : ''}>
        {focus && (
          <div className="flex justify-center">
            <GameCard kind={focus} size="lg" packs={focus === 'nasiLemak' ? 2 : undefined} />
          </div>
        )}
      </Modal>
    </Modal>
  );
}

function countIn(c: typeof OFFICIAL_BASE, k: ArtKind): number {
  if (k === 'crow') return c.crows;
  if (k === 'nasiLemak') return c.nlOnePack + c.nlTwoPack;
  if (k === 'rendang') return c.rendang;
  if (k in c.ingredients) return c.ingredients[k as keyof typeof c.ingredients];
  if (k in c.actions) return c.actions[k as keyof typeof c.actions];
  return 0;
}

export function SettingsModal({ open, onClose, avatar, onAvatarChange }: { open: boolean; onClose: () => void; avatar?: number; onAvatarChange?: (avatar: number) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const choose = async (choice: number) => {
    setBusy(true);
    try { if (!onAvatarChange || await onAvatarChange(choice)) setPrefs({ avatar: choice }); }
    finally { setBusy(false); }
  };
  const prefs = usePrefs();
  return (
    <Modal open={open} onClose={onClose} title={t('settings.title')}>
      <div className="space-y-3">
        <p className="font-semibold">{t('common.avatarCount')}</p>
        <AvatarPicker value={onAvatarChange ? avatar : prefs.avatar} onChange={choose} disabled={busy} />
        <Toggle label={t('settings.sound')} value={prefs.sound} onChange={(v) => setPrefs({ sound: v })} />
        <Toggle label={t('settings.reducedMotion')} value={prefs.reducedMotion} onChange={(v) => setPrefs({ reducedMotion: v })} />
        <label className="flex items-center justify-between gap-3">
          <span className="font-semibold">{t('settings.language')}</span>
          <select className="input max-w-40" value={prefs.language} onChange={(e) => setPrefs({ language: e.target.value as 'en' | 'zh' })} data-testid="language-select">
            {AVAILABLE_LOCALES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="font-semibold">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition ${value ? 'bg-leaf-500' : 'bg-santan-300'}`}
      >
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${value ? 'left-7' : 'left-1'}`} />
      </button>
    </label>
  );
}
