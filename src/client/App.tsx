import { useEffect } from 'react';
import { normaliseRoomCode } from '../shared/protocol';
import { HomePage } from './pages/HomePage';
import { RoomPage } from './pages/RoomPage';
import { usePrefs } from './prefs';
import { usePath } from './router';
import { t, useLocale } from './i18n';

export function App() {
  const path = usePath();
  const prefs = usePrefs();
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    document.title = t('app.title');
  }, [locale]);
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', prefs.reducedMotion);
  }, [prefs.reducedMotion]);

  const m = /^\/r\/([A-Za-z0-9]+)\/?$/.exec(path);
  return (
    <>
      {m ? <RoomPage key={m[1]} code={normaliseRoomCode(m[1]!)} /> : <HomePage />}
    </>
  );
}
