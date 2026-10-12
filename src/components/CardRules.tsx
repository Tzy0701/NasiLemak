import { createContext, useContext } from 'react';
import type { ArtKind } from './art/CardArt';
import { OFFICIAL_BASE, type GameConfig } from '../game/rules/config';
import { t } from '../client/i18n';
export const CardRulesContext = createContext<GameConfig>(OFFICIAL_BASE);
export function useCardCopy(kind: ArtKind) {
  const config = useContext(CardRulesContext);
  const text = t(`cards.${kind}.text`, { n: config.makcikIngredients });
  return { text,
    short: t(`design.effects.${kind}`, { n: config.makcikIngredients }) };
}
