import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import { failContract } from './contracts';
import { activateParked, breakdown, updateForklifts } from './forklifts';
import { rebuildGrid } from './grid';
import { generateJobs, updateJobs } from './jobs';
import { scheduleTruck, updateTrucks } from './trucks';
import { createWorld, type World } from './world';
import { must, readyWorld, runMinutes, testContract } from './testUtils';

const tick = (w: World) => {
  updateTrucks(w);
  updateJobs(w);
  updateForklifts(w);
};

describe('forklifts', () => {
  it('activates the parked starter forklift when a building is ready', () => {
    const w = createWorld(1, 'scenario');
    must(applyCommand(w, { type: 'buildFootprint', rect: { x: 10, y: 6, w: 12, h: 8 } }));
    activateParked(w);
    expect(w.forklifts['fl-1'].state).toBe('parked');
    w.minute += 120;
    rebuildGrid(w);
    activateParked(w);
    expect(w.forklifts['fl-1'].state).toBe('idle');
    expect(w.forklifts['fl-1'].pos).toEqual({ x: 11, y: 7 });
  });
  it('unloads a whole truck into racks and the truck leaves', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 12, y: 10 }, orient: 'h' }));
    must(applyCommand(w, { type: 'placeRack', cell: { x: 16, y: 10 }, orient: 'h' }));
    const c = testContract(w);
    const t = scheduleTruck(w, c, 'in', w.minute + 1, 4);
    runMinutes(w, 300, tick);
    const pallets = Object.values(w.pallets);
    expect(pallets).toHaveLength(4);
    expect(pallets.every((p) => p.loc.kind === 'rack')).toBe(true);
    expect(w.trucks[t.id]).toBeUndefined();
    expect(w.stats.palletsHandled).toBe(4);
    expect(Object.keys(w.reservations)).toHaveLength(0);
  });
  it('moves to a cell on a manual order and rejects non-walkable cells', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'orderForklifts', forkliftIds: ['fl-1'], target: { kind: 'cell', cell: { x: 20, y: 12 } } }));
    runMinutes(w, 60, updateForklifts);
    expect(w.forklifts['fl-1'].pos).toEqual({ x: 20, y: 12 });
    expect(w.forklifts['fl-1'].state).toBe('idle');
    expect(applyCommand(w, { type: 'orderForklifts', forkliftIds: ['fl-1'], target: { kind: 'cell', cell: { x: 10, y: 10 } } }).ok).toBe(false);
  });
  it('nudges an idle forklift out of a 1-wide aisle instead of stalling', () => {
    const w = readyWorld();
    // Wall off everything except row y=10 between x=12..20 using racks placed directly.
    for (let x = 12; x <= 20; x += 2) {
      w.racks[`top${x}`] = { id: `top${x}`, cells: [{ x, y: 9 }, { x: x + 1, y: 9 }], slots: [null, null, null, null] };
      w.racks[`bot${x}`] = { id: `bot${x}`, cells: [{ x, y: 11 }, { x: x + 1, y: 11 }], slots: [null, null, null, null] };
    }
    rebuildGrid(w);
    must(applyCommand(w, { type: 'buyForklift' }));
    const [a, b] = Object.values(w.forklifts);
    a.pos = { x: 11, y: 10 };
    a.prev = { ...a.pos };
    b.pos = { x: 16, y: 10 };
    b.prev = { ...b.pos };
    must(applyCommand(w, { type: 'orderForklifts', forkliftIds: [a.id], target: { kind: 'cell', cell: { x: 22, y: 10 } } }));
    runMinutes(w, 120, updateForklifts);
    expect(a.pos).toEqual({ x: 22, y: 10 });
  });
  it('a manual pallet order takes over that pallet’s job', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 12, y: 10 }, orient: 'h' }));
    must(applyCommand(w, { type: 'buyForklift' }));
    const c = testContract(w);
    const t = scheduleTruck(w, c, 'in', w.minute, 2);
    runMinutes(w, 60, updateTrucks);
    generateJobs(w);
    const pid = t.palletIds[1];
    const other = Object.keys(w.forklifts).find((id) => id !== 'fl-1')!;
    must(applyCommand(w, { type: 'orderForklifts', forkliftIds: [other], target: { kind: 'pallet', palletId: pid } }));
    expect(w.jobs[`job-${pid}`]).toMatchObject({ forkliftId: other, manual: true });
  });
  it('breakdown drops a carried pallet nearby and frees the job', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 12, y: 10 }, orient: 'h' }));
    const c = testContract(w);
    scheduleTruck(w, c, 'in', w.minute, 1);
    const f = w.forklifts['fl-1'];
    let guard = 0;
    while (!f.carrying && guard++ < 300) runMinutes(w, 1, tick);
    expect(f.carrying).not.toBeNull();
    const pid = f.carrying!;
    breakdown(w, f, 120);
    expect(f.state).toBe('broken');
    expect(f.carrying).toBeNull();
    expect(['floor', 'staging']).toContain(w.pallets[pid].loc.kind);
    expect(w.jobs[`job-${pid}`]?.forkliftId ?? null).toBeNull();
  });
  it('contract failure while carrying frees the forklift with no leaks', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 12, y: 10 }, orient: 'h' }));
    const c = testContract(w);
    scheduleTruck(w, c, 'in', w.minute, 2);
    const f = w.forklifts['fl-1'];
    let guard = 0;
    while (!f.carrying && guard++ < 300) runMinutes(w, 1, tick);
    failContract(w, c);
    expect(f.carrying).toBeNull();
    expect(f.jobId).toBeNull();
    expect(f.state).toBe('idle');
    expect(Object.keys(w.jobs)).toHaveLength(0);
    expect(Object.keys(w.reservations)).toHaveLength(0);
    expect(Object.keys(w.pallets)).toHaveLength(0);
    runMinutes(w, 5, tick);
  });
});
