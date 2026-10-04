import { DOCK_MIN, DOCK_OFFSET, LOT_H, LOT_W, TRUCK_SPEED, TRUCK_STAGE_DIST } from './balance';
import type { CommandResult } from './commands';
import { cellOf, isTruckWalkable } from './grid';
import { createPallet } from './pallets';
import { findPath } from './pathfinding';
import { DIRS, dirAngle, pushEvent, type Contract, type Door, type DoorKind, type Truck, type Vec2, type World } from './world';

export const ROAD_ENTRY: Vec2 = { x: 0, y: LOT_H };
export const ROAD_EXIT: Vec2 = { x: LOT_W - 1, y: LOT_H };
const QUEUE_ROW = LOT_H + 1;
const UNREACHABLE_ALERT_EVERY = 60;

export const stagePoint = (d: Door): Vec2 => ({
  x: d.cell.x + DIRS[d.facing].x * TRUCK_STAGE_DIST,
  y: d.cell.y + DIRS[d.facing].y * TRUCK_STAGE_DIST,
});
export const dockPoint = (d: Door): Vec2 => ({
  x: d.cell.x + DIRS[d.facing].x * DOCK_OFFSET,
  y: d.cell.y + DIRS[d.facing].y * DOCK_OFFSET,
});
const truckWalk = (w: World) => (x: number, y: number) => isTruckWalkable(w, x, y);

export function scheduleTruck(w: World, c: Contract, kind: DoorKind, arriveAt: number, count: number): Truck {
  const id = `TRK-${2200 + w.nextId++}`;
  const t: Truck = {
    id, client: c.client, contractId: c.id, kind, state: 'scheduled', arriveAt,
    pos: { ...ROAD_ENTRY }, prev: { ...ROAD_ENTRY }, heading: 0, path: [], doorId: null,
    palletIds: [], capacity: count, timer: 0, dockFrom: null,
  };
  w.trucks[id] = t;
  c.truckIds.push(id);
  if (kind === 'in') {
    for (let i = 0; i < count; i++) t.palletIds.push(createPallet(w, c.product, c.id, { kind: 'truck', truckId: id }).id);
  }
  return t;
}

function moveAlong(t: Truck, speed: number): boolean {
  let budget = speed;
  while (budget > 1e-9 && t.path.length) {
    const n = t.path[0];
    const dx = n.x - t.pos.x;
    const dy = n.y - t.pos.y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-6) t.heading = Math.atan2(dy, dx);
    if (d <= budget) {
      t.pos = { x: n.x, y: n.y };
      t.path.shift();
      budget -= d;
    } else {
      t.pos = { x: t.pos.x + (dx / d) * budget, y: t.pos.y + (dy / d) * budget };
      budget = 0;
    }
  }
  return t.path.length === 0;
}

function tryAssignDoor(w: World, t: Truck): boolean {
  let door = t.doorId ? w.doors[t.doorId] : undefined;
  if (!door || door.kind !== t.kind || (door.truckId && door.truckId !== t.id)) {
    door = Object.values(w.doors)
      .filter((d) => d.kind === t.kind && !d.truckId)
      .sort((a, b) => a.label.localeCompare(b.label))[0];
  }
  if (!door) {
    t.doorId = null;
    return false;
  }
  const path = findPath(cellOf(t.pos), [stagePoint(door)], truckWalk(w));
  if (!path) {
    // While queued, t.timer counts down to the next "unreachable" alert.
    if (t.timer <= 0) {
      pushEvent(w, 'alert', `${t.id} can’t reach ${door.label} — keep the yard open`, { at: door.cell });
      t.timer = UNREACHABLE_ALERT_EVERY;
    } else t.timer -= 1;
    return false;
  }
  door.truckId = t.id;
  t.doorId = door.id;
  t.path = path;
  t.state = 'driving';
  t.timer = 0;
  return true;
}

