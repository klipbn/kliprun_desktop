import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { CardPayload } from '@shared/types';
import type { TrackedCard } from '@shared/readTracker';
import { formatDuration } from '@shared/format';
import { colorFor, Mascot, modelName } from './appearance';
import { stateFor, type OfficePlacement } from './placement';
import { routeBetween, type OfficeWorld, type Point } from './layout';
import { klopikVariant, type KlopikSkin } from './skins';
import { Scenery } from './Scenery';
import type { OfficePreferences } from './preferences';

type Walker = { point: Point; target: Point; path: Point[]; returning: boolean; nextVisit: number; leaving: boolean; exited: boolean };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const labels = { working: 'Working', waiting: 'Waiting', resting: 'Idle', unknown: 'Status unknown', error: 'Error' };

export function Scene({ skin, world, residents, departures, onDeparture, placements, preferences, quiet, now, isRead, activeTerminalId, selectedId, onSelect }: {
  skin: KlopikSkin; world: OfficeWorld; residents: CardPayload[]; departures: Set<string>; onDeparture: (id: string) => void; placements: Map<string, OfficePlacement>; preferences: OfficePreferences;
  quiet: boolean; now: number; isRead: (card: TrackedCard) => boolean; activeTerminalId: string | null; selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const elements = useRef(new Map<string, SVGGElement>()), links = useRef(new Map<string, SVGPathElement>());
  const walkers = useRef(new Map<string, Walker>());
  const geometry = useRef(''), mounted = useRef(false), previousBounds = useRef({ width: world.width, height: world.height });
  const routing = useRef('');
  const [camera, setCamera] = useState({ zoom: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const current = useRef({ world, residents, quiet, departures, onDeparture });
  current.current = { world, residents, quiet, departures, onDeparture };
  const paint = () => {
    for (const [id, w] of walkers.current) {
      const element = elements.current.get(id);
      element?.setAttribute('transform', `translate(${w.point.x.toFixed(2)} ${w.point.y.toFixed(2)})`);
      if (element) { element.dataset.officeAction = w.exited ? 'exited' : w.path.length ? 'walking' : w.returning ? 'supervising' : 'settled'; element.dataset.x = w.point.x.toFixed(2); element.dataset.y = w.point.y.toFixed(2); }
    }
    for (const c of current.current.residents.filter(c => !current.current.departures.has(c.session_id))) {
      const child = walkers.current.get(c.session_id), parent = c.parent_id ? walkers.current.get(c.parent_id) : undefined;
      if (parent && child) links.current.get(c.session_id)?.setAttribute('d', `M${parent.point.x} ${parent.point.y + 5} Q${(parent.point.x + child.point.x) / 2} ${Math.min(parent.point.y, child.point.y) - 20} ${child.point.x} ${child.point.y + 5}`);
    }
  };
  useLayoutEffect(() => {
    const key = `${preferences.layout}:${world.width}:${world.height}`;
    const resized = geometry.current !== key;
    const routingKey = key + JSON.stringify(world.obstacles);
    const routesChanged = routing.current !== routingKey;
    for (const c of residents) {
      const leaving = departures.has(c.session_id), spot = world.spots.get(c.session_id)!;
      const target = leaving ? world.exit : spot.point;
      let w = walkers.current.get(c.session_id);
      if (!w) {
        const point = mounted.current && !quiet ? { ...world.entry } : { ...target };
        let path = routeBetween(point, target, world);
        const parent = c.parent_id ? world.spots.get(c.parent_id) : undefined;
        if (parent && mounted.current && !quiet) {
          const welcome = { x: parent.point.x + 42, y: parent.point.y + 38 };
          const first = routeBetween(point, welcome, world), second = routeBetween(welcome, target, world);
          if (first.length && second.length) path = [...first, ...second];
        }
        w = { point, target, path: distance(point, target) < 1 ? [] : path, returning: false, nextVisit: performance.now() + 12000, leaving, exited: false };
        walkers.current.set(c.session_id, w);
      } else if (leaving && !quiet) {
        if (resized) w.point = { x: Math.max(24, Math.min(world.width - 24, w.point.x * world.width / previousBounds.current.width)),
          y: Math.max(90, Math.min(world.height - 24, w.point.y * world.height / previousBounds.current.height)) };
        if (!w.leaving || routesChanged || distance(w.target, target) > 1) {
          w.path = routeBetween(w.point, target, world);
          // A changed floor plan can put the previous position inside furniture.
          if (!w.path.length && distance(w.point, target) > 1) { w.point = { ...spot.point }; w.path = routeBetween(w.point, target, world); }
          w.exited = false;
        }
        w.target = target; w.returning = false;
      } else if (w.leaving && !quiet) {
        w.target = target; w.path = routeBetween(w.point, target, world); w.returning = false; w.exited = false; w.nextVisit = performance.now() + 12000;
      } else if (resized || quiet) {
        w.point = { ...target }; w.target = target; w.path = []; w.returning = false;
      } else if (distance(w.target, target) > 1) {
        w.path = routeBetween(w.point, target, world); w.target = target; w.returning = false;
      }
      w.leaving = leaving;
      if (!leaving && stateFor(c) !== 'working' && w.returning) { w.path = routeBetween(w.point, target, world); w.returning = false; }
      if (quiet) { w.point = { ...target }; w.path = []; w.returning = false; }
    }
    const ids = new Set(residents.map(c => c.session_id));
    for (const id of walkers.current.keys()) if (!ids.has(id)) walkers.current.delete(id);
    mounted.current = true; geometry.current = key; routing.current = routingKey; previousBounds.current = { width: world.width, height: world.height }; paint();
  });
  useEffect(() => {
    if (quiet) return;
    let frame = 0, last = performance.now(), visit = 0;
    const tick = (time: number) => {
      const dt = Math.min(.05, (time - last) / 1000); last = time;
      if (!document.hidden) {
        const { world, residents, departures, onDeparture } = current.current;
        const finished: string[] = [];
        for (const c of residents) {
          const w = walkers.current.get(c.session_id);
          if (!w || w.exited || (!w.leaving && document.activeElement === elements.current.get(c.session_id) && elements.current.get(c.session_id)?.matches(':focus-visible'))) continue;
          let travel = dt * (c.parent_id ? 115 : 95);
          while (w.path.length && travel > 0) {
            const next = w.path[0], d = distance(w.point, next);
            if (d <= travel) { w.point = next; w.path.shift(); travel -= d; }
            else { w.point = { x: w.point.x + (next.x - w.point.x) / d * travel, y: w.point.y + (next.y - w.point.y) / d * travel }; travel = 0; }
          }
          if (w.leaving) {
            if (!w.path.length && distance(w.point, world.exit) < 1) { w.exited = true; finished.push(c.session_id); }
            continue;
          }
          if (!w.path.length && w.returning && time > w.nextVisit) {
            w.path = routeBetween(w.point, w.target, world); w.returning = false; w.nextVisit = time + 15000;
          } else if (!w.path.length && !w.returning && time > w.nextVisit && stateFor(c) === 'working') {
            const children = residents.filter(child => !departures.has(child.session_id) && child.parent_id === c.session_id && stateFor(child) === 'working');
            const child = children[visit % children.length];
            if (child) {
              const spot = world.spots.get(child.session_id)!.point;
              w.path = routeBetween(w.point, { x: spot.x - 40, y: spot.y + 40 }, world);
              w.returning = w.path.length > 0; visit++;
            }
            w.nextVisit = time + (w.returning ? 6500 : 15000);
          }
        }
        paint();
        finished.forEach(onDeparture);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [quiet]);
  const viewWidth = world.width / camera.zoom, viewHeight = world.height / camera.zoom;
  const x = Math.max(0, Math.min(world.width - viewWidth, camera.x)), y = Math.max(0, Math.min(world.height - viewHeight, camera.y));
  const zoom = (value: number) => {
    const z = Math.max(1, Math.min(3, value));
    const point = selectedId ? walkers.current.get(selectedId)?.point : null;
    const center = point ?? { x: x + viewWidth / 2, y: y + viewHeight / 2 };
    setCamera({ zoom: z, x: center.x - world.width / z / 2, y: center.y - world.height / z / 2 });
  };
  return <div className={`office-scene${quiet ? ' office-quiet' : ''}${preferences.labels ? '' : ' office-hide-labels'}${preferences.links ? '' : ' office-hide-links'}`}>
    <svg ref={svg} className="office-world" viewBox={`${x} ${y} ${viewWidth} ${viewHeight}`} role="group" aria-label="Office floor" data-zoom={camera.zoom}
      onPointerDown={event => {
        if (camera.zoom === 1 || event.button !== 0 || (event.target as Element).closest('[data-session-id]')) return;
        drag.current = { x: event.clientX, y: event.clientY, cx: x, cy: y }; event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={event => {
        if (!drag.current) return;
        const bounds = event.currentTarget.getBoundingClientRect(), scale = Math.min(bounds.width / viewWidth, bounds.height / viewHeight);
        setCamera(c => ({ ...c, x: drag.current!.cx - (event.clientX - drag.current!.x) / scale, y: drag.current!.cy - (event.clientY - drag.current!.y) / scale }));
      }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <Scenery world={world} waiting={residents.filter(c => !departures.has(c.session_id) && stateFor(c) === 'waiting').length} />
      <g className="office-team-links" aria-hidden="true">{residents.filter(c => !departures.has(c.session_id) && c.parent_id && !departures.has(c.parent_id) && world.spots.has(c.parent_id)).map(c => <path key={c.session_id}
        ref={element => { if (element) links.current.set(c.session_id, element); else links.current.delete(c.session_id); }} />)}</g>
      {residents.map(card => {
        const leaving = departures.has(card.session_id);
        const spot = world.spots.get(card.session_id)!, placement = placements.get(card.session_id)!, state = stateFor(card);
        const unread = !leaving && placement.zone === 'lounge' && state === 'resting' && !isRead(card);
        const active = !leaving && card.session_id === activeTerminalId;
        const since = state === 'working' ? card.running_since : state === 'unknown' ? null : card.stage_since;
        const duration = since !== null && since > 0 && Number.isFinite(since) ? formatDuration(Math.max(0, now - since)) : null;
        const timer = leaving ? 'Leaving' : labels[state] + (duration ? ` · ${duration}` : state === 'unknown' ? '' : ' · —');
        const size = card.parent_id ? .66 : spot.leader ? 1.1 : .86;
        const title = `${card.title}\n${card.directory_name} · ${modelName(card)}${card.parent_id ? ' · Subagent' : spot.leader ? ' · Team lead' : ''}\n${card.stage} · ${timer}${card.error ? `\n${card.error}` : ''}${unread ? '\nNot viewed yet' : ''}`;
        return <g key={card.session_id} data-session-id={card.session_id} data-office-state={leaving ? 'leaving' : state} data-office-zone={placement.zone} data-office-unread={unread}
          data-office-area={leaving ? 'exit' : spot.area} data-office-parent={card.parent_id ?? undefined} data-office-leader={spot.leader || undefined} data-active-terminal={active || undefined}
          className={`office-resident office-${leaving ? 'leaving' : state}${unread ? ' office-unread' : ''}${active ? ' office-active-terminal' : ''}`}
          style={{ '--resident-color': colorFor(spot.teamId) } as CSSProperties}
          transform={`translate(${spot.point.x} ${spot.point.y})`} role="button" tabIndex={leaving ? -1 : 0} aria-disabled={leaving || undefined} aria-pressed={!leaving && card.session_id === selectedId}
          aria-label={`${card.title} — ${timer} — ${card.stage}${card.parent_id ? ' — Subagent' : ''}${unread ? ' — Not viewed yet' : ''}${active ? ' — Active terminal' : ''}`}
          ref={element => { if (element) elements.current.set(card.session_id, element); else elements.current.delete(card.session_id); }}
          onClick={() => { if (!leaving) onSelect(card.session_id); }} onKeyDown={event => { if (!leaving && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(card.session_id); } }}
          onFocus={() => { if (camera.zoom > 1) { const p = walkers.current.get(card.session_id)?.point ?? spot.point; setCamera(c => ({ ...c, x: p.x - viewWidth / 2, y: p.y - viewHeight / 2 })); } }}>
          <title>{title}</title>
          <ellipse cy="4" rx="40" ry="12" fill="#102820" opacity=".4" />
          <ellipse className="office-selection-ring" cy="4" rx="42" ry="13" />
          {!leaving && placement.zone === 'superwork' && <ellipse className="office-flow-ring" cy="4" rx="47" ry="17" />}
          <g transform={`scale(${size})`}><g transform="translate(-116 -114)"><Mascot skin={skin} variant={klopikVariant(card.session_id)} raised={!leaving && (state === 'waiting' || unread)} /></g></g>
          {spot.leader && <path d="m-10-69 3-6 6 5 6-9 5 10z" fill="#ead293" />}
          {!leaving && (state === 'waiting' || state === 'error' || state === 'unknown') && <g className="office-bubble" transform="translate(22 -65)">
            <path d="M0-15h25v22H10L4 13V7H0z" fill={state === 'error' ? '#ef9b95' : state === 'unknown' ? '#a1b1bd' : '#e8cc8d'} />
            <text x="12" y="1" textAnchor="middle" fill="#24342f" fontSize="18">{state === 'error' ? '!' : '?'}</text>
          </g>}
          {!leaving && state === 'resting' && !unread && <text className="office-zzz" x="24" y="-55" fill="#c4d4bc" fontSize="15">z z</text>}
          <g className="office-coworker-label" textAnchor="middle">
            <rect x="-69" y="17" width="138" height="37" rx="3" fill="#142731e8" stroke="#73918b55" />
            <text className="office-timer-session" y="30" fill="#edf3e9" fontSize="10">{card.title.length > 23 ? `${card.title.slice(0, 22)}…` : card.title}</text>
            <text className="office-timer" data-timer-state={leaving ? 'leaving' : state} y="43" fill="#bbcec4" fontSize="9">{timer}</text>
            <text className="office-model-label" y="66" fill="#c3d3c9" fontSize="8">{modelName(card)}{card.parent_id ? ' · Subagent' : ''}</text>
          </g>
          {active && <g className="office-terminal-badge" data-testid="office-active-terminal-badge"><rect x="-30" y="-89" width="60" height="16" rx="3" fill="#204c69" /><text x="0" y="-78" textAnchor="middle" fontSize="9" fill="#a9d4ff">›_ Terminal</text></g>}
          <rect x="-60" y="-75" width="120" height="130" fill="transparent" />
        </g>;
      })}
    </svg>
    <div className="office-camera" aria-label="Office camera"><button type="button" aria-label="Zoom out" onClick={() => zoom(camera.zoom - .4)}>−</button>
      <button type="button" onClick={() => setCamera({ zoom: 1, x: 0, y: 0 })}>Fit</button>
      <button type="button" aria-label="Zoom in" onClick={() => zoom(camera.zoom + .4)}>+</button></div>
  </div>;
}
