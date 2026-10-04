import { BLOCKED_MARKER_MIN, BLOCK_REPLAN_MIN, FAST_DRIVE, FAST_LIFT, FORKLIFT_SPEED, FRAGILE_FACTOR, HANDLE_MIN } from './balance';
import type { CommandResult } from './commands';
import { cellOf, findSpawnCell, isForkliftWalkable, walkableNeighbors } from './grid';
import { accessCells, assignJobTo, jobIdFor } from './jobs';
import { attachPallet, detachPallet, isFreeFloor, isFreeStaging, releaseJob, reservationKey } from './pallets';
import { findPath } from './pathfinding';
import { PRODUCTS } from './products';
import { cellKey, type Forklift, type JobDest, type PalletLoc, type Vec2, type World } from './world';

export type OrderTarget = { kind: 'truck'; truckId: string } | { kind: 'pallet'; palletId: string } | { kind: 'cell'; cell: Vec2 };

const walk = (w: World) => (x: number, y: number) => isForkliftWalkable(w, x, y);
const same = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;

export function activateParked(w: World): void {
  for (const f of Object.values(w.forklifts)) {
    if (f.state !== 'parked') continue;
    const s = findSpawnCell(w);
    if (!s) return;
    f.pos = { ...s };
    f.prev = { ...s };
    f.state = 'idle';
  }
}

function nearestDropSpot(w: World, from: Vec2): PalletLoc | null {
  const seen = new Set<string>([cellKey(from)]);
  const queue: Vec2[] = [from];
  while (queue.length && seen.size < 600) {
    const c = queue.shift()!;
    for (const n of [
      { x: c.x + 1, y: c.y },
      { x: c.x - 1, y: c.y },
      { x: c.x, y: c.y + 1 },
      { x: c.x, y: c.y - 1 },
    ]) {
      const k = cellKey(n);
      if (seen.has(k)) continue;
      seen.add(k);
      if (isFreeStaging(w, n)) return { kind: 'staging', cell: n };
      if (isFreeFloor(w, n) && !w.cellPallets[k]) return { kind: 'floor', cell: n };
      if (isForkliftWalkable(w, n.x, n.y)) queue.push(n);
    }
  }
  return null;
}

export function cancelJob(w: World, f: Forklift): void {
  const job = f.jobId ? w.jobs[f.jobId] : undefined;
  if (job) releaseJob(w, job);
  if (f.carrying) {
    const p = w.pallets[f.carrying];
    if (p) {
      const spot = nearestDropSpot(w, cellOf(f.pos)) ?? { kind: 'floor' as const, cell: cellOf(f.pos) };
      detachPallet(w, p);
      attachPallet(w, p, spot);
    }
    f.carrying = null;
  }
  f.jobId = null;
  f.path = [];
  if (f.state !== 'broken' && f.state !== 'parked') f.state = 'idle';
}

export function breakdown(w: World, f: Forklift, minutes: number): void {
  cancelJob(w, f);
  f.state = 'broken';
  f.brokenUntil = w.minute + minutes;
  f.focusTruckId = null;
}

function handleTime(w: World, f: Forklift): number {
  const pid = f.carrying ?? (f.jobId ? w.jobs[f.jobId]?.palletId : null);
  const p = pid ? w.pallets[pid] : undefined;
  let t = HANDLE_MIN * (p && PRODUCTS[p.product].fragile ? FRAGILE_FACTOR : 1);
  if (f.fast) t /= FAST_LIFT;
  return t;
}

export function handlingTarget(w: World, f: Forklift): PalletLoc | JobDest | null {
  const job = f.jobId ? w.jobs[f.jobId] : undefined;
  if (!job) return null;
  if (f.state === 'lifting' || f.state === 'toPickup') return w.pallets[job.palletId]?.loc ?? null;
  return job.dest;
}

