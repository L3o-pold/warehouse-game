import { FORKLIFTS_PER_DOOR, FULL_ALERT_EVERY_MIN, LOT_H, LOT_W } from './balance';
import { cellOf, dockEdge, isForkliftWalkable, manhattan, safeToBlock, walkableNeighbors } from './grid';
import { isFloorSpot, isFreeStaging, releaseJob, reservationKey } from './pallets';
import { findPath } from './pathfinding';
import { PRODUCTS } from './products';
import { cellKey, pushEvent, type Forklift, type Job, type JobDest, type JobType, type Pallet, type PalletLoc, type ProductId, type Truck, type Vec2, type World } from './world';

export const jobIdFor = (palletId: string): string => `job-${palletId}`;
const walk = (w: World) => (x: number, y: number) => isForkliftWalkable(w, x, y);
const MAX_ATTEMPTS_PER_FORKLIFT = 12;
const ASSIGN_RETRY_MIN = 3;

export function locCell(w: World, loc: PalletLoc | JobDest): Vec2 | null {
  switch (loc.kind) {
    case 'truck': {
      const t = w.trucks[loc.truckId];
      const d = t?.doorId ? w.doors[t.doorId] : undefined;
      return d ? dockEdge(d.cell, d.facing) : null;
    }
    case 'rack': {
      const r = w.racks[loc.rackId];
      return r ? r.cells[loc.slot % 2] : null;
    }
    case 'staging':
    case 'floor':
      return loc.cell;
    case 'forklift': {
      const f = w.forklifts[loc.forkliftId];
      return f ? cellOf(f.pos) : null;
    }
  }
}

export function accessCells(w: World, loc: PalletLoc | JobDest): Vec2[] {
  const c = locCell(w, loc);
  if (!c || loc.kind === 'forklift') return [];
  if (loc.kind === 'truck' || loc.kind === 'staging') return [c];
  return walkableNeighbors(w, c);
}

function pendingLoads(w: World, truckId: string): number {
  let n = 0;
  for (const j of Object.values(w.jobs)) if (j.dest?.kind === 'truck' && j.dest.truckId === truckId) n++;
  return n;
}

export function outTruckWithRoom(w: World, contractId: string): Truck | null {
  for (const t of Object.values(w.trucks)) {
    if (t.kind === 'out' && t.state === 'docked' && t.contractId === contractId && t.palletIds.length + pendingLoads(w, t.id) < t.capacity) return t;
  }
  return null;
}

export function freeRackSlots(w: World, product: ProductId): { rackId: string; slot: number; cell: Vec2 }[] {
  const heavy = PRODUCTS[product].heavy;
  const out: { rackId: string; slot: number; cell: Vec2 }[] = [];
  for (const r of Object.values(w.racks)) {
    for (let s = 0; s < 4; s++) {
      if (heavy && s >= 2) continue;
      if (r.slots[s] === null && !w.reservations[`r:${r.id}:${s}`]) out.push({ rackId: r.id, slot: s, cell: r.cells[s % 2] });
    }
  }
  return out;
}

