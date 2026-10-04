import { COST, DOOR_APRON, FOOTPRINT, LOT_H, LOT_W, ROAD_ROWS } from './balance';
import { DIRS, cellKey, fmtMoney, type Dir, type Door, type Rect, type Vec2, type World } from './world';

export const F_BUILDING = 1;
export const F_WALL = 2;
export const F_DOOR = 4;
export const F_RACK = 8;
export const F_STAGING = 16;
export const F_FLOOR_PALLET = 32;
export const F_CONSTRUCTION = 64;

export type Check = { ok: true; cost: number } | { ok: false; reason: string };
export type DoorCheck = { ok: true; cost: number; facing: Dir } | { ok: false; reason: string };
export type DemolishTarget = { kind: 'rack'; id: string } | { kind: 'door'; id: string } | { kind: 'staging'; key: string };
export type DemolishCheck =
  | { ok: true; refund: number; assetCost: number; target: DemolishTarget }
  | { ok: false; reason: string };

const fail = (reason: string) => ({ ok: false as const, reason });
const ALL_DIRS: Dir[] = ['N', 'S', 'E', 'W'];

export const inLot = (x: number, y: number) => x >= 0 && y >= 0 && x < LOT_W && y < LOT_H;
export const flagsAt = (w: World, x: number, y: number) => (inLot(x, y) ? w.grid[y * LOT_W + x] : 0);
export const add = (a: Vec2, b: Vec2, k = 1): Vec2 => ({ x: a.x + b.x * k, y: a.y + b.y * k });
export const manhattan = (a: Vec2, b: Vec2) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const cellOf = (p: Vec2): Vec2 => ({ x: Math.round(p.x), y: Math.round(p.y) });
const same = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;

export function forEachCell(r: Rect, fn: (x: number, y: number) => void): void {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) fn(x, y);
}

export function rebuildGrid(w: World): void {
  const g = w.grid;
  g.fill(0);
  for (const p of w.parts) {
    const f = p.readyAt <= w.minute ? F_BUILDING : F_CONSTRUCTION;
    forEachCell(p.rect, (x, y) => {
      if (inLot(x, y)) g[y * LOT_W + x] |= f;
    });
  }
  for (let y = 0; y < LOT_H; y++) {
    for (let x = 0; x < LOT_W; x++) {
      const i = y * LOT_W + x;
      if (!(g[i] & F_BUILDING)) continue;
      for (const d of ALL_DIRS) {
        const nx = x + DIRS[d].x;
        const ny = y + DIRS[d].y;
        if (!(inLot(nx, ny) && g[ny * LOT_W + nx] & F_BUILDING)) {
          g[i] |= F_WALL;
          break;
        }
      }
    }
  }
  const mark = (c: Vec2, f: number) => {
    if (inLot(c.x, c.y)) g[c.y * LOT_W + c.x] |= f;
  };
  for (const d of Object.values(w.doors)) mark(d.cell, F_DOOR);
  for (const r of Object.values(w.racks)) r.cells.forEach((c) => mark(c, F_RACK));
  for (const c of Object.values(w.staging)) mark(c, F_STAGING);
  for (const p of Object.values(w.pallets)) if (p.loc.kind === 'floor') mark(p.loc.cell, F_FLOOR_PALLET);
  w.gridVersion++;
}

export function isInterior(w: World, x: number, y: number): boolean {
  const f = flagsAt(w, x, y);
  return (f & F_BUILDING) !== 0 && (f & F_WALL) === 0;
}

export function isForkliftWalkable(w: World, x: number, y: number): boolean {
  const f = flagsAt(w, x, y);
  if (!(f & F_BUILDING)) return false;
  if (f & F_WALL && !(f & F_DOOR)) return false;
  return (f & (F_RACK | F_FLOOR_PALLET)) === 0;
}

export function isTruckWalkable(w: World, x: number, y: number): boolean {
  if (x < 0 || x >= LOT_W || y < 0 || y >= LOT_H + ROAD_ROWS) return false;
  return y >= LOT_H || (flagsAt(w, x, y) & (F_BUILDING | F_CONSTRUCTION)) === 0;
}

export function walkableNeighbors(w: World, c: Vec2): Vec2[] {
  return ALL_DIRS.map((d) => add(c, DIRS[d])).filter((n) => isForkliftWalkable(w, n.x, n.y));
}

export const doorInward = (d: Door): Vec2 => add(d.cell, DIRS[d.facing], -1);
export const isDoorInward = (w: World, c: Vec2) => Object.values(w.doors).some((d) => same(doorInward(d), c));