function taskStillValid(w: World, f: Forklift): boolean {
  if (f.state === 'moving') return true;
  const job = f.jobId ? w.jobs[f.jobId] : undefined;
  if (!job || !job.dest) return false;
  const p = w.pallets[job.palletId];
  if (!p) return false;
  if (f.state === 'toPickup' || f.state === 'lifting') {
    if (p.loc.kind === 'truck') return w.trucks[p.loc.truckId]?.state === 'docked';
    return p.loc.kind !== 'forklift';
  }
  if (job.dest.kind === 'truck') return w.trucks[job.dest.truckId]?.state === 'docked';
  if (job.dest.kind === 'rack') return !!w.racks[job.dest.rackId];
  return true;
}

function replan(w: World, f: Forklift, occ: Map<string, string>, avoidOthers: boolean): boolean {
  const here = cellKey(cellOf(f.pos));
  const blocked = avoidOthers ? new Set([...occ.keys()].filter((k) => k !== here)) : undefined;
  const p = findPath(cellOf(f.pos), f.goals, walk(w), blocked);
  if (p) {
    f.path = p;
    return true;
  }
  f.blockedUntil = w.minute + BLOCKED_MARKER_MIN;
  if (f.jobId) cancelJob(w, f);
  else {
    f.path = [];
    f.state = 'idle';
  }
  return false;
}

function nudge(w: World, other: Forklift, occ: Map<string, string>, by: Forklift): void {
  const free = walkableNeighbors(w, cellOf(other.pos)).filter((c) => !occ.has(cellKey(c)) && !same(c, cellOf(by.pos)));
  // Prefer stepping aside off the requester's path; in a 1-wide aisle, step ahead along it instead.
  const spot = free.find((c) => !by.path.some((p) => same(p, c))) ?? free[0];
  if (!spot) return;
  other.path = [spot];
  other.goals = [spot];
  other.state = 'moving';
}

function stepMove(w: World, f: Forklift, occ: Map<string, string>): 'moving' | 'arrived' | 'blocked' {
  if (!f.path.length) return 'arrived';
  const next = f.path[0];
  const here = cellKey(cellOf(f.pos));
  const nk = cellKey(next);
  if (nk !== here && !isForkliftWalkable(w, next.x, next.y)) return replan(w, f, occ, false) ? 'moving' : 'blocked';
  const otherId = occ.get(nk);
  if (otherId && otherId !== f.id) {
    const other = w.forklifts[otherId];
    if (other && other.state === 'idle') nudge(w, other, occ, f);
    f.waited += 1;
    if (f.waited >= BLOCK_REPLAN_MIN) {
      f.waited = 0;
      replan(w, f, occ, true);
    }
    return 'blocked';
  }
  f.waited = 0;
  let budget = FORKLIFT_SPEED * (f.fast ? FAST_DRIVE : 1);
  while (budget > 1e-9 && f.path.length) {
    const n = f.path[0];
    const occupant = occ.get(cellKey(n));
    if (occupant && occupant !== f.id) break;
    const dx = n.x - f.pos.x;
    const dy = n.y - f.pos.y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-6) f.heading = Math.atan2(dy, dx);
    if (d <= budget) {
      f.pos = { x: n.x, y: n.y };
      f.path.shift();
      budget -= d;
    } else {
      f.pos = { x: f.pos.x + (dx / d) * budget, y: f.pos.y + (dy / d) * budget };
      budget = 0;
    }
  }
  if (occ.get(here) === f.id) occ.delete(here);
  occ.set(cellKey(cellOf(f.pos)), f.id);
  return f.path.length ? 'moving' : 'arrived';
}

function pickUp(w: World, f: Forklift): void {
  const job = f.jobId ? w.jobs[f.jobId] : undefined;
  const p = job ? w.pallets[job.palletId] : undefined;
  if (!job || !p || !job.dest) {
    cancelJob(w, f);
    return;
  }
  detachPallet(w, p);
  attachPallet(w, p, { kind: 'forklift', forkliftId: f.id });
  const goals = accessCells(w, job.dest);
  const path = findPath(cellOf(f.pos), goals, walk(w));
  if (!path) {
    cancelJob(w, f);
    return;
  }
  f.goals = goals;
  f.path = path;
  f.state = 'toDrop';
}

