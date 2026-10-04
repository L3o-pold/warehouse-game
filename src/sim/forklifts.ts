import { BLOCKED_MARKER_MIN, BLOCK_REPLAN_MIN, FAST_DRIVE, FAST_LIFT, FORKLIFT_SPEED, FRAGILE_FACTOR, HANDLE_MIN } from './balance';
import type { CommandResult } from './commands';
import { F_DOOR, cellOf, findSpawnCell, flagsAt, isConnected, isForkliftWalkable, isInterior, walkableNeighbors } from './grid';
import { accessCells, assignJobTo, chooseDest, jobIdFor } from './jobs';
import { attachPallet, detachPallet, isFreeFloor, isFreeStaging, releaseJob, reservationKey } from './pallets';
import { findPath } from './pathfinding';
import { PRODUCTS } from './products';
import { cellKey, type Forklift, type JobDest, type PalletLoc, type Vec2, type World } from './world';

export type OrderTarget = { kind: 'truck'; truckId: string } | { kind: 'pallet'; palletId: string } | { kind: 'cell'; cell: Vec2 };

const walk = (w: World) => (x: number, y: number) => isForkliftWalkable(w, x, y);
const same = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;
const INWARD = { N: { x: 0, y: 1 }, S: { x: 0, y: -1 }, E: { x: -1, y: 0 }, W: { x: 1, y: 0 } } as const;
const add1 = (c: Vec2, facing: keyof typeof INWARD): Vec2 => ({ x: c.x + INWARD[facing].x, y: c.y + INWARD[facing].y });

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
      if (isFreeFloor(w, n) && !w.cellPallets[k] && isConnected(w, [n])) return { kind: 'floor', cell: n };
      if (isForkliftWalkable(w, n.x, n.y)) queue.push(n);
    }
  }
  return null;
}

/** Nowhere tidy to put a pallet: use the nearest interior non-door cell that is not a doorway's inward cell. */
function lastResortSpot(w: World, from: Vec2): PalletLoc {
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      const c = { x, y };
      if (!isInterior(w, x, y) || !isForkliftWalkable(w, x, y) || w.cellPallets[cellKey(c)]) continue;
      if (Object.values(w.doors).some((d) => same(add1(d.cell, d.facing), c))) continue;
      const d = Math.abs(x - from.x) + Math.abs(y - from.y);
      if (d > 0 && d < bestD) {
        best = c;
        bestD = d;
      }
    }
  }
  return { kind: 'floor', cell: best ?? from };
}

