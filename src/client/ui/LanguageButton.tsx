import { setPrefs, usePrefs } from '../prefs';
import { t } from '../i18n';

export function LanguageButton() {
  const { language } = usePrefs();
  return <button className="btn-ghost btn-sm language-button" aria-label={t('settings.language')}
    onClick={() => setPrefs({ language: language === 'en' ? 'zh' : 'en' })} data-testid="language-toggle">
    {language === 'en' ? '中文' : 'English'}
  </button>;
}