function nearest<T>(items: T[], at: (t: T) => Vec2, ref: Vec2): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const it of items) {
    const d = manhattan(at(it), ref);
    if (d < bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}


/**
 * Cache of overflow floor cells and which of them can be blocked safely. Building it scans the whole lot,
 * so it is rebuilt only when the grid or the doors change; reservations and forklift positions are checked at lookup.
 */
const floorCache = { world: null as World | null, gridVersion: -1, doors: -1, cells: [] as Vec2[], safe: new Set<number>() };

function floorCells(w: World): Vec2[] {
  const doors = Object.keys(w.doors).length;
  if (floorCache.world !== w || floorCache.gridVersion !== w.gridVersion || floorCache.doors !== doors) {
    const cells: Vec2[] = [];
    for (let y = 0; y < LOT_H; y++) {
      for (let x = 0; x < LOT_W; x++) {
        const c = { x, y };
        if (isFloorSpot(w, c) && walkableNeighbors(w, c).length > 0) cells.push(c);
      }
    }
    Object.assign(floorCache, { world: w, gridVersion: w.gridVersion, doors, cells, safe: new Set([...safeToBlock(w)].map((k) => { const [x, y] = k.split(',').map(Number); return y * LOT_W + x; })) });
  }
  return floorCache.cells;
}

function stagingOrFloor(w: World, ref: Vec2): JobDest | null {
  const s = nearest(Object.values(w.staging).filter((c) => isFreeStaging(w, c)), (c) => c, ref);
  if (s) return { kind: 'staging', cell: { ...s } };
  // Nearest first, but only cells that keep every door, rack, staging cell and floor pallet reachable.
  const cells = floorCells(w);
  const occupied = new Set<number>();
  for (const fl of Object.values(w.forklifts)) if (fl.state !== 'parked') occupied.add(Math.round(fl.pos.y) * LOT_W + Math.round(fl.pos.x));
  let f: Vec2 | null = null;
  let best = Infinity;
  for (const c of cells) {
    const d = manhattan(c, ref);
    if (d >= best) continue;
    const i = c.y * LOT_W + c.x;
    if (!floorCache.safe.has(i) || occupied.has(i) || w.reservations[`c:${c.x},${c.y}`]) continue;
    f = c;
    best = d;
  }
  return f ? { kind: 'floor', cell: { ...f } } : null;
}

interface JobCtx {
  freeNormal: boolean;
  freeHeavy: boolean;
  loadable: Set<string>;
}

function makeCtx(w: World): JobCtx {
  const loadable = new Set<string>();
  for (const t of Object.values(w.trucks)) if (t.kind === 'out' && t.state === 'docked' && t.palletIds.length < t.capacity) loadable.add(t.contractId);
  return { freeNormal: freeRackSlots(w, 'starters').length > 0, freeHeavy: freeRackSlots(w, 'playmats').length > 0, loadable };
}

export function desiredJobType(w: World, p: Pallet, ctx: JobCtx = makeCtx(w)): JobType | null {
  const c = w.contracts[p.contractId];
  if (!c || c.status !== 'active') return null;
  const loc = p.loc;
  if (loc.kind === 'forklift') return null;
  if (loc.kind === 'truck') {
    const t = w.trucks[loc.truckId];
    if (!t || t.kind !== 'in' || t.state !== 'docked') return null;
    return c.type === 'crossdock' ? 'CROSSDOCK' : 'UNLOAD';
  }
  if (ctx.loadable.has(c.id)) return 'LOAD';
  const hasSlot = PRODUCTS[p.product].heavy ? ctx.freeHeavy : ctx.freeNormal;
  if (c.type === 'storage' && (loc.kind === 'staging' || loc.kind === 'floor') && hasSlot) return 'PUTAWAY';
  return null;
}

export function generateJobs(w: World): void {
  for (const j of Object.values(w.jobs)) {
    if (!w.pallets[j.palletId]) {
      releaseJob(w, j);
      delete w.jobs[j.id];
    }
  }
  const ctx = makeCtx(w);
  let newWork = false;
  for (const p of Object.values(w.pallets)) {
    if (p.loc.kind === 'forklift') continue;
    const id = jobIdFor(p.id);
    const existing = w.jobs[id];
    if (existing?.forkliftId) continue;
    const type = desiredJobType(w, p, ctx);
    if (!type) {
      if (existing) delete w.jobs[id];
      continue;
    }
    if (existing) existing.type = type;
    else {
      w.jobs[id] = { id, type, palletId: p.id, forkliftId: null, dest: null, manual: false };
      newWork = true;
    }
  }
  // New work wakes forklifts that backed off after finding nothing to do.
  if (newWork) for (const f of Object.values(w.forklifts)) f.nextAssignAt = 0;
}

export function chooseDest(w: World, job: Job, p: Pallet): JobDest | null {
  const here = locCell(w, p.loc) ?? { x: 0, y: 0 };
  switch (job.type) {
    case 'UNLOAD': {
      const s = nearest(freeRackSlots(w, p.product), (x) => x.cell, here);
      if (s) return { kind: 'rack', rackId: s.rackId, slot: s.slot };
      return stagingOrFloor(w, here);
    }
    case 'PUTAWAY': {
      const s = nearest(freeRackSlots(w, p.product), (x) => x.cell, here);
      return s ? { kind: 'rack', rackId: s.rackId, slot: s.slot } : null;
    }
    case 'CROSSDOCK': {
      const t = outTruckWithRoom(w, p.contractId);
      if (t) return { kind: 'truck', truckId: t.id };
      const outDoor = nearest(Object.values(w.doors).filter((d) => d.kind === 'out'), (d) => d.cell, here);
      return stagingOrFloor(w, outDoor ? outDoor.cell : here);
    }
    case 'LOAD': {
      const t = outTruckWithRoom(w, p.contractId);
      return t ? { kind: 'truck', truckId: t.id } : null;
    }
  }
}

/** Door ids a job works at: the door its pallet is picked up from and/or the door it is delivered to. */
function jobDoors(w: World, p: Pallet, dest: JobDest | null): string[] {
  const out: string[] = [];
  if (p.loc.kind === 'truck') {
    const d = w.trucks[p.loc.truckId]?.doorId;
    if (d) out.push(d);
  }
  if (dest?.kind === 'truck') {
    const d = w.trucks[dest.truckId]?.doorId;
    if (d) out.push(d);
  }
  return out;
}

function doorLoad(w: World): Map<string, number> {
  const load = new Map<string, number>();
  for (const j of Object.values(w.jobs)) {
    const p = w.pallets[j.palletId];
    if (!j.forkliftId || !p) continue;
    // A carried pallet's loc is the forklift, so only its delivery door counts once it has been picked up.
    const doors = jobDoors(w, p, j.dest);
    for (const d of doors) load.set(d, (load.get(d) ?? 0) + 1);
  }
  return load;
}

export function assignJobTo(w: World, f: Forklift, job: Job, manual = false, load?: Map<string, number>): boolean {
  const p = w.pallets[job.palletId];
  if (!p) return false;
  if (load && jobDoors(w, p, null).some((d) => (load.get(d) ?? 0) >= FORKLIFTS_PER_DOOR)) return false;
  let dest = chooseDest(w, job, p);
  if (dest && load && jobDoors(w, p, dest).some((d) => (load.get(d) ?? 0) >= FORKLIFTS_PER_DOOR)) {
    // A cross-dock pallet can wait on staging/floor while the outbound door is busy; anything else must wait.
    if (job.type !== 'CROSSDOCK' || dest.kind !== 'truck') return false;
    const outDoor = w.trucks[dest.truckId]?.doorId;
    dest = stagingOrFloor(w, outDoor ? w.doors[outDoor].cell : (locCell(w, p.loc) ?? { x: 0, y: 0 }));
  }
  if (!dest) {
    if ((job.type === 'UNLOAD' || job.type === 'CROSSDOCK') && w.minute - w.lastFullAlert >= FULL_ALERT_EVERY_MIN) {
      w.lastFullAlert = w.minute;
      pushEvent(w, 'alert', 'Warehouse full — build racks or staging');
    }
    return false;
  }
  const goals = accessCells(w, p.loc);
  const path = findPath(cellOf(f.pos), goals, walk(w));
  if (!path) return false;
  job.forkliftId = f.id;
  job.dest = dest;
  job.manual = manual;
  const k = reservationKey(dest);
  if (k) w.reservations[k] = job.id;
  f.jobId = job.id;
  f.goals = goals;
  f.path = path;
  f.state = 'toPickup';
  f.waited = 0;
  if (load) for (const d of jobDoors(w, p, dest)) load.set(d, (load.get(d) ?? 0) + 1);
  return true;
}

function relatesToTruck(w: World, j: Job, truckId: string): boolean {
  const p = w.pallets[j.palletId];
  const t = w.trucks[truckId];
  if (!p || !t) return false;
  if (p.loc.kind === 'truck' && p.loc.truckId === truckId) return true;
  return t.kind === 'out' && p.contractId === t.contractId && (j.type === 'LOAD' || j.type === 'CROSSDOCK');
}

const reachCache = { world: null as World | null, gridVersion: -1, byCell: new Map<string, Map<string, number>>() };

/** BFS distances over forklift-walkable cells, cached per start cell until the grid changes. */
function reachableFrom(w: World, start: Vec2): Map<string, number> {
  if (reachCache.world !== w || reachCache.gridVersion !== w.gridVersion) {
    Object.assign(reachCache, { world: w, gridVersion: w.gridVersion, byCell: new Map() });
  }
  const key = cellKey(start);
  let dist = reachCache.byCell.get(key);
  if (!dist) {
    dist = bfsFrom(w, start);
    reachCache.byCell.set(key, dist);
  }
  return dist;
}

function bfsFrom(w: World, start: Vec2): Map<string, number> {
  const dist = new Map<string, number>([[cellKey(start), 0]]);
  const queue: Vec2[] = [start];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    const d = dist.get(cellKey(c))!;
    for (const n of walkableNeighbors(w, c)) {
      const k = cellKey(n);
      if (!dist.has(k)) {
        dist.set(k, d + 1);
        queue.push(n);
      }
    }
  }
  return dist;
}

