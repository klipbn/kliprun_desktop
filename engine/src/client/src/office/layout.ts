import type { CardPayload } from '@shared/types';
import type { OfficeArea, OfficePlacement } from './placement';
import type { OfficeLayout } from './preferences';

export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }
export interface Furniture extends Point { id: string; kind: 'desk' | 'bench' | 'sofa' | 'board' | 'plant' | 'coffee' | 'shelf'; width: number }
export interface OfficeSpot { point: Point; area: OfficeArea; teamId: string; parentId: string | null; leader: boolean }
export interface OfficeRoom extends Rect { id: string; label: string; kind: 'work' | 'waiting' | 'lounge' }
export interface OfficeWorld {
  width: number; height: number; entry: Point; exit: Point; rooms: OfficeRoom[]; furniture: Furniture[]; obstacles: Rect[];
  spots: Map<string, OfficeSpot>;
}

export function officeResidents(cards: CardPayload[]): CardPayload[] {
  const seen = new Set<string>(), result: CardPayload[] = [];
  const visit = (items: CardPayload[], parent: string | null = null) => {
    for (const item of items) {
      if (seen.has(item.session_id)) continue;
      seen.add(item.session_id);
      const card = !item.parent_id && parent ? { ...item, parent_id: parent } : item;
      result.push(card); visit(card.children, card.session_id);
    }
  };
  visit(cards);
  return result;
}

