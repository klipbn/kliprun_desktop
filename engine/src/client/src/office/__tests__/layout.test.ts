import { expect, test } from 'bun:test';
import type { CardPayload } from '../../../../shared/types';
import { buildOfficeLayout, routeBetween, officeResidents } from '../layout';
import { updatePlacements } from '../placement';
import { OFFICE_LAYOUTS, type OfficeLayout } from '../preferences';

function card(id: string, overrides: Partial<CardPayload> = {}): CardPayload {
  return { source: 'opencode', session_id: id, directory: '/work/app', directory_name: 'app', title: id,
    prompt_snippet: null, parent_id: null, agent: { name: 'build' }, column: 'running', stage: 'Thinking',
    stage_since: 1, running_since: 1, last_event_at: 1, reason: null, error: null, last_tool: null,
    message_count: 1, finished_at: null, tokens_total: null, model_ref: null, context: null, branch: null,
    mrs: [], subagent_count: 0, subagent_active: 0, subagent_errors: 0, subagent_error_notes: [], children: [], ...overrides };
}
const build = (cards: CardPayload[], plan: OfficeLayout = 'loft', aspect = 2) => buildOfficeLayout(cards, updatePlacements(new Map(), cards, 1000), plan, aspect);

test('families are kept together even when children sort before their parent; input order does not move desks', () => {
  const cards = [card('z-lead'), card('a-child', { parent_id: 'z-lead' }), card('m-other'), card('b-grandchild', { parent_id: 'a-child' })];
  for (const plan of Object.keys(OFFICE_LAYOUTS) as OfficeLayout[]) {
    const a = build(cards, plan), b = build([...cards].reverse(), plan);
    expect(a.spots.get('a-child')?.teamId).toBe('z-lead');
    expect(a.spots.get('b-grandchild')?.teamId).toBe('z-lead');
    expect(a.spots.get('z-lead')?.leader).toBe(true);
    expect(a.spots.get('a-child')?.parentId).toBe('z-lead');
    for (const c of cards) expect(a.spots.get(c.session_id)?.point).toEqual(b.spots.get(c.session_id)?.point);
    const first = a.spots.get('z-lead')!, child = a.spots.get('a-child')!;
    expect(Math.hypot(first.point.x - child.point.x, first.point.y - child.point.y)).toBeLessThan(260);
  }
});

test('mixed states follow observed placement without fabricating or duplicating a parent', () => {
  const cards = [card('lead'), card('child', { parent_id: 'lead', column: 'attention' }),
    card('rest', { column: 'idle' }), card('orphan', { parent_id: 'missing' })];
  const layout = build(cards);
  expect(layout.spots.size).toBe(4);
  expect(layout.spots.get('child')?.area).toBe('waiting');
  expect(layout.spots.get('child')?.parentId).toBe('lead');
  expect(layout.spots.get('rest')?.area).toBe('lounge');
  expect(layout.spots.has('missing')).toBe(false);
});

test('all live residents have separate bounded destinations in short, tall, and busy offices', () => {
  const cards = Array.from({ length: 45 }, (_, i) => card(String(i), {
    column: i % 5 === 0 ? 'attention' : i % 4 === 0 ? 'idle' : 'running',
    directory: `/work/project-${i % 3}`, directory_name: `project-${i % 3}`,
    parent_id: i > 0 && i < 6 ? '0' : null,
  }));
  for (const plan of Object.keys(OFFICE_LAYOUTS) as OfficeLayout[]) for (const aspect of [.8, 2, 5]) {
    const world = build(cards, plan, aspect), points = [...world.spots.values()].map(s => s.point);
    expect(points).toHaveLength(45);
    expect(new Set(points.map(p => `${p.x},${p.y}`)).size).toBe(45);
    for (const p of points) {
      expect(p.x).toBeGreaterThan(35); expect(p.x).toBeLessThan(world.width - 35);
      expect(p.y).toBeGreaterThan(90); expect(p.y).toBeLessThan(world.height - 30);
    }
  }
});

test('walk routes go around a solid desk instead of crossing it', () => {
  const world = { width: 400, height: 300, obstacles: [{ x: 150, y: 100, width: 100, height: 90 }] };
  const path = routeBetween({ x: 80, y: 150 }, { x: 320, y: 150 }, world);
  expect(path.length).toBeGreaterThan(2);
  expect(path.at(-1)).toEqual({ x: 320, y: 150 });
  for (const p of path) expect(p.x > 140 && p.x < 260 && p.y > 90 && p.y < 200).toBe(false);
});

test('flattening keeps each real session once and recovers the nested parent relationship', () => {
  const child = card('child'); const parent = card('parent', { children: [child] });
  const residents = officeResidents([parent, child]);
  expect(residents.map(c => c.session_id)).toEqual(['parent', 'child']);
  expect(residents[1].parent_id).toBe('parent');
  expect(child.parent_id).toBeNull();
});

test('every generated desk can be reached from the entrance without crossing furniture', () => {
  const cards = [card('lead'), card('child', { parent_id: 'lead' }), card('other'), card('waiting', { column: 'attention' }), card('idle', { column: 'idle' })];
  for (const plan of Object.keys(OFFICE_LAYOUTS) as OfficeLayout[]) for (const aspect of [.8, 2, 5]) {
    const world = build(cards, plan, aspect);
    for (const room of world.rooms) expect(room.x + room.width).toBeLessThanOrEqual(world.width - 20);
    for (const spot of world.spots.values()) {
      const path = routeBetween(world.entry, spot.point, world);
      expect(path.length).toBeGreaterThan(0);
      expect(path.at(-1)).toEqual(spot.point);
    }
  }
});
