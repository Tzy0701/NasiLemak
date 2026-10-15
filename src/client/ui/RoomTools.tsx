import { useEffect, useRef, useState, type CSSProperties } from 'react';
import QRCode from 'qrcode';
import { Modal } from '../../components/Modal';
import { ChatIcon } from '../../components/Icons';
import { Avatar } from '../../components/Avatar';
import { STICKERS, PHRASES, type SocialEvent, type TableScore } from '../../shared/social';
import { t } from '../i18n';
import { useRoom } from '../pages/RoomPage';
import { setPrefs, usePrefs } from '../prefs';
import './room-tools.css';

export function Sticker({ preset, size = 72 }: { preset: string; size?: number }) {
  const index = STICKERS.indexOf(preset as typeof STICKERS[number]);
  return <span role="img" aria-label={t(`extras.sticker.${preset}`)} className="reaction-sticker" style={{ width: size, height: size, backgroundPosition: `${(index % 3) * 50}% ${Math.floor(index / 3) * (100 / 3)}%` }} />;
}

export function TableScoreboard({ scores = [] }: { scores?: TableScore[] }) {
  const sorted = [...scores].sort((a, b) => b.wins - a.wins || b.packs - a.packs);
  return <section className="table-record" data-testid="table-record">
    <h3>{t('extras.scores')}</h3>
    {!sorted.length ? <p>{t('extras.emptyScores')}</p> : <div className="table-record-scroll"><table>
      <thead><tr><th>{t('extras.player')}</th><th>{t('extras.wins')}</th><th>{t('extras.games')}</th><th>{t('extras.packs')}</th><th>{t('extras.streak')}</th></tr></thead>
      <tbody>{sorted.map(score => <tr key={score.playerId}><td><span className="score-player"><Avatar id={score.playerId} name={score.name} avatar={score.avatar} size={28} /><span>{score.name}</span></span></td><td>{score.wins}</td><td>{score.games}</td><td>{score.packs}</td><td>{score.bestStreak}</td></tr>)}</tbody>
    </table></div>}
    <p className="table-record-hint">{t('extras.scoreHint')}</p>
  </section>;
}