export function cancelJob(w: World, f: Forklift): void {
  const job = f.jobId ? w.jobs[f.jobId] : undefined;
  if (job) releaseJob(w, job);
  if (f.carrying) {
    const p = w.pallets[f.carrying];
    if (p) {
      const spot = nearestDropSpot(w, cellOf(f.pos)) ?? lastResortSpot(w, cellOf(f.pos));
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
  // Goals that became blocked (a dropped pallet) or are occupied would make findPath return a path it can never walk.
  const goals = f.goals.filter((g) => (isForkliftWalkable(w, g.x, g.y) || cellKey(g) === here) && !blocked?.has(cellKey(g)));
  const p = goals.length ? findPath(cellOf(f.pos), goals, walk(w), blocked) : null;
  if (p) {
    f.path = p;
    return true;
  }
  f.blockedUntil = w.minute + BLOCKED_MARKER_MIN;
  if (f.carrying) {
    // Hold on to the pallet and retry later rather than dumping it somewhere that may seal an aisle.
    f.path = [];
    f.waited = 0;
    return false;
  }
  if (f.jobId) cancelJob(w, f);
  else {
    f.path = [];
    f.state = 'idle';
  }
  return false;
}

function nudge(w: World, other: Forklift, occ: Map<string, string>, by: Forklift): boolean {
  const free = walkableNeighbors(w, cellOf(other.pos)).filter(
    (c) => !occ.has(cellKey(c)) && !same(c, cellOf(by.pos)) && !(flagsAt(w, c.x, c.y) & F_DOOR),
  );
  // Prefer stepping aside off the requester's path; in a 1-wide aisle, step ahead along it instead.
  const spot = free.find((c) => !by.path.some((p) => same(p, c))) ?? free[0];
  if (!spot) return false;
  other.path = [spot];
  other.goals = [spot];
  other.state = 'moving';
  return true;
}

const headOn = (f: Forklift, other: Forklift) => !!other.path[0] && same(other.path[0], cellOf(f.pos));

function asideSpot(w: World, f: Forklift, other: Forklift, occ: Map<string, string>): Vec2 | null {
  const avoid = [cellOf(other.pos), ...other.path.slice(0, 3)];
  return walkableNeighbors(w, cellOf(f.pos)).find((c) => !occ.has(cellKey(c)) && !avoid.some((a) => same(a, c))) ?? null;
}

/** In a head-on standoff the forklift that can step aside does; if both can, the empty one (then the higher id) yields. */
function shouldYield(w: World, f: Forklift, other: Forklift, occ: Map<string, string>): boolean {
  const mine = asideSpot(w, f, other, occ);
  if (!mine) return false;
  if (!asideSpot(w, other, f, occ)) return true;
  if (!!f.carrying !== !!other.carrying) return !f.carrying;
  return f.id > other.id;
}

function giveWay(w: World, f: Forklift, other: Forklift, occ: Map<string, string>): void {
  const spot = asideSpot(w, f, other, occ)!;
  const here = cellKey(cellOf(f.pos));
  f.pos = { ...spot };
  f.heading = Math.atan2(spot.y - f.prev.y, spot.x - f.prev.x);
  if (occ.get(here) === f.id) occ.delete(here);
  occ.set(cellKey(spot), f.id);
  f.path = findPath(spot, f.goals, walk(w)) ?? [];
  f.waited = 0;
}

function stepMove(w: World, f: Forklift, occ: Map<string, string>): 'moving' | 'arrived' | 'blocked' {
  if (!f.path.length) {
    const at = cellOf(f.pos);
    if (!f.goals.length || f.goals.some((g) => same(g, at))) return 'arrived';
    f.waited += 1;
    if (f.waited >= BLOCK_REPLAN_MIN) {
      f.waited = 0;
      replan(w, f, occ, false);
    }
    return 'blocked';
  }
  const next = f.path[0];
  const here = cellKey(cellOf(f.pos));
  const nk = cellKey(next);
  if (nk !== here && !isForkliftWalkable(w, next.x, next.y)) return replan(w, f, occ, false) ? 'moving' : 'blocked';
  const otherId = occ.get(nk);
  if (otherId && otherId !== f.id) {
    const other = w.forklifts[otherId];
    if (other && other.state === 'idle') {
      // An idle forklift that cannot move aside (e.g. in a doorway) needs us to make room instead.
      if (!nudge(w, other, occ, f) && asideSpot(w, f, other, occ)) {
        giveWay(w, f, other, occ);
        return 'blocked';
      }
    } else if (other && headOn(f, other) && shouldYield(w, f, other, occ)) {
      giveWay(w, f, other, occ);
      return 'blocked';
    }
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

function cellTaken(w: World, c: Vec2, self: Forklift): boolean {
  if (w.cellPallets[cellKey(c)]) return true;
  return Object.values(w.forklifts).some((o) => o !== self && o.state !== 'parked' && same(cellOf(o.pos), c));
}

function dropOff(w: World, f: Forklift): void {
  const job = f.jobId ? w.jobs[f.jobId] : undefined;
  const p = job ? w.pallets[job.palletId] : undefined;
  if (!job || !p || !job.dest) {
    cancelJob(w, f);
    return;
  }
  const d = job.dest;
  if ((d.kind === 'floor' || d.kind === 'staging') && cellTaken(w, d.cell, f)) {
    // The reserved cell got occupied since it was chosen: pick another spot rather than stacking on it.
    const k = reservationKey(d);
    if (k) delete w.reservations[k];
    job.dest = null;
    const next = chooseDest(w, job, p);
    if (!next) {
      job.dest = d;
      if (k) w.reservations[k] = job.id;
      f.timer = 1;
      return;
    }
    job.dest = next;
    const k2 = reservationKey(next);
    if (k2) w.reservations[k2] = job.id;
    f.goals = accessCells(w, next);
    f.path = findPath(cellOf(f.pos), f.goals, walk(w)) ?? [];
    f.state = 'toDrop';
    return;
  }
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

/** An idle forklift standing in a door opening blocks the only way in or out, so it backs inside. */
function leaveDoorway(w: World, f: Forklift, occ: Map<string, string>): void {
  const here = cellOf(f.pos);
  if (!(flagsAt(w, here.x, here.y) & F_DOOR)) return;
  const spot = walkableNeighbors(w, here).find((c) => !occ.has(cellKey(c)) && !(flagsAt(w, c.x, c.y) & F_DOOR));
  if (!spot) return;
  f.path = [spot];
  f.goals = [spot];
  f.state = 'moving';
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
      case 'idle':
        leaveDoorway(w, f, occ);
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