export function assignJobs(w: World): void {
  const idle = Object.values(w.forklifts).filter((f) => f.state === 'idle' && f.blockedUntil <= w.minute && f.nextAssignAt <= w.minute);
  if (!idle.length) return;
  const load = doorLoad(w);
  const loadDoors = new Map<string, string | null>();
  const loadDoor = (contractId: string) => {
    if (!loadDoors.has(contractId)) loadDoors.set(contractId, outTruckWithRoom(w, contractId)?.doorId ?? null);
    return loadDoors.get(contractId)!;
  };
  for (const f of idle) {
    if (f.focusTruckId) {
      const t = w.trucks[f.focusTruckId];
      if (!t || t.state === 'departing') f.focusTruckId = null;
    }
    // Jobs whose pickup door is already at its forklift cap can't be taken; drop them before the costly ranking.
    const full = (d: string | null | undefined) => !d || (load.get(d) ?? 0) >= FORKLIFTS_PER_DOOR;
    let pool = Object.values(w.jobs).filter((j) => {
      if (j.forkliftId) return false;
      const p = w.pallets[j.palletId];
      if (!p || jobDoors(w, p, null).some(full)) return false;
      // A load whose outbound truck sits at a full door can't be taken now; skip it so it doesn't starve other work.
      return j.type !== 'LOAD' || !full(loadDoor(p.contractId));
    });
    if (!pool.length) {
      f.nextAssignAt = w.minute + ASSIGN_RETRY_MIN;
      continue;
    }
    if (f.focusTruckId) {
      const focused = pool.filter((j) => relatesToTruck(w, j, f.focusTruckId!));
      if (focused.length) pool = focused;
    }
    const dist = reachableFrom(w, cellOf(f.pos));
    const ranked = pool
      .map((j) => {
        const p = w.pallets[j.palletId];
        const c = w.contracts[p.contractId];
        let d = Infinity;
        for (const a of accessCells(w, p.loc)) d = Math.min(d, dist.get(cellKey(a)) ?? Infinity);
        return { j, rush: c?.rush ? 0 : 1, deadline: c?.deadline ?? Infinity, dist: d };
      })
      .filter((r) => r.dist < Infinity)
      .sort((a, b) => a.rush - b.rush || a.deadline - b.deadline || a.dist - b.dist)
      .slice(0, MAX_ATTEMPTS_PER_FORKLIFT);
    const ok = ranked.some(({ j }) => assignJobTo(w, f, j, false, load));
    if (!ok) f.nextAssignAt = w.minute + ASSIGN_RETRY_MIN;
  }
}

export function updateJobs(w: World): void {
  generateJobs(w);
  assignJobs(w);
}
