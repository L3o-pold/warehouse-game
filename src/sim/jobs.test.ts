import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import { attachPallet, createPallet } from './pallets';
import { scheduleTruck } from './trucks';
import { updateJobs } from './jobs';
import type { ContractType, ProductId, World } from './world';
import { must, readyWorld, testContract } from './testUtils';

function dockedTruck(w: World, kind: 'in' | 'out', opts: { product?: ProductId; n?: number; type?: ContractType; contractId?: string } = {}) {
  const c = opts.contractId ? w.contracts[opts.contractId] : testContract(w, { product: opts.product ?? 'boxes', type: opts.type ?? 'storage' });
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
    buyForklifts(w, 2);
    dockedTruck(w, 'in', { product: 'water' });
    updateJobs(w);
    const dests = Object.values(w.jobs).map((j) => j.dest!);
    const rackSlots = dests.filter((d) => d.kind === 'rack').map((d) => (d.kind === 'rack' ? d.slot : -1));
    expect(rackSlots.sort()).toEqual([0, 1]);
    expect(dests.some((d) => d.kind === 'floor' || d.kind === 'staging')).toBe(true);
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
    const c = testContract(w, { product: 'boxes' });
    for (const slot of [0, 1]) {
      const loc = { kind: 'rack' as const, rackId, slot };
      attachPallet(w, createPallet(w, 'boxes', c.id, loc), loc);
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
    const pNear = createPallet(w, 'boxes', near.id, { kind: 'staging', cell: { x: 11, y: 8 } });
    attachPallet(w, pNear, pNear.loc);
    const pFar = createPallet(w, 'boxes', far.id, { kind: 'staging', cell: { x: 21, y: 13 } });
    attachPallet(w, pFar, pFar.loc);
    updateJobs(w);
    expect(w.jobs[`job-${pFar.id}`].forkliftId).toBe('fl-1');
    expect(w.jobs[`job-${pNear.id}`].forkliftId).toBeNull();
  });
});
