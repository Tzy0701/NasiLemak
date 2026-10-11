import { createContext, useContext } from 'react';
import type { ArtKind } from './art/CardArt';
import { OFFICIAL_BASE, type GameConfig } from '../game/rules/config';
import { t } from '../client/i18n';
export const CardRulesContext = createContext<GameConfig>(OFFICIAL_BASE);
export function useCardCopy(kind: ArtKind) {
  const config = useContext(CardRulesContext);
  const text = t(`cards.${kind}.text`);
  return { text: kind === 'makcik' ? text.replace(/\b3\b/g, String(config.makcikIngredients)) : text,
    short: t(`design.effects.${kind}`, { n: config.makcikIngredients }) };
}