export function RoomTools() {
  const { client, snap } = useRoom();
  const room = snap.room!;
  const prefs = usePrefs();
  const [tab, setTab] = useState<'social' | 'scores' | 'invite' | null>(null);
  const [target, setTarget] = useState(room.youId);
  const [qr, setQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const link = `${location.origin}/r/${room.code}`;
  useEffect(() => {
    if (tab !== 'invite') return;
    let cancelled = false;
    void QRCode.toDataURL(link, { width: 256, margin: 4, color: { dark: '#173b2c', light: '#fff9e9' } })
      .then(value => { if (!cancelled) setQr(value); }).catch(() => { if (!cancelled) setQrError(true); });
    return () => { cancelled = true; };
  }, [tab, link]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(0), Math.max(1, cooldown - Date.now()));
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function send(kind: 'sticker' | 'phrase', preset: string) {
    if (busy || cooldown > Date.now()) return;
    setBusy(true);
    const result = await client.social(kind, preset, room.members.some(m => m.id === target) ? target : room.youId);
    setBusy(false);
    if (result.ok) { setCooldown(Date.now() + 2000); setTab(null); setFeedback(''); }
    else setFeedback(result.error === 'social-rate-limited' ? t('extras.cooldown') : t(`errors.${result.error}`));
  }
  return <>
    <button className="table-icon-button room-tools-button" title={t('extras.tools')} aria-label={t('extras.tools')} onClick={() => setTab('social')} data-testid="room-tools"><ChatIcon /></button>
    {tab && <Modal open wide onClose={() => setTab(null)} title={t('extras.tools')} testId="room-tools-modal">
      <nav className="room-tool-tabs">{(['social', 'scores', 'invite'] as const).map(name => <button key={name} className={tab === name ? 'is-active' : ''} onClick={() => setTab(name)} data-testid={`tools-${name}`}>{t(`extras.${name}`)}</button>)}</nav>
      {tab === 'scores' && <TableScoreboard scores={room.tableScores} />}
      {tab === 'invite' && <div className="invite-qr"><p>{t('extras.scan')}</p>{qr && <img src={qr} width={256} height={256} alt={`${t('extras.scan')} ${room.code}`} data-testid="invite-qr" />}{qrError && <p>{t('extras.qrError')}</p>}<strong>{room.code}</strong><button className="btn-gold" onClick={() => { void navigator.clipboard.writeText(link).then(() => setFeedback(t('lobby.copied'))).catch(() => setFeedback(link)); }}>{t('lobby.copyLink')}</button><output>{feedback}</output></div>}
      {tab === 'social' && <div className="social-composer">
        <label className="social-target">{t('extras.target')}<select className="input" value={target} onChange={event => setTarget(event.target.value)} data-testid="social-target">{room.members.map(member => <option key={member.id} value={member.id}>{member.name}{member.id === room.youId ? ` (${t('common.you')})` : ''}</option>)}</select></label>
        <h3>{t('extras.stickers')}</h3><div className="sticker-picker">{STICKERS.map(preset => <button key={preset} disabled={busy || !!cooldown} onClick={() => { void send('sticker', preset); }} data-testid={`sticker-${preset}`}><Sticker preset={preset} /><span>{t(`extras.sticker.${preset}`)}</span></button>)}</div>
        <h3>{t('extras.phrases')}</h3><div className="phrase-picker">{PHRASES.map(preset => <button key={preset} disabled={busy || !!cooldown} onClick={() => { void send('phrase', preset); }} data-testid={`phrase-${preset}`}>{t(`extras.phrase.${preset}`)}</button>)}</div>
        <label className="social-mute"><input type="checkbox" checked={!!prefs.muteSocial} onChange={event => setPrefs({ muteSocial: event.target.checked })} data-testid="mute-social" />{t('extras.mute')}</label>
        {(feedback || cooldown > Date.now()) && <p role="status">{feedback || t('extras.cooldown')}</p>}
      </div>}
    </Modal>}
  </>;
}

interface Flight { event: SocialEvent; x: number; y: number; dx: number; dy: number }
export function SocialEffects() {
  const { snap } = useRoom();
  const prefs = usePrefs();
  const [flights, setFlights] = useState<Flight[]>([]);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (prefs.muteSocial) { for (const event of snap.social ?? []) seen.current.add(event.id); return; }
    function point(pid: string) {
      const element = document.querySelector(`[data-player-id="${CSS.escape(pid)}"]`);
      const box = element?.getBoundingClientRect();
      const index = snap.room!.members.findIndex(member => member.id === pid);
      return box ? { x: Math.min(innerWidth - 90, Math.max(45, box.x + box.width / 2)), y: Math.max(95, Math.min(innerHeight - 100, box.y + box.height / 2)) } : { x: 60 + ((index + 1) / (snap.room!.members.length + 1)) * (innerWidth - 150), y: Math.min(innerHeight * 0.45, 350) };
    }
    for (const event of snap.social ?? []) {
      if (seen.current.has(event.id)) continue;
      seen.current.add(event.id);
      if (Date.now() - event.at > 5000) continue;
      const from = point(event.senderId), to = point(event.targetId);
      setFlights(list => [...list, { event, ...from, dx: to.x - from.x, dy: to.y - from.y }].slice(-3));
    }
    if (seen.current.size > 100) seen.current = new Set((snap.social ?? []).map(event => event.id));
  }, [snap.social, snap.room, prefs.muteSocial]);
  useEffect(() => {
    if (!flights.length) return;
    const timer = setTimeout(() => setFlights(list => list.filter(flight => Date.now() - flight.event.at < 4200)), 800);
    return () => clearTimeout(timer);
  }, [flights]);
  if (prefs.muteSocial) return null;
  return <div className={`social-effects ${prefs.reducedMotion ? 'reduce-social' : ''}`} aria-live="polite">{flights.map(({ event, x, y, dx, dy }) => <div key={event.id} className="social-flight" style={{ left: x, top: y, '--flight-x': `${dx}px`, '--flight-y': `${dy}px` } as CSSProperties} data-testid="social-event">
    {event.kind === 'sticker' ? <Sticker preset={event.preset} size={90} /> : <span className="social-speech">{t(`extras.phrase.${event.preset}`)}</span>}
    <small>{snap.room?.members.find(m => m.id === event.senderId)?.name} → {snap.room?.members.find(m => m.id === event.targetId)?.name}</small>
  </div>)}</div>;
}