export function buildOfficeLayout(cards: CardPayload[], placements: Map<string, OfficePlacement>, plan: OfficeLayout, aspect: number): OfficeWorld {
  const byId = new Map(cards.map(c => [c.session_id, c]));
  const parents = new Set(cards.map(c => c.parent_id).filter(Boolean));
  const root = (c: CardPayload) => {
    const seen = new Set([c.session_id]);
    while (c.parent_id && byId.has(c.parent_id) && !seen.has(c.parent_id)) {
      seen.add(c.parent_id); c = byId.get(c.parent_id)!;
    }
    return c;
  };
  // Sort families before assigning desks, never by the order of a server snapshot.
  const familySize = (c: CardPayload) => cards.filter(other => root(other).session_id === root(c).session_id).length;
  const sorted = [...cards].sort((a, b) => familySize(b) - familySize(a) || root(a).session_id.localeCompare(root(b).session_id)
    || Number(!!a.parent_id) - Number(!!b.parent_id) || a.session_id.localeCompare(b.session_id));
  const area = (c: CardPayload) => placements.get(c.session_id)?.area ?? 'work';
  const work = sorted.filter(c => area(c) === 'work' || area(c) === 'superwork');
  const waiting = sorted.filter(c => area(c) === 'waiting');
  const lounge = sorted.filter(c => area(c) === 'lounge');
  const ratio = Number.isFinite(aspect) && aspect > 0 ? Math.max(.6, Math.min(8, aspect)) : 2;
  const compact = ratio > 3;
  const width = Math.max(ratio < 1.4 ? 960 : 1200, compact ? ratio * 390 : 0);
  const margin = 36, gap = 30, top = 105;
  const world: OfficeWorld = { width, height: 0, entry: { x: 65, y: 0 }, exit: { x: width / 2, y: 0 }, rooms: [], furniture: [], obstacles: [], spots: new Map() };
  const workWidth = plan === 'studio' ? width * .57 : width * .64;
  const sideWidth = width - workWidth - margin * 2 - gap * (plan === 'studio' ? 2 : 1);
  const workX = plan === 'studio' ? margin + sideWidth * .48 + gap : margin;
  const sideX = plan === 'studio' ? margin : margin + workWidth + gap;
  const groups = new Map<string, CardPayload[]>();
  if (plan === 'pods') {
    for (const c of work) {
      const key = root(c).directory;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
  } else groups.set('work', work);
  if (!groups.size) groups.set('work', []);
  const groupCols = plan === 'pods' && groups.size > 1 && workWidth > 650 ? 2 : 1;
  const groupWidth = (workWidth - gap * (groupCols - 1)) / groupCols;
  const capacity = (w: number) => Math.max(1, Math.floor((w - 34) / 140));
  const roomHeight = (count: number, w: number) => 60 + Math.max(1, Math.ceil(count / capacity(w))) * 160;
  const roomRows: Array<Array<[string, CardPayload[]]>> = [];
  [...groups].forEach((g, i) => { const row = Math.floor(i / groupCols); (roomRows[row] ??= []).push(g); });
  const rowHeights = roomRows.map(row => Math.max(...row.map(([, items]) => roomHeight(items.length, groupWidth))));
  const buildHeight = rowHeights.reduce((a, b) => a + b, 0) + gap * (rowHeights.length - 1);
  const sideWaitingWidth = compact || plan === 'studio' ? sideWidth * .48 : sideWidth;
  const sideLoungeWidth = compact || plan === 'studio' ? sideWidth * .52 : sideWidth;
  const waitingHeight = roomHeight(waiting.length, sideWaitingWidth), loungeHeight = roomHeight(lounge.length, sideLoungeWidth);
  const sideHeight = compact || plan === 'studio' ? Math.max(waitingHeight, loungeHeight) : waitingHeight + loungeHeight + gap;
  world.height = Math.max(top + Math.max(buildHeight, sideHeight) + 65, width / ratio);
  world.entry.y = world.height - 45;
  world.exit.y = world.height - 40;
  const addFurniture = (f: Furniture, obstacle?: Rect) => { world.furniture.push(f); if (obstacle) world.obstacles.push(obstacle); };
  const populate = (room: OfficeRoom, members: CardPayload[]) => {
    world.rooms.push(room);
    const cols = Math.min(capacity(room.width), Math.max(1, members.length)), spacing = (room.width - 30) / cols;
    const rows = Math.max(1, Math.ceil(members.length / cols));
    const rowSpacing = Math.min(160, (room.height - 45) / rows);
    const rowOffset = Math.max(0, (room.height - 45 - rowSpacing * rows) / 2);
    for (let i = 0; i < members.length; i++) {
      const c = members[i], column = i % cols, row = Math.floor(i / cols);
      const point = { x: room.x + 15 + spacing * (column + .5), y: room.y + 43 + rowOffset + rowSpacing * (row + .65) };
      world.spots.set(c.session_id, { point, area: area(c), teamId: root(c).session_id, parentId: c.parent_id,
        leader: parents.has(c.session_id) });
      if (room.kind === 'work' && plan !== 'studio' && plan !== 'pods') {
        addFurniture({ id: `desk:${c.session_id}`, kind: 'desk', ...point, width: 110 },
          { x: point.x - 58, y: point.y - 48, width: 116, height: 28 });
      }
    }
    if (room.kind === 'work' && plan !== 'loft') {
      for (let row = 0; row < Math.ceil(members.length / cols); row++) {
        const y = room.y + 43 + rowOffset + rowSpacing * (row + .65), count = Math.min(cols, members.length - row * cols);
        const x = room.x + 15 + spacing * .5 - 55, w = spacing * (count - 1) + 110;
        addFurniture({ id: `${room.id}:bench:${row}`, kind: 'bench', x, y, width: w }, { x: x - 4, y: y - 48, width: w + 8, height: 28 });
        for (let i = 0; i < count; i++) addFurniture({ id: `${room.id}:screen:${row}:${i}`, kind: 'desk', x: x + 55 + spacing * i, y, width: 0 });
      }
    }
    if (room.kind === 'waiting') {
      // The board sits against the back of the room; waiting coworkers occupy the clear floor in front.
      addFurniture({ id: room.id + ':board', kind: 'board', x: room.x + room.width / 2, y: room.y + 95, width: Math.min(160, room.width - 30) });
    }
    if (room.kind === 'lounge') {
      if (room.width > 250) addFurniture({ id: room.id + ':coffee', kind: 'coffee', x: room.x + room.width - 42, y: room.y + 90, width: 46 });
      for (let row = 0; row < Math.max(1, Math.ceil(members.length / cols)); row++) {
        const y = room.y + 43 + rowOffset + rowSpacing * (row + .65);
        addFurniture({ id: room.id + ':sofa:' + row, kind: 'sofa', x: room.x + room.width / 2, y, width: room.width - 36 });
      }
    }
  };
  let y = top;
  roomRows.forEach((row, i) => {
    const height = rowHeights[i] + (i === roomRows.length - 1 ? Math.max(0, world.height - 65 - top - buildHeight) : 0);
    row.forEach(([key, members], col) => populate({ id: `work:${key}`, kind: 'work', label: plan === 'pods' && members.length ? root(members[0]).directory_name : plan === 'studio' ? 'Build bench' : 'Build floor',
      x: workX + col * (groupWidth + gap), y, width: groupWidth, height }, members));
    y += height + gap;
  });
  if (compact || plan === 'studio') {
    populate({ id: 'waiting', kind: 'waiting', label: 'Meeting room', x: sideX, y: top, width: sideWaitingWidth, height: world.height - top - 65 }, waiting);
    populate({ id: 'lounge', kind: 'lounge', label: 'Coffee corner', x: plan === 'studio' ? workX + workWidth + gap : sideX + sideWaitingWidth + 12,
      y: top, width: sideLoungeWidth - (plan === 'studio' ? 0 : 12), height: world.height - top - 65 }, lounge);
  } else {
    const extra = Math.max(0, world.height - top - 65 - sideHeight) / 2;
    populate({ id: 'waiting', kind: 'waiting', label: 'Meeting room', x: sideX, y: top, width: sideWidth, height: waitingHeight + extra }, waiting);
    populate({ id: 'lounge', kind: 'lounge', label: 'Coffee corner', x: sideX, y: top + waitingHeight + extra + gap,
      width: sideWidth, height: loungeHeight + extra }, lounge);
  }
  addFurniture({ id: 'plant:left', kind: 'plant', x: 35, y: 145, width: 40 });
  addFurniture({ id: 'plant:right', kind: 'plant', x: width - 28, y: world.height - 85, width: 35 });
  return world;
}

export function routeBetween(from: Point, to: Point, world: Pick<OfficeWorld, 'width' | 'height' | 'obstacles'>): Point[] {
  const cell = 16, cols = Math.ceil(world.width / cell), rows = Math.ceil(world.height / cell);
  const walkable = (p: Point) => p.x >= 24 && p.x <= world.width - 24 && p.y >= 90 && p.y <= world.height - 24
    && !world.obstacles.some(o => p.x > o.x - 10 && p.x < o.x + o.width + 10 && p.y > o.y - 10 && p.y < o.y + o.height + 10);
  const nearest = (p: Point) => {
    let found: Point | null = null, distance = Infinity;
    for (let y = Math.max(6, Math.floor(p.y / cell) - 6); y < Math.min(rows, Math.floor(p.y / cell) + 7); y++)
      for (let x = Math.max(2, Math.floor(p.x / cell) - 6); x < Math.min(cols, Math.floor(p.x / cell) + 7); x++) {
        const q = { x: x * cell, y: y * cell }, d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
        if (d < distance && walkable(q)) { found = { x, y }; distance = d; }
      }
    return found;
  };
  const start = nearest(from), end = nearest(to);
  if (!start || !end || !walkable(to)) return [];
  const index = (p: Point) => p.y * cols + p.x;
  const queue = [start], previous = new Map<number, Point | null>([[index(start), null]]);
  let found = false;
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    if (p.x === end.x && p.y === end.y) { found = true; break; }
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (q.x < 0 || q.x >= cols || q.y < 0 || q.y >= rows || previous.has(index(q)) || !walkable({ x: q.x * cell, y: q.y * cell })) continue;
      previous.set(index(q), p); queue.push(q);
    }
  }
  if (!found) return [];
  const path: Point[] = [to];
  for (let p: Point | null = end; p; p = previous.get(index(p)) ?? null) path.push({ x: p.x * cell, y: p.y * cell });
  return path.reverse();
}
