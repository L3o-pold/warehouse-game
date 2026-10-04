import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import { netWorth } from './economy';
import { createWorld } from './world';
import { must, readyWorld } from './testUtils';

describe('build commands', () => {
  it('builds a footprint, charges cash and adds asset value', () => {
    const w = createWorld(1, 'scenario');
    must(applyCommand(w, { type: 'buildFootprint', rect: { x: 10, y: 6, w: 12, h: 8 } }));
    expect(w.cash).toBe(60000 - 24000);
    expect(w.parts).toHaveLength(1);
    expect(w.parts[0].readyAt).toBe(w.minute + 120);
    expect(netWorth(w)).toBe(36000 + 0.5 * (8000 + 24000));
  });
  it('rejects invalid commands with an alert event', () => {
    const w = createWorld(1, 'scenario');
    const r = applyCommand(w, { type: 'buildFootprint', rect: { x: 0, y: 0, w: 3, h: 3 } });
    expect(r.ok).toBe(false);
    expect(w.events.at(-1)).toMatchObject({ kind: 'alert', text: 'Minimum size is 8×6' });
  });
  it('labels doors per kind and toggles them', () => {
    const w = readyWorld();
    const doors = Object.values(w.doors);
    expect(doors.map((d) => d.label)).toEqual(['In 1', 'Out 1']);
    must(applyCommand(w, { type: 'placeDoor', cell: { x: 17, y: 15 }, kind: 'in' }));
    const d = Object.values(w.doors).find((x) => x.cell.x === 17)!;
    expect(d.label).toBe('In 2');
    const cash = w.cash;
    must(applyCommand(w, { type: 'toggleDoor', doorId: d.id }));
    expect(d.kind).toBe('out');
    expect(d.label).toBe('Out 2');
    expect(w.cash).toBe(cash - 500);
  });
  it('refuses to toggle a door a truck is assigned to', () => {
    const w = readyWorld();
    const d = Object.values(w.doors)[0];
    d.truckId = 'TRK-1';
    expect(applyCommand(w, { type: 'toggleDoor', doorId: d.id })).toEqual({ ok: false, reason: 'A truck is using this door' });
  });
  it('places racks and staging, then demolishes for a 50% refund', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 12, y: 9 }, orient: 'h' }));
    must(applyCommand(w, { type: 'placeStaging', cell: { x: 15, y: 12 } }));
    expect(Object.keys(w.racks)).toHaveLength(1);
    expect(w.staging['15,12']).toEqual({ x: 15, y: 12 });
    const cash = w.cash;
    const assets = w.assetValue;
    must(applyCommand(w, { type: 'demolish', cell: { x: 13, y: 9 } }));
    expect(w.cash).toBe(cash + 750);
    expect(w.assetValue).toBe(assets - 1500);
    expect(Object.keys(w.racks)).toHaveLength(0);
  });
  it('buys, upgrades and repairs forklifts', () => {
    const w = createWorld(1, 'scenario');
    expect(applyCommand(w, { type: 'buyForklift' })).toEqual({ ok: false, reason: 'Build a warehouse first' });
    const r = readyWorld();
    must(applyCommand(r, { type: 'buyForklift' }));
    const f = Object.values(r.forklifts).find((x) => x.id !== 'fl-1')!;
    expect(f.state).toBe('idle');
    must(applyCommand(r, { type: 'upgradeForklift', forkliftId: f.id }));
    expect(f.fast).toBe(true);
    expect(applyCommand(r, { type: 'upgradeForklift', forkliftId: f.id }).ok).toBe(false);
    expect(applyCommand(r, { type: 'repairForklift', forkliftId: f.id }).ok).toBe(false);
    f.state = 'broken';
    f.brokenUntil = r.minute + 100;
    must(applyCommand(r, { type: 'repairForklift', forkliftId: f.id }));
    expect(f.state).toBe('idle');
  });
});
