import { F_DOOR, F_FLOOR_PALLET, F_RACK, F_STAGING, flagsAt, isDoorInward, isInterior, rebuildGrid } from './grid';
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
    if (l.kind === 'floor') rebuildGrid(w);
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
    if (loc.kind === 'floor') rebuildGrid(w);
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

export function isFreeFloor(w: World, c: Vec2): boolean {
  if (!isInterior(w, c.x, c.y)) return false;
  if (flagsAt(w, c.x, c.y) & (F_RACK | F_STAGING | F_FLOOR_PALLET | F_DOOR)) return false;
  if (isDoorInward(w, c)) return false;
  return !w.reservations[`c:${cellKey(c)}`];
}

export const isStoredLoc = (l: PalletLoc): boolean => l.kind === 'rack' || l.kind === 'staging' || l.kind === 'floor';