export function startDeparture(w: World, t: Truck): void {
  if (t.doorId) {
    const d = w.doors[t.doorId];
    if (d && d.truckId === t.id) d.truckId = null;
  }
  if (t.kind === 'out' && t.palletIds.length) {
    const c = w.contracts[t.contractId];
    if (c) c.shipped += t.palletIds.length;
  }
  t.state = 'departing';
  t.doorId = null;
  t.path = findPath(cellOf(t.pos), [ROAD_EXIT], truckWalk(w)) ?? [];
}

export function updateTrucks(w: World): void {
  const queued: Truck[] = [];
  for (const t of Object.values(w.trucks)) {
    t.prev = { x: t.pos.x, y: t.pos.y };
    switch (t.state) {
      case 'scheduled':
        if (w.minute >= t.arriveAt) {
          t.state = 'queued';
          pushEvent(w, 'toast', `${t.id} · ${t.client} arrived`);
          if (!tryAssignDoor(w, t)) queued.push(t);
        }
        break;
      case 'queued':
        if (!tryAssignDoor(w, t)) queued.push(t);
        break;
      case 'driving': {
        const door = t.doorId ? w.doors[t.doorId] : undefined;
        if (!door) {
          t.state = 'queued';
          t.doorId = null;
          t.path = [];
          queued.push(t);
          break;
        }
        if (moveAlong(t, TRUCK_SPEED)) {
          t.state = 'docking';
          t.timer = DOCK_MIN;
          t.dockFrom = { ...t.pos };
          t.heading = dirAngle(door.facing);
        }
        break;
      }
      case 'docking': {
        const door = t.doorId ? w.doors[t.doorId] : undefined;
        if (!door || !t.dockFrom) {
          startDeparture(w, t);
          break;
        }
        t.timer -= 1;
        const k = 1 - Math.max(0, t.timer) / DOCK_MIN;
        const to = dockPoint(door);
        t.pos = { x: t.dockFrom.x + (to.x - t.dockFrom.x) * k, y: t.dockFrom.y + (to.y - t.dockFrom.y) * k };
        if (t.timer <= 0) {
          t.state = 'docked';
          pushEvent(w, 'toast', `${t.id} docked at ${door.label}`, { at: door.cell });
        }
        break;
      }
      case 'docked':
        if (t.kind === 'in' ? t.palletIds.length === 0 : t.palletIds.length >= t.capacity) startDeparture(w, t);
        break;
      case 'departing':
        if (moveAlong(t, TRUCK_SPEED)) {
          for (const pid of t.palletIds) delete w.pallets[pid];
          delete w.trucks[t.id];
        }
        break;
    }
  }
  queued
    .sort((a, b) => a.arriveAt - b.arriveAt)
    .forEach((t, i) => {
      t.pos = { x: Math.min(LOT_W - 1, 1 + i * 5), y: QUEUE_ROW };
      t.heading = 0;
    });
}

export function reassignTruck(w: World, truckId: string, doorId: string): CommandResult {
  const t = w.trucks[truckId];
  if (!t) return { ok: false, reason: 'Unknown truck' };
  if (!['scheduled', 'queued', 'driving'].includes(t.state)) return { ok: false, reason: 'Trucks can only be redirected before docking' };
  const d = w.doors[doorId];
  if (!d) return { ok: false, reason: 'Unknown door' };
  if (d.kind !== t.kind) return { ok: false, reason: t.kind === 'in' ? 'Pick an inbound door' : 'Pick an outbound door' };
  if (d.truckId && d.truckId !== t.id) return { ok: false, reason: 'That door is busy' };
  if (t.doorId && t.doorId !== d.id) {
    const old = w.doors[t.doorId];
    if (old && old.truckId === t.id) old.truckId = null;
  }
  t.doorId = d.id;
  if (t.state === 'driving') {
    t.state = 'queued';
    t.path = [];
  }
  return { ok: true };
}
