import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Settings2, Trophy, X } from 'lucide-react';
import type { BoardPayload, CardPayload } from '@shared/types';
import type { TrackedCard } from '@shared/readTracker';
import { OfficeLeaderboard, useOfficeUsage } from './Leaderboard';
import { stateFor, updatePlacements, type OfficePlacement } from './placement';
import { buildOfficeLayout, officeResidents } from './layout';
import { loadOfficePreferences, saveOfficePreferences, OFFICE_LAYOUTS, type OfficeLayout, type OfficePreferences } from './preferences';
import { Scene } from './Scene';
import './office.css';

function Leaderboard({ residents, onSelect }: { residents: CardPayload[]; onSelect(id: string): void }) {
  const { usage, pending, error } = useOfficeUsage(residents.map(c => c.session_id));
  return <OfficeLeaderboard residents={residents} usage={usage} pending={pending} error={error} onSelect={onSelect} />;
}

export default function Office({ board, onSelect, onBack, isRead, activeTerminalId = null, selectedId = null,
  reduceMotion = false, now = Date.now() }: {
  board: BoardPayload | null; onSelect: (id: string) => void; onBack?: () => void;
  isRead: (card: TrackedCard) => boolean; activeTerminalId?: string | null; selectedId?: string | null; reduceMotion?: boolean; now?: number;
}) {
  const [preferences, setPreferences] = useState(loadOfficePreferences);
  const [popover, setPopover] = useState<'settings' | 'leaderboard' | null>(null);
  const [aspect, setAspect] = useState(2);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const stage = useRef<HTMLDivElement>(null), popup = useRef<HTMLDivElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null), leaderboardButton = useRef<HTMLButtonElement>(null);
  const residents = useMemo(() => officeResidents(board ? ['running', 'attention', 'idle'].flatMap(key => board.columns[key as keyof typeof board.columns].cards) : []), [board]);
  const previous = useRef(new Map<string, OfficePlacement>());
  const placements = useMemo(() => updatePlacements(previous.current, residents, now), [residents, now]);
  useEffect(() => { previous.current = placements; }, [placements]);
  const world = useMemo(() => buildOfficeLayout(residents, placements, preferences.layout, aspect), [residents, placements, preferences.layout, aspect]);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setAspect(Math.round(width / height * 100) / 100);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReducedMotion(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!popover) return;
    const close = () => { setPopover(null); (popover === 'settings' ? settingsButton : leaderboardButton).current?.focus(); };
    const keyboard = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popup.current?.contains(target) && !settingsButton.current?.contains(target) && !leaderboardButton.current?.contains(target)) setPopover(null);
    };
    document.addEventListener('keydown', keyboard); document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', keyboard); document.removeEventListener('pointerdown', outside); };
  }, [popover]);
  const change = (next: Partial<OfficePreferences>) => {
    const value = { ...preferences, ...next }; setPreferences(value); saveOfficePreferences(value);
  };
  const counts = { working: 0, waiting: 0, resting: 0, unknown: 0, error: 0 };
  residents.forEach(c => counts[stateFor(c)]++);
  const quiet = reduceMotion || systemReducedMotion || !preferences.animate;
  return <section className={`office-page${quiet ? ' office-quiet' : ''}`} aria-label="Live agent office" data-testid="office-page" data-layout={preferences.layout}>
    <header className="office-toolbar">
      <h2>The office</h2>
      <div className="office-layout-tabs" role="group" aria-label="Office layout">{(Object.entries(OFFICE_LAYOUTS) as [OfficeLayout, string][]).map(([value, name]) =>
        <button key={value} type="button" aria-pressed={preferences.layout === value} onClick={() => change({ layout: value })}>{name}</button>)}</div>
      <select className="office-layout-picker" aria-label="Office layout" value={preferences.layout} onChange={e => change({ layout: e.target.value as OfficeLayout })}>
        {Object.entries(OFFICE_LAYOUTS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>
      <div className="office-toolbar-actions">
        <button ref={leaderboardButton} type="button" aria-label="Token usage leaderboard" title="Token usage leaderboard" aria-expanded={popover === 'leaderboard'} onClick={() => setPopover(p => p === 'leaderboard' ? null : 'leaderboard')}><Trophy size={15} /></button>
        <button ref={settingsButton} type="button" aria-label="Office settings" title="Office settings" aria-expanded={popover === 'settings'} onClick={() => setPopover(p => p === 'settings' ? null : 'settings')}><Settings2 size={15} /></button>
        {onBack && <button type="button" aria-label="Back to board" title="Back to board" onClick={onBack}><ArrowLeft size={15} /></button>}
      </div>
    </header>
    <div className="office-stage" ref={stage}>
      <Scene world={world} residents={residents} placements={placements} preferences={preferences} quiet={quiet} now={now}
        isRead={isRead} activeTerminalId={activeTerminalId} selectedId={selectedId} onSelect={onSelect} />
      {!board ? <div className="office-empty" role="status">Loading office…</div> : !residents.length ? <div className="office-empty"><h3>The office is quiet</h3><p>Open an OpenCode or Codex session to bring a coworker in.</p></div> : null}
    </div>
    <footer className="office-footer">
      <span className="office-count-working">{counts.working} working</span><span className="office-count-waiting">{counts.waiting} waiting</span><span>{counts.resting} resting</span>
      {counts.error > 0 && <span className="office-count-error">{counts.error} errors</span>}{counts.unknown > 0 && <span>{counts.unknown} unknown</span>}
      <label className="office-coworker-picker"><span className="sr-only">Find coworker</span><select aria-label="Find coworker" value={residents.some(c => c.session_id === selectedId) ? selectedId! : ''} onChange={e => { if (e.target.value) onSelect(e.target.value); }}>
        <option value="">{residents.length} coworkers · Find a task</option>{residents.map(c => <option value={c.session_id} key={c.session_id}>{c.parent_id ? '↳ ' : ''}{c.title} · {c.directory_name}</option>)}</select></label>
    </footer>
    {popover && <div ref={popup} className="office-popover" role="region" aria-label={popover === 'settings' ? 'Office display settings' : 'Office token usage'}>
      <button type="button" className="office-popover-close" aria-label="Close Office panel" onClick={() => { setPopover(null); (popover === 'settings' ? settingsButton : leaderboardButton).current?.focus(); }}><X size={14} /></button>
      {popover === 'settings' ? <><h3>Office display</h3>
        <label>Name tags<input type="checkbox" checked={preferences.labels} onChange={e => change({ labels: e.target.checked })} /></label>
        <label>Team connections<input type="checkbox" checked={preferences.links} onChange={e => change({ links: e.target.checked })} /></label>
        <label>Walking and animations<input type="checkbox" checked={preferences.animate} onChange={e => change({ animate: e.target.checked })} /></label>
        <p>{reduceMotion || systemReducedMotion ? 'Reduced motion is active in your app or system settings.' : 'The larger coworker leads its smaller helpers. Movement follows session activity.'}</p>
      </> : <Leaderboard residents={residents} onSelect={id => { setPopover(null); onSelect(id); }} />}
    </div>}
  </section>;
}