export function readyCellCount(w: World): number {
  return w.parts.filter((p) => p.readyAt <= w.minute).reduce((s, p) => s + p.rect.w * p.rect.h, 0);
}

export function sharedEdge(a: Rect, b: Rect): number {
  if (a.x + a.w === b.x || b.x + b.w === a.x) return Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  if (a.y + a.h === b.y || b.y + b.h === a.y) return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  return 0;
}

function bbox(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

export function validateFootprint(w: World, r: Rect): Check {
  if (r.w < 1 || r.h < 1) return fail('Drag out an area');
  if (r.x < 0 || r.y < 0 || r.x + r.w > LOT_W || r.y + r.h > LOT_H) return fail('Outside the lot');
  const long = Math.max(r.w, r.h);
  const short = Math.min(r.w, r.h);
  if (w.parts.length === 0) {
    if (short < FOOTPRINT.minShort || long < FOOTPRINT.minLong) return fail('Minimum size is 8×6');
    if (long > FOOTPRINT.maxLong || short > FOOTPRINT.maxShort) return fail('Maximum size is 36×24');
  } else {
    if (w.parts.some((p) => p.readyAt > w.minute)) return fail('Wait for construction to finish');
    if (short < FOOTPRINT.minExpansion) return fail('Expansion must be at least 2 cells wide');
    if (!w.parts.some((p) => sharedEdge(p.rect, r) >= FOOTPRINT.minSharedEdge)) return fail('Expansion must share a wall with your warehouse');
    const bb = bbox([...w.parts.map((p) => p.rect), r]);
    if (Math.max(bb.w, bb.h) > FOOTPRINT.maxLong || Math.min(bb.w, bb.h) > FOOTPRINT.maxShort) return fail('Warehouse would exceed 36×24');
  }
  let overlap = false;
  forEachCell(r, (x, y) => {
    if (flagsAt(w, x, y) & (F_BUILDING | F_CONSTRUCTION)) overlap = true;
  });
  if (overlap) return fail('Overlaps your warehouse');
  const inside = (c: Vec2) => c.x >= r.x && c.y >= r.y && c.x < r.x + r.w && c.y < r.y + r.h;
  for (const d of Object.values(w.doors)) {
    for (let k = 1; k <= DOOR_APRON; k++) if (inside(add(d.cell, DIRS[d.facing], k))) return fail('Blocks a dock apron');
  }
  const cost = r.w * r.h * COST.cell;
  if (cost > w.cash) return fail(`Need ${fmtMoney(cost)}`);
  return { ok: true, cost };
}

export function validateDoor(w: World, c: Vec2): DoorCheck {
  const f = flagsAt(w, c.x, c.y);
  if (!(f & F_WALL)) return fail('Doors go on a finished warehouse wall');
  if (f & F_DOOR) return fail('There is already a door here');
  const outs = ALL_DIRS.filter((d) => {
    const n = add(c, DIRS[d]);
    return !(flagsAt(w, n.x, n.y) & F_BUILDING);
  });
  if (outs.length !== 1) return fail('Doors can’t go on corners');
  const facing = outs[0];
  const inward = add(c, DIRS[facing], -1);
  if (!isInterior(w, inward.x, inward.y) || flagsAt(w, inward.x, inward.y) & (F_RACK | F_FLOOR_PALLET)) {
    return fail('The inside of the door must be clear');
  }
  const apron = new Set<string>();
  for (let k = 1; k <= DOOR_APRON; k++) {
    const a = add(c, DIRS[facing], k);
    if (!inLot(a.x, a.y) || flagsAt(w, a.x, a.y) & (F_BUILDING | F_CONSTRUCTION)) return fail('Needs 8 clear cells of yard outside');
    apron.add(cellKey(a));
  }
  for (const d of Object.values(w.doors)) {
    for (let k = 1; k <= DOOR_APRON; k++) if (apron.has(cellKey(add(d.cell, DIRS[d.facing], k)))) return fail('Overlaps another dock apron');
  }
  if (w.cash < COST.door) return fail(`Need ${fmtMoney(COST.door)}`);
  return { ok: true, cost: COST.door, facing };
}

export function rackCells(cell: Vec2, orient: 'h' | 'v'): [Vec2, Vec2] {
  return [{ ...cell }, orient === 'h' ? { x: cell.x + 1, y: cell.y } : { x: cell.x, y: cell.y + 1 }];
}

export function isConnected(w: World, newRackCells: Vec2[] = []): boolean {
  const extra = new Set(newRackCells.map(cellKey));
  const walk = (x: number, y: number) => isForkliftWalkable(w, x, y) && !extra.has(`${x},${y}`);
  const doors = Object.values(w.doors);
  let start: Vec2 | null = doors.length ? doors[0].cell : null;
  for (let y = 0; y < LOT_H && !start; y++) {
    for (let x = 0; x < LOT_W; x++) {
      if (walk(x, y)) {
        start = { x, y };
        break;
      }
    }
  }
  if (!start) return true;
  const seen = new Set<string>([cellKey(start)]);
  const queue: Vec2[] = [start];
  while (queue.length) {
    const c = queue.shift()!;
    for (const d of ALL_DIRS) {
      const n = add(c, DIRS[d]);
      const k = cellKey(n);
      if (!seen.has(k) && walk(n.x, n.y)) {
        seen.add(k);
        queue.push(n);
      }
    }
  }
  if (doors.some((d) => !seen.has(cellKey(d.cell)))) return false;
  const reachable = (c: Vec2) => ALL_DIRS.some((d) => seen.has(cellKey(add(c, DIRS[d]))));
  const allRackCells = [...Object.values(w.racks).flatMap((r) => r.cells), ...newRackCells];
  if (!allRackCells.every(reachable)) return false;
  // Floor pallets must stay reachable too, or they can never be moved again.
  for (let y = 0; y < LOT_H; y++) {
    for (let x = 0; x < LOT_W; x++) if (w.grid[y * LOT_W + x] & F_FLOOR_PALLET && !reachable({ x, y })) return false;
  }
  return Object.values(w.staging).every((c) => seen.has(cellKey(c)));
}

export function validateRack(w: World, cell: Vec2, orient: 'h' | 'v'): Check {
  const cells = rackCells(cell, orient);
  for (const c of cells) {
    if (!isInterior(w, c.x, c.y)) return fail('Racks go inside a finished warehouse');
    if (flagsAt(w, c.x, c.y) & (F_RACK | F_STAGING | F_FLOOR_PALLET)) return fail('That spot is occupied');
    if (isDoorInward(w, c)) return fail('Keep the cell inside a door clear');
    const blocker = Object.values(w.forklifts).some((f) => f.state !== 'parked' && same(cellOf(f.pos), c));
    if (blocker) return fail('A forklift is in the way');
  }
  if (!isConnected(w, cells)) return fail('That would block forklift access');
  if (w.cash < COST.rack) return fail(`Need ${fmtMoney(COST.rack)}`);
  return { ok: true, cost: COST.rack };
}

export function validateStaging(w: World, c: Vec2): Check {
  if (!isInterior(w, c.x, c.y)) return fail('Staging goes inside a finished warehouse');
  if (flagsAt(w, c.x, c.y) & (F_RACK | F_STAGING | F_FLOOR_PALLET)) return fail('That spot is occupied');
  if (w.cash < COST.staging) return fail(`Need ${fmtMoney(COST.staging)}`);
  return { ok: true, cost: COST.staging };
}

export function validateDemolish(w: World, c: Vec2): DemolishCheck {
  const rack = Object.values(w.racks).find((r) => r.cells.some((rc) => same(rc, c)));
  if (rack) {
    const busy = rack.slots.some((s, i) => s !== null || w.reservations[`r:${rack.id}:${i}`]);
    if (busy) return fail('Empty the rack first');
    return { ok: true, refund: COST.rack / 2, assetCost: COST.rack, target: { kind: 'rack', id: rack.id } };
  }
  const door = Object.values(w.doors).find((d) => same(d.cell, c));
  if (door) {
    if (door.truckId) return fail('A truck is using this door');
    return { ok: true, refund: COST.door / 2, assetCost: COST.door, target: { kind: 'door', id: door.id } };
  }
  const key = cellKey(c);
  if (w.staging[key]) {
    if (w.cellPallets[key] || w.reservations[`c:${key}`]) return fail('Clear the staging cell first');
    return { ok: true, refund: COST.staging / 2, assetCost: COST.staging, target: { kind: 'staging', key } };
  }
  return fail('Nothing to demolish here');
}

export function findSpawnCell(w: World): Vec2 | null {
  const taken = new Set(Object.values(w.forklifts).filter((f) => f.state !== 'parked').map((f) => cellKey(cellOf(f.pos))));
  const free = (c: Vec2) => isForkliftWalkable(w, c.x, c.y) && !(flagsAt(w, c.x, c.y) & F_DOOR) && !taken.has(cellKey(c));
  for (const d of Object.values(w.doors)) {
    const i = doorInward(d);
    if (free(i)) return i;
    for (const n of walkableNeighbors(w, i)) if (free(n)) return n;
  }
  for (let y = 0; y < LOT_H; y++) for (let x = 0; x < LOT_W; x++) if (free({ x, y })) return { x, y };
  return null;
}