function dropOff(w: World, f: Forklift): void {
  const job = f.jobId ? w.jobs[f.jobId] : undefined;
  const p = job ? w.pallets[job.palletId] : undefined;
  if (!job || !p || !job.dest) {
    cancelJob(w, f);
    return;
  }
  const d = job.dest;
  detachPallet(w, p);
  let loc: PalletLoc;
  if (d.kind === 'truck') loc = { kind: 'truck', truckId: d.truckId };
  else if (d.kind === 'rack') loc = { kind: 'rack', rackId: d.rackId, slot: d.slot };
  else if (d.kind === 'staging') loc = { kind: 'staging', cell: { ...d.cell } };
  else loc = { kind: 'floor', cell: { ...d.cell } };
  attachPallet(w, p, loc);
  const k = reservationKey(d);
  if (k) delete w.reservations[k];
  delete w.jobs[job.id];
  f.jobId = null;
  f.carrying = null;
  f.state = 'idle';
  w.stats.palletsHandled++;
}

export function updateForklifts(w: World): void {
  const occ = new Map<string, string>();
  for (const f of Object.values(w.forklifts)) if (f.state !== 'parked') occ.set(cellKey(cellOf(f.pos)), f.id);
  for (const f of Object.values(w.forklifts)) {
    f.prev = { x: f.pos.x, y: f.pos.y };
    switch (f.state) {
      case 'broken':
        if (w.minute >= f.brokenUntil) f.state = 'idle';
        break;
      case 'toPickup':
      case 'toDrop':
      case 'moving': {
        if (!taskStillValid(w, f)) {
          cancelJob(w, f);
          break;
        }
        if (stepMove(w, f, occ) !== 'arrived') break;
        if (f.state === 'toPickup') {
          f.state = 'lifting';
          f.timer = handleTime(w, f);
        } else if (f.state === 'toDrop') {
          f.state = 'dropping';
          f.timer = handleTime(w, f);
        } else f.state = 'idle';
        break;
      }
      case 'lifting':
        if (!taskStillValid(w, f)) {
          cancelJob(w, f);
          break;
        }
        f.timer -= 1;
        if (f.timer <= 0) pickUp(w, f);
        break;
      case 'dropping':
        if (!taskStillValid(w, f)) {
          cancelJob(w, f);
          break;
        }
        f.timer -= 1;
        if (f.timer <= 0) dropOff(w, f);
        break;
      default:
        break;
    }
  }
}

export function orderForklifts(w: World, ids: string[], target: OrderTarget): CommandResult {
  const fls = ids.map((id) => w.forklifts[id]).filter((f): f is Forklift => !!f && f.state !== 'parked' && f.state !== 'broken');
  if (!fls.length) return { ok: false, reason: 'No available forklift selected' };
  switch (target.kind) {
    case 'truck': {
      if (!w.trucks[target.truckId]) return { ok: false, reason: 'That truck has left' };
      for (const f of fls) {
        cancelJob(w, f);
        f.focusTruckId = target.truckId;
      }
      return { ok: true };
    }
    case 'pallet': {
      const job = w.jobs[jobIdFor(target.palletId)];
      if (!job) return { ok: false, reason: 'This pallet has nothing to do right now' };
      if (job.forkliftId) {
        const owner = w.forklifts[job.forkliftId];
        if (fls.includes(owner)) return { ok: true };
        cancelJob(w, owner);
      }
      const f = fls[0];
      cancelJob(w, f);
      return assignJobTo(w, f, job, true) ? { ok: true } : { ok: false, reason: 'Can’t reach that pallet' };
    }
    case 'cell': {
      const c = target.cell;
      if (!isForkliftWalkable(w, c.x, c.y)) return { ok: false, reason: 'Forklifts can’t drive there' };
      let moved = 0;
      for (const f of fls) {
        cancelJob(w, f);
        f.focusTruckId = null;
        const path = findPath(cellOf(f.pos), [c], walk(w));
        if (!path) continue;
        f.path = path;
        f.goals = [c];
        f.state = 'moving';
        moved++;
      }
      return moved ? { ok: true } : { ok: false, reason: 'No route to that spot' };
    }
  }
}
