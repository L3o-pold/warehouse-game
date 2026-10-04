import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import { attachPallet, createPallet } from './pallets';
import { rebuildGrid } from './grid';
import { scheduleTruck } from './trucks';
import { chooseDest, updateJobs } from './jobs';
import type { ContractType, ProductId, World } from './world';
import { must, readyWorld, testContract } from './testUtils';

function dockedTruck(w: World, kind: 'in' | 'out', opts: { product?: ProductId; n?: number; type?: ContractType; contractId?: string } = {}) {
  const c = opts.contractId ? w.contracts[opts.contractId] : testContract(w, { product: opts.product ?? 'starters', type: opts.type ?? 'storage' });
  const t = scheduleTruck(w, c, kind, w.minute, opts.n ?? 3);
  const door = Object.values(w.doors).find((d) => d.kind === kind)!;
  t.state = 'docked';
  t.doorId = door.id;
  door.truckId = t.id;
  return { c, t, door };
}
const buyForklifts = (w: World, n: number) => {
  for (let i = 0; i < n; i++) must(applyCommand(w, { type: 'buyForklift' }));
};

describe('jobs', () => {
  it('creates an UNLOAD job per pallet and sends the idle forklift to the nearest rack slot', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 12, y: 9 }, orient: 'h' }));
    dockedTruck(w, 'in');
    updateJobs(w);
    const jobs = Object.values(w.jobs);
    expect(jobs).toHaveLength(3);
    expect(jobs.every((j) => j.type === 'UNLOAD')).toBe(true);
    const mine = jobs.find((j) => j.forkliftId === 'fl-1')!;
    expect(mine.dest?.kind === 'rack' && mine.dest.slot < 2).toBe(true);
    expect(w.forklifts['fl-1'].state).toBe('toPickup');
    expect(Object.values(w.reservations)).toContain(mine.id);
  });
  it('keeps heavy products on rack level 0', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 12, y: 9 }, orient: 'h' }));
    buyForklifts(w, 1);
    dockedTruck(w, 'in', { product: 'playmats' });
    updateJobs(w);
    const assigned = Object.values(w.jobs).filter((j) => j.forkliftId);
    expect(assigned.map((j) => (j.dest?.kind === 'rack' ? j.dest.slot : -1)).sort()).toEqual([0, 1]);
    const third = Object.values(w.jobs).find((j) => !j.forkliftId)!;
    const d = chooseDest(w, third, w.pallets[third.palletId])!;
    expect(d.kind === 'floor' || d.kind === 'staging').toBe(true);
  });
  it('falls back to staging, then floor, when there are no racks', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeStaging', cell: { x: 15, y: 13 } }));
    buyForklifts(w, 1);
    dockedTruck(w, 'in', { n: 2 });
    updateJobs(w);
    const kinds = Object.values(w.jobs).map((j) => j.dest?.kind).sort();
    expect(kinds).toEqual(['floor', 'staging']);
  });
  it('never picks floor overflow cells next to a doorway or under a forklift', () => {
    const w = readyWorld();
    buyForklifts(w, 3);
    dockedTruck(w, 'in', { n: 4 });
    updateJobs(w);
    const taken = Object.values(w.forklifts).map((f) => `${f.pos.x},${f.pos.y}`);
    for (const j of Object.values(w.jobs)) {
      const d = j.dest ?? chooseDest(w, j, w.pallets[j.palletId])!;
      expect(d.kind).toBe('floor');
      if (d.kind !== 'floor') continue;
      for (const door of [{ x: 14, y: 14 }, { x: 20, y: 14 }]) expect(Math.abs(d.cell.x - door.x) + Math.abs(d.cell.y - door.y)).toBeGreaterThan(2);
      expect(taken).not.toContain(`${d.cell.x},${d.cell.y}`);
    }
  });
  it('assigns reachable work even when many more urgent jobs are unreachable', () => {
    const w = readyWorld();
    // Wall off a pocket x11..14, y7..8 with racks (placed directly, bypassing validation).
    w.racks.wallA = { id: 'wallA', cells: [{ x: 15, y: 7 }, { x: 15, y: 8 }], slots: [null, null, null, null] };
    w.racks.wallB = { id: 'wallB', cells: [{ x: 11, y: 9 }, { x: 12, y: 9 }], slots: [null, null, null, null] };
    w.racks.wallC = { id: 'wallC', cells: [{ x: 13, y: 9 }, { x: 14, y: 9 }], slots: [null, null, null, null] };
    const rush = testContract(w, { rush: true, deadline: w.minute + 60 });
    const calm = testContract(w, { deadline: w.minute + 2000 });
    for (let x = 11; x <= 14; x++) for (const y of [7, 8]) {
      w.staging[`${x},${y}`] = { x, y };
      const p = createPallet(w, 'starters', rush.id, { kind: 'staging', cell: { x, y } });
      attachPallet(w, p, p.loc);
    }
    w.staging['18,12'] = { x: 18, y: 12 };
    const reachable = createPallet(w, 'starters', calm.id, { kind: 'staging', cell: { x: 18, y: 12 } });
    attachPallet(w, reachable, reachable.loc);
    rebuildGrid(w);
    const f = w.forklifts['fl-1'];
    f.pos = { x: 20, y: 12 };
    f.prev = { ...f.pos };
    updateJobs(w);
    expect(w.jobs[`job-${reachable.id}`].forkliftId).toBe('fl-1');
  });
  it('never picks floor overflow cells next to a rack', () => {
    const w = readyWorld();
    w.racks.r = { id: 'r', cells: [{ x: 15, y: 12 }, { x: 16, y: 12 }], slots: ['x', 'x', 'x', 'x'] };
    rebuildGrid(w);
    buyForklifts(w, 3);
    dockedTruck(w, 'in', { n: 4 });
    updateJobs(w);
    for (const j of Object.values(w.jobs)) {
      const d = j.dest ?? chooseDest(w, j, w.pallets[j.palletId])!;
      if (d.kind !== 'floor') continue;
      const nearRack = [{ x: 15, y: 12 }, { x: 16, y: 12 }].some((c) => Math.abs(c.x - d.cell.x) + Math.abs(c.y - d.cell.y) === 1);
      expect(nearRack).toBe(false);
    }
  });
  it('sends at most two forklifts to the same dock door at once', () => {
    const w = readyWorld();
    for (const x of [12, 15, 18]) must(applyCommand(w, { type: 'placeRack', cell: { x, y: 9 }, orient: 'h' }));
    buyForklifts(w, 4);
    dockedTruck(w, 'in', { n: 8 });
    updateJobs(w);
    expect(Object.values(w.jobs).filter((j) => j.forkliftId)).toHaveLength(2);
  });
  it('skips jobs blocked by a full door and takes other work instead', () => {
    const w = readyWorld();
    buyForklifts(w, 2);
    for (const [x, y] of [[12, 8], [15, 8], [18, 8], [12, 11], [15, 11], [18, 11]]) must(applyCommand(w, { type: 'placeRack', cell: { x, y }, orient: 'h' }));
    const urgent = testContract(w, { rush: true, deadline: w.minute + 30 });
    const racks = Object.values(w.racks);
    for (let i = 0; i < 12; i++) {
      const loc = { kind: 'rack' as const, rackId: racks[Math.floor(i / 4) + 2].id, slot: i % 4 };
      attachPallet(w, createPallet(w, 'starters', urgent.id, loc), loc);
    }
    const { t } = dockedTruck(w, 'out', { contractId: urgent.id, n: 12 });
    // Two forklifts are already working the outbound door, so it is at its cap.
    const [f1, f2, f3] = Object.values(w.forklifts);
    for (const f of [f1, f2]) {
      const p = createPallet(w, 'starters', urgent.id, { kind: 'forklift', forkliftId: f.id });
      attachPallet(w, p, p.loc);
      const id = `job-${p.id}`;
      w.jobs[id] = { id, type: 'LOAD', palletId: p.id, forkliftId: f.id, dest: { kind: 'truck', truckId: t.id }, manual: false };
      f.jobId = id;
      f.state = 'toDrop';
    }
    const calm = testContract(w, { deadline: w.minute + 5000 });
    w.staging['21,13'] = { x: 21, y: 13 };
    const p = createPallet(w, 'starters', calm.id, { kind: 'staging', cell: { x: 21, y: 13 } });
    attachPallet(w, p, p.loc);
    updateJobs(w);
    expect(f3.jobId).toBe(`job-${p.id}`);
  });
  it('raises a throttled "Warehouse full" alert when nothing can be placed', () => {
    const w = readyWorld();
    dockedTruck(w, 'in', { n: 1 });
    for (let x = 11; x <= 22; x++) for (let y = 7; y <= 14; y++) w.reservations[`c:${x},${y}`] = 'blocked';
    updateJobs(w);
    updateJobs(w);
    expect(w.events.filter((e) => e.text.startsWith('Warehouse full'))).toHaveLength(1);
    expect(Object.values(w.jobs)[0].forkliftId).toBeNull();
  });
  it('creates LOAD jobs when an outbound truck for the contract is docked', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 18, y: 12 }, orient: 'h' }));
    const rackId = Object.keys(w.racks)[0];
    const c = testContract(w, { product: 'starters' });
    for (const slot of [0, 1]) {
      const loc = { kind: 'rack' as const, rackId, slot };
      attachPallet(w, createPallet(w, 'starters', c.id, loc), loc);
    }
    updateJobs(w);
    expect(Object.keys(w.jobs)).toHaveLength(0);
    const { t } = dockedTruck(w, 'out', { contractId: c.id, n: 2 });
    updateJobs(w);
    const jobs = Object.values(w.jobs);
    expect(jobs.map((j) => j.type)).toEqual(['LOAD', 'LOAD']);
    expect(jobs.find((j) => j.forkliftId)!.dest).toEqual({ kind: 'truck', truckId: t.id });
  });
  it('sends cross-dock pallets straight to a docked outbound truck, else to staging/floor', () => {
    const w = readyWorld();
    dockedTruck(w, 'in', { type: 'crossdock', n: 1 });
    updateJobs(w);
    const j = Object.values(w.jobs)[0];
    expect(j.type).toBe('CROSSDOCK');
    expect(j.dest!.kind).toBe('floor');
    const w2 = readyWorld();
    const { c: c2 } = dockedTruck(w2, 'in', { type: 'crossdock', n: 1 });
    const { t: out } = dockedTruck(w2, 'out', { contractId: c2.id, n: 1 });
    updateJobs(w2);
    expect(Object.values(w2.jobs)[0].dest).toEqual({ kind: 'truck', truckId: out.id });
  });
  it('prefers rush contracts over nearer work', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 18, y: 9 }, orient: 'h' }));
    must(applyCommand(w, { type: 'placeStaging', cell: { x: 11, y: 8 } }));
    must(applyCommand(w, { type: 'placeStaging', cell: { x: 21, y: 13 } }));
    const near = testContract(w, { deadline: w.minute + 100 });
    const far = testContract(w, { deadline: w.minute + 900, rush: true });
    const pNear = createPallet(w, 'starters', near.id, { kind: 'staging', cell: { x: 11, y: 8 } });
    attachPallet(w, pNear, pNear.loc);
    const pFar = createPallet(w, 'starters', far.id, { kind: 'staging', cell: { x: 21, y: 13 } });
    attachPallet(w, pFar, pFar.loc);
    updateJobs(w);
    expect(w.jobs[`job-${pFar.id}`].forkliftId).toBe('fl-1');
    expect(w.jobs[`job-${pNear.id}`].forkliftId).toBeNull();
  });
});
