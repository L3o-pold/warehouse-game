import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import { attachPallet, createPallet } from './pallets';
import { reassignTruck, scheduleTruck, updateTrucks } from './trucks';
import { must, readyWorld, runMinutes, testContract } from './testUtils';

const inDoor = (w: ReturnType<typeof readyWorld>) => Object.values(w.doors).find((d) => d.kind === 'in')!;

describe('trucks', () => {
  it('drives in, docks at a free door of its kind and waits while it has pallets', () => {
    const w = readyWorld();
    const c = testContract(w);
    const t = scheduleTruck(w, c, 'in', w.minute + 1, 3);
    expect(t.palletIds).toHaveLength(3);
    expect(w.pallets[t.palletIds[0]].loc).toEqual({ kind: 'truck', truckId: t.id });
    runMinutes(w, 120, updateTrucks);
    expect(t.state).toBe('docked');
    expect(t.doorId).toBe(inDoor(w).id);
    expect(inDoor(w).truckId).toBe(t.id);
    expect(t.pos.x).toBeCloseTo(14);
    expect(t.pos.y).toBeCloseTo(15.6);
  });
  it('leaves and is removed once an inbound truck is empty', () => {
    const w = readyWorld();
    const c = testContract(w);
    const t = scheduleTruck(w, c, 'in', w.minute + 1, 0);
    runMinutes(w, 150, updateTrucks);
    expect(w.trucks[t.id]).toBeUndefined();
    expect(inDoor(w).truckId).toBeNull();
  });
  it('queues when every door of its kind is busy', () => {
    const w = readyWorld();
    const c = testContract(w);
    const a = scheduleTruck(w, c, 'in', w.minute + 1, 2);
    const b = scheduleTruck(w, c, 'in', w.minute + 2, 2);
    runMinutes(w, 120, updateTrucks);
    expect(a.state).toBe('docked');
    expect(b.state).toBe('queued');
    expect(b.pos.y).toBe(31);
  });
  it('stays queued with an alert when its door cannot be reached from the road', () => {
    const w = readyWorld();
    const c = testContract(w);
    for (let x = 0; x < 40; x++) w.grid[29 * 40 + x] = 1; // simulate a building row sealing the yard off from the road
    const t = scheduleTruck(w, c, 'in', w.minute + 1, 2);
    runMinutes(w, 30, updateTrucks);
    expect(t.state).toBe('queued');
    expect(w.events.some((e) => e.kind === 'alert' && e.text.includes('can’t reach'))).toBe(true);
  });
  it('tries the next free door when the first one cannot be reached', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeDoor', cell: { x: 17, y: 15 }, kind: 'in' }));
    // Seal off In 1's staging point (14,19) by marking its neighbours as building.
    for (const [x, y] of [[13, 19], [15, 19], [14, 20], [14, 18]]) w.grid[y * 40 + x] |= 1;
    const c = testContract(w);
    const t = scheduleTruck(w, c, 'in', w.minute + 1, 1);
    runMinutes(w, 120, updateTrucks);
    expect(w.doors[t.doorId!].label).toBe('In 2');
    expect(t.state).toBe('docked');
  });
  it('outbound truck departs once full and counts shipped pallets', () => {
    const w = readyWorld();
    const c = testContract(w, { type: 'crossdock', qty: 2 });
    const t = scheduleTruck(w, c, 'out', w.minute + 1, 2);
    runMinutes(w, 120, updateTrucks);
    expect(t.state).toBe('docked');
    for (let i = 0; i < 2; i++) {
      const p = createPallet(w, 'starters', c.id, { kind: 'truck', truckId: t.id });
      attachPallet(w, p, { kind: 'truck', truckId: t.id });
    }
    runMinutes(w, 1, updateTrucks);
    expect(t.state).toBe('departing');
    expect(c.shipped).toBe(2);
    runMinutes(w, 120, updateTrucks);
    expect(w.trucks[t.id]).toBeUndefined();
    expect(Object.keys(w.pallets)).toHaveLength(0);
  });
  it('reassigns a not-yet-docked truck to another free door of its kind', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeDoor', cell: { x: 17, y: 15 }, kind: 'in' }));
    const in2 = Object.values(w.doors).find((d) => d.label === 'In 2')!;
    const c = testContract(w);
    const t = scheduleTruck(w, c, 'in', w.minute + 5, 1);
    expect(reassignTruck(w, t.id, in2.id)).toEqual({ ok: true });
    runMinutes(w, 120, updateTrucks);
    expect(t.doorId).toBe(in2.id);
    expect(t.state).toBe('docked');
    const out = Object.values(w.doors).find((d) => d.kind === 'out')!;
    expect(reassignTruck(w, t.id, out.id).ok).toBe(false);
  });
});
