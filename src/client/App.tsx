import { useEffect } from 'react';
import { ArtDefs } from '../components/art/CardArt';
import { normaliseRoomCode } from '../shared/protocol';
import { HomePage } from './pages/HomePage';
import { RoomPage } from './pages/RoomPage';
import { usePrefs } from './prefs';
import { usePath } from './router';

export function App() {
  const path = usePath();
  const prefs = usePrefs();
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', prefs.reducedMotion);
  }, [prefs.reducedMotion]);

  const m = /^\/r\/([A-Za-z0-9]+)\/?$/.exec(path);
  return (
    <>
      <ArtDefs />
      {m ? <RoomPage key={m[1]} code={normaliseRoomCode(m[1]!)} /> : <HomePage />}
    </>
  );
}
