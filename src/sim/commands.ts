import { BUILD_MINUTES, COST } from './balance';
import { refund, spend } from './economy';
import {
  findSpawnCell, rackCells, rebuildGrid, validateDemolish, validateDoor, validateFootprint, validateRack, validateStaging,
} from './grid';
import { acceptContract, toggleRush } from './contracts';
import { reassignTruck } from './trucks';
import { cellKey, fmtMoney, genId, newForklift, pushEvent, type DoorKind, type Rect, type Vec2, type World } from './world';

export type Command =
  | { type: 'buildFootprint'; rect: Rect }
  | { type: 'placeDoor'; cell: Vec2; kind: DoorKind }
  | { type: 'toggleDoor'; doorId: string }
  | { type: 'placeRack'; cell: Vec2; orient: 'h' | 'v' }
  | { type: 'placeStaging'; cell: Vec2 }
  | { type: 'buyForklift' }
  | { type: 'upgradeForklift'; forkliftId: string }
  | { type: 'repairForklift'; forkliftId: string }
  | { type: 'demolish'; cell: Vec2 }
  | { type: 'reassignTruck'; truckId: string; doorId: string }
  | { type: 'acceptContract'; contractId: string }
  | { type: 'toggleRush'; contractId: string };

export type CommandResult = { ok: true } | { ok: false; reason: string };

const OK: CommandResult = { ok: true };
const fail = (reason: string): CommandResult => ({ ok: false, reason });

export function applyCommand(w: World, cmd: Command): CommandResult {
  const r = run(w, cmd);
  if (!r.ok) pushEvent(w, 'alert', r.reason);
  return r;
}

function doorLabel(w: World, kind: DoorKind): string {
  const base = kind === 'in' ? 'In' : 'Out';
  const used = new Set(Object.values(w.doors).filter((d) => d.kind === kind).map((d) => d.label));
  let n = 1;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

function run(w: World, cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'buildFootprint': {
      const c = validateFootprint(w, cmd.rect);
      if (!c.ok) return c;
      spend(w, c.cost, c.cost);
      w.parts.push({ rect: { ...cmd.rect }, readyAt: w.minute + BUILD_MINUTES });
      rebuildGrid(w);
      pushEvent(w, 'toast', `Construction started (${cmd.rect.w}×${cmd.rect.h}) — ready in 2h`);
      return OK;
    }
    case 'placeDoor': {
      const c = validateDoor(w, cmd.cell);
      if (!c.ok) return c;
      spend(w, c.cost, c.cost);
      const id = genId(w, 'door');
      w.doors[id] = { id, label: doorLabel(w, cmd.kind), cell: { ...cmd.cell }, facing: c.facing, kind: cmd.kind, truckId: null };
      rebuildGrid(w);
      return OK;
    }
    case 'toggleDoor': {
      const d = w.doors[cmd.doorId];
      if (!d) return fail('Unknown door');
      if (d.truckId) return fail('A truck is using this door');
      if (w.cash < COST.doorToggle) return fail(`Need ${fmtMoney(COST.doorToggle)}`);
      spend(w, COST.doorToggle);
      d.kind = d.kind === 'in' ? 'out' : 'in';
      d.label = doorLabel(w, d.kind);
      return OK;
    }
    case 'placeRack': {
      const c = validateRack(w, cmd.cell, cmd.orient);
      if (!c.ok) return c;
      spend(w, c.cost, c.cost);
      const id = genId(w, 'rack');
      w.racks[id] = { id, cells: rackCells(cmd.cell, cmd.orient), slots: [null, null, null, null] };
      rebuildGrid(w);
      return OK;
    }
    case 'placeStaging': {
      const c = validateStaging(w, cmd.cell);
      if (!c.ok) return c;
      spend(w, c.cost, c.cost);
      w.staging[cellKey(cmd.cell)] = { ...cmd.cell };
      rebuildGrid(w);
      return OK;
    }
    case 'buyForklift': {
      const s = findSpawnCell(w);
      if (!s) return fail('Build a warehouse first');
      if (w.cash < COST.forklift) return fail(`Need ${fmtMoney(COST.forklift)}`);
      spend(w, COST.forklift, COST.forklift);
      const id = genId(w, 'fl');
      w.forklifts[id] = newForklift(id, s, 'idle');
      pushEvent(w, 'toast', 'New forklift ready');
      return OK;
    }
    case 'upgradeForklift': {
      const f = w.forklifts[cmd.forkliftId];
      if (!f) return fail('Unknown forklift');
      if (f.fast) return fail('Already upgraded');
      if (w.cash < COST.fastMast) return fail(`Need ${fmtMoney(COST.fastMast)}`);
      spend(w, COST.fastMast, COST.fastMast);
      f.fast = true;
      return OK;
    }
    case 'repairForklift': {
      const f = w.forklifts[cmd.forkliftId];
      if (!f) return fail('Unknown forklift');
      if (f.state !== 'broken') return fail('This forklift is not broken');
      if (w.cash < COST.repair) return fail(`Need ${fmtMoney(COST.repair)}`);
      spend(w, COST.repair);
      f.state = 'idle';
      f.brokenUntil = w.minute;
      return OK;
    }
    case 'demolish': {
      const c = validateDemolish(w, cmd.cell);
      if (!c.ok) return c;
      refund(w, c.refund, c.assetCost);
      if (c.target.kind === 'rack') delete w.racks[c.target.id];
      else if (c.target.kind === 'door') delete w.doors[c.target.id];
      else delete w.staging[c.target.key];
      rebuildGrid(w);
      return OK;
    }
    case 'reassignTruck':
      return reassignTruck(w, cmd.truckId, cmd.doorId);
    case 'acceptContract':
      return acceptContract(w, cmd.contractId);
    case 'toggleRush':
      return toggleRush(w, cmd.contractId);
  }
}
