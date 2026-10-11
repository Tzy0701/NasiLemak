import { CardArt } from '../../components/art/CardArt';
import { ACTION_KINDS, BASE_INGREDIENTS } from '../../game/cards/catalog';
import { CUSTOM_BOUNDS, CUSTOM_PRESET_IDS } from '../../game/custom/customRules';
import type { GameConfig } from '../../game/rules/config';
import type { LobbyOp } from '../../shared/protocol';
import { t } from '../i18n';

interface Props {
  config: GameConfig;
  editable: boolean;
  problems: string[];
  onChange: (op: LobbyOp) => Promise<boolean>;
}

function Stepper({
  label,
  value,
  min,
  max,
  editable,
  onSet,
  art,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  editable: boolean;
  onSet: (v: number) => void;
  art?: Parameters<typeof CardArt>[0]['kind'];
  testId?: string;
}) {
  return (
    <div className="custom-stepper flex min-w-0 items-center gap-2 rounded-xl bg-white/70 px-2 py-1" data-testid={testId}>
      {art && <CardArt kind={art} className="h-8 w-8 shrink-0" />}
      <span className="min-w-0 flex-1 break-words text-sm font-semibold">{label}</span>
      {editable ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="h-9 w-9 rounded-full bg-santan-200 font-bold disabled:opacity-40"
            disabled={value <= min}
            onClick={() => onSet(value - 1)}
            aria-label={`${label} -1`}
          >
            −
          </button>
          <span className="w-8 text-center font-display text-lg font-semibold tabular-nums">{value}</span>
          <button
            type="button"
            className="h-9 w-9 rounded-full bg-santan-200 font-bold disabled:opacity-40"
            disabled={value >= max}
            onClick={() => onSet(value + 1)}
            aria-label={`${label} +1`}
          >
            +
          </button>
        </div>
      ) : (
        <span className="w-8 text-center font-display text-lg font-semibold tabular-nums">{value}</span>
      )}
    </div>
  );
}

export function CustomRulesEditor({ config, editable, problems, onChange }: Props) {
  const set = (patch: Partial<GameConfig>) => onChange({ op: 'setCustomConfig', config: { ...config, ...patch } });

  return (
    <div className="mt-4 space-y-4" data-testid="custom-editor">
      <div>
        <h3 className="mb-2 font-semibold">{t('custom.presets')}</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {CUSTOM_PRESET_IDS.map((p) => (
            <button
              key={p}
              disabled={!editable}
              onClick={() => onChange({ op: 'applyPreset', preset: p })}
              data-testid={`preset-${p}`}
              className="rounded-2xl border-2 border-santan-300 bg-santan-100 p-2 text-left enabled:hover:bg-white disabled:opacity-60"
            >
              <div className="font-display text-sm font-semibold">{t(`custom.preset.${p}`)}</div>
              <div className="text-xs text-kopi-700">{t(`custom.presetDesc.${p}`)}</div>
            </button>
          ))}
        </div>
      </div>

      {problems.length > 0 && (
        <ul className="rounded-2xl bg-sambal-500/10 p-3 text-sm font-semibold text-sambal-700" role="alert">
          {problems.map((p) => (
            <li key={p}>• {t(`custom.problems.${p}`)}</li>
          ))}
        </ul>
      )}

      <fieldset className="space-y-1.5">
        <legend className="mb-1 font-semibold">{t('custom.turn')}</legend>
        <Stepper label={t('custom.handSize')} value={config.handSize} {...CUSTOM_BOUNDS.handSize} editable={editable} onSet={(v) => set({ handSize: v })} />
        <Stepper label={t('custom.drawPerTurn')} value={config.drawPerTurn} {...CUSTOM_BOUNDS.drawPerTurn} editable={editable} onSet={(v) => set({ drawPerTurn: v })} />
        <Stepper label={t('custom.movesPerTurn')} value={config.movesPerTurn} {...CUSTOM_BOUNDS.movesPerTurn} editable={editable} onSet={(v) => set({ movesPerTurn: v })} />
        <Stepper
          label={t('custom.targetPacks')}
          value={config.targetPacks}
          {...CUSTOM_BOUNDS.targetPacks}
          editable={editable}
          onSet={(v) => set({ targetPacks: v })}
          testId="stepper-target"
        />
        <Stepper
          label={t('custom.firstTurnDrawReduction')}
          value={config.firstTurnDrawReduction}
          {...CUSTOM_BOUNDS.firstTurnDrawReduction}
          editable={editable}
          onSet={(v) => set({ firstTurnDrawReduction: v })}
        />
        <Stepper label={t('custom.makcik')} value={config.makcikIngredients} {...CUSTOM_BOUNDS.makcikIngredients} editable={editable} onSet={(v) => set({ makcikIngredients: v })} />
        <Stepper
          label={t('custom.timer')}
          value={config.turnTimerSec}
          min={0}
          max={CUSTOM_BOUNDS.turnTimerSec.max}
          editable={editable}
          onSet={(v) => {
            const cur = config.turnTimerSec;
            const next = v > cur ? (cur === 0 ? 30 : cur + 15) : cur <= 30 ? 0 : cur - 15;
            void set({ turnTimerSec: Math.min(CUSTOM_BOUNDS.turnTimerSec.max, next) });
          }}
        />
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="mb-1 font-semibold">{t('custom.ingredients')}</legend>
        {BASE_INGREDIENTS.map((k) => (
          <Stepper
            key={k}
            art={k}
            label={t(`cards.${k}.name`)}
            value={config.ingredients[k]}
            {...CUSTOM_BOUNDS.ingredient}
            editable={editable}
            onSet={(v) => set({ ingredients: { ...config.ingredients, [k]: v } })}
          />
        ))}
        <Stepper art="rendang" label={t('custom.rendang')} value={config.rendang} {...CUSTOM_BOUNDS.rendang} editable={editable} onSet={(v) => set({ rendang: v })} />
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="mb-1 font-semibold">{t('custom.actions')}</legend>
        {ACTION_KINDS.map((k) => (
          <Stepper
            key={k}
            art={k}
            label={t(`cards.${k}.name`)}
            value={config.actions[k]}
            {...CUSTOM_BOUNDS.action}
            editable={editable}
            onSet={(v) => set({ actions: { ...config.actions, [k]: v } })}
          />
        ))}
        <Stepper art="crow" label={t('custom.crows')} value={config.crows} {...CUSTOM_BOUNDS.crows} editable={editable} onSet={(v) => set({ crows: v })} />
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="mb-1 font-semibold">{t('custom.scoring')}</legend>
        <Stepper art="nasiLemak" label={t('custom.onePack')} value={config.nlOnePack} {...CUSTOM_BOUNDS.nlOnePack} editable={editable} onSet={(v) => set({ nlOnePack: v })} />
        <Stepper art="nasiLemak" label={t('custom.twoPack')} value={config.nlTwoPack} {...CUSTOM_BOUNDS.nlTwoPack} editable={editable} onSet={(v) => set({ nlTwoPack: v })} />
      </fieldset>
      <p className="text-xs text-kopi-700">{t('custom.lockedNote')}</p>
    </div>
  );
}
