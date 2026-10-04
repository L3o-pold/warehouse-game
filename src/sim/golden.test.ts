import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import { canAcceptContract, makeOffer } from './contracts';
import { newGame } from './scenarios';
import { runFor, step } from './tick';
import type { World } from './world';
import { must } from './testUtils';

function firstLot(seed: number): { w: World; contractId: string } {
  const w = newGame('scenario', seed);
  must(applyCommand(w, { type: 'buildFootprint', rect: { x: 12, y: 6, w: 14, h: 10 } }));
  runFor(w, 121);
  must(applyCommand(w, { type: 'placeDoor', cell: { x: 16, y: 15 }, kind: 'in' }));
  must(applyCommand(w, { type: 'placeDoor', cell: { x: 22, y: 15 }, kind: 'out' }));
  for (const y of [8, 11]) for (const x of [14, 16, 18, 20]) must(applyCommand(w, { type: 'placeRack', cell: { x, y }, orient: 'h' }));
  const c = makeOffer(w, 'storage');
  w.contracts[c.id] = c;
  must(applyCommand(w, { type: 'acceptContract', contractId: c.id }));
  return { w, contractId: c.id };
}

describe('golden scenario', () => {
  it('completes a storage contract end to end', () => {
    const { w, contractId } = firstLot(42);
    const c = w.contracts[contractId];
    while (c.status === 'active') step(w);
    expect(c.status).toBe('done');
    // Unload + load; a breakdown mid-carry can add an extra put-away.
    expect(w.stats.palletsHandled).toBeGreaterThanOrEqual(c.qty * 2);
    expect(w.cash).toBeGreaterThan(0);
  });
  it('is deterministic for the same seed and commands', () => {
    const a = firstLot(7).w;
    const b = firstLot(7).w;
    runFor(a, 2000);
    runFor(b, 2000);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('simulates a busy 7-day sandbox in under 2 seconds', () => {
    const w = newGame('sandbox', 7);
    w.cash = 5_000_000;
    must(applyCommand(w, { type: 'buildFootprint', rect: { x: 5, y: 2, w: 30, h: 18 } }));
    runFor(w, 121);
    for (const x of [10, 14]) must(applyCommand(w, { type: 'placeDoor', cell: { x, y: 19 }, kind: 'in' }));
    for (const x of [24, 28]) must(applyCommand(w, { type: 'placeDoor', cell: { x, y: 19 }, kind: 'out' }));
    for (const y of [5, 8, 11, 14]) for (let x = 7; x <= 31; x += 3) must(applyCommand(w, { type: 'placeRack', cell: { x, y }, orient: 'h' }));
    for (let i = 0; i < 6; i++) must(applyCommand(w, { type: 'buyForklift' }));
    const t0 = performance.now();
    while (w.minute < 7 * 1440) {
      if (w.minute % 60 === 0) {
        for (const c of Object.values(w.contracts)) if (canAcceptContract(w, c).ok) applyCommand(w, { type: 'acceptContract', contractId: c.id });
      }
      step(w);
    }
    const ms = performance.now() - t0;
    expect(w.stats.onTime + w.stats.late).toBeGreaterThan(5);
    expect(ms).toBeLessThan(2000);
  });
});
