import { LOT_W } from './balance';
import { F_DOOR, F_FLOOR_PALLET, F_RACK, F_STAGING, cellOf, doorInward, flagsAt, inLot, isInterior, manhattan } from './grid';
import { cellKey, genId, type Job, type JobDest, type Pallet, type PalletLoc, type ProductId, type Vec2, type World } from './world';

export function createPallet(w: World, product: ProductId, contractId: string, loc: PalletLoc): Pallet {
  const id = genId(w, 'plt');
  const p: Pallet = { id, product, contractId, loc, placedAt: w.minute };
  w.pallets[id] = p;
  return p;
}

export function reservationKey(d: JobDest): string | null {
  if (d.kind === 'rack') return `r:${d.rackId}:${d.slot}`;
  if (d.kind === 'staging' || d.kind === 'floor') return `c:${cellKey(d.cell)}`;
  return null;
}

/** Toggles the floor-pallet bit in place (a full rebuild would still see the pallet's old loc). */
function setFloorFlag(w: World, c: Vec2, on: boolean): void {
  if (!inLot(c.x, c.y)) return;
  const i = c.y * LOT_W + c.x;
  w.grid[i] = on ? w.grid[i] | F_FLOOR_PALLET : w.grid[i] & ~F_FLOOR_PALLET;
  w.gridVersion++;
}

/** Removes the pallet from wherever it currently sits (its `loc` is left unchanged). */
export function detachPallet(w: World, p: Pallet): void {
  const l = p.loc;
  if (l.kind === 'truck') {
    const t = w.trucks[l.truckId];
    if (t) t.palletIds = t.palletIds.filter((id) => id !== p.id);
  } else if (l.kind === 'rack') {
    const r = w.racks[l.rackId];
    if (r && r.slots[l.slot] === p.id) r.slots[l.slot] = null;
  } else if (l.kind === 'staging' || l.kind === 'floor') {
    delete w.cellPallets[cellKey(l.cell)];
    if (l.kind === 'floor') setFloorFlag(w, l.cell, false);
  } else {
    const f = w.forklifts[l.forkliftId];
    if (f && f.carrying === p.id) f.carrying = null;
  }
}

export function attachPallet(w: World, p: Pallet, loc: PalletLoc): void {
  p.loc = loc;
  p.placedAt = w.minute;
  if (loc.kind === 'truck') w.trucks[loc.truckId]?.palletIds.push(p.id);
  else if (loc.kind === 'rack') w.racks[loc.rackId].slots[loc.slot] = p.id;
  else if (loc.kind === 'staging' || loc.kind === 'floor') {
    w.cellPallets[cellKey(loc.cell)] = p.id;
    if (loc.kind === 'floor') setFloorFlag(w, loc.cell, true);
  } else w.forklifts[loc.forkliftId].carrying = p.id;
}

/** Unassigns a job: frees its reservation and its forklift. The job itself stays in w.jobs. */
export function releaseJob(w: World, job: Job): void {
  const k = job.dest ? reservationKey(job.dest) : null;
  if (k && w.reservations[k] === job.id) delete w.reservations[k];
  if (job.forkliftId) {
    const f = w.forklifts[job.forkliftId];
    if (f && f.jobId === job.id) {
      f.jobId = null;
      f.path = [];
      if (f.state !== 'broken' && f.state !== 'parked') f.state = 'idle';
    }
  }
  job.forkliftId = null;
  job.dest = null;
  job.manual = false;
}

export function removePallet(w: World, id: string): void {
  const p = w.pallets[id];
  if (!p) return;
  const job = w.jobs[`job-${id}`];
  if (job) {
    releaseJob(w, job);
    delete w.jobs[job.id];
  }
  detachPallet(w, p);
  delete w.pallets[id];
}

export function isFreeStaging(w: World, c: Vec2): boolean {
  const k = cellKey(c);
  return !!w.staging[k] && !w.cellPallets[k] && !w.reservations[`c:${k}`];
}

const DOOR_CLEAR_ZONE = 2;
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const same = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;

/** Structural part of the overflow rule (depends only on the grid and doors), so callers can cache it. */
export function isFloorSpot(w: World, c: Vec2): boolean {
  if (!isInterior(w, c.x, c.y)) return false;
  if (flagsAt(w, c.x, c.y) & (F_RACK | F_STAGING | F_FLOOR_PALLET | F_DOOR)) return false;
  // Keep a clear zone around each doorway so overflow pallets never wall it off.
  if (Object.values(w.doors).some((d) => manhattan(doorInward(d), c) <= DOOR_CLEAR_ZONE)) return false;
  // A pallet beside a rack can seal off the rack's only access cell.
  return !NEIGHBORS.some(([dx, dy]) => flagsAt(w, c.x + dx, c.y + dy) & F_RACK);
}

export const isUnderForklift = (w: World, c: Vec2) => Object.values(w.forklifts).some((f) => f.state !== 'parked' && same(cellOf(f.pos), c));

export function isFreeFloor(w: World, c: Vec2): boolean {
  return isFloorSpot(w, c) && !isUnderForklift(w, c) && !w.reservations[`c:${cellKey(c)}`];
}

export const isStoredLoc = (l: PalletLoc): boolean => l.kind === 'rack' || l.kind === 'staging' || l.kind === 'floor';
