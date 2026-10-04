import { describe, expect, it } from 'vitest';
import { isForkliftWalkable } from './grid';
import { attachPallet, createPallet, detachPallet } from './pallets';
import { readyWorld, testContract } from './testUtils';

describe('pallets', () => {
  it('frees a floor cell for forklifts once its pallet is picked up', () => {
    const w = readyWorld();
    const c = testContract(w);
    const loc = { kind: 'floor' as const, cell: { x: 12, y: 12 } };
    const p = createPallet(w, 'starters', c.id, loc);
    attachPallet(w, p, loc);
    expect(isForkliftWalkable(w, 12, 12)).toBe(false);
    detachPallet(w, p);
    attachPallet(w, p, { kind: 'forklift', forkliftId: 'fl-1' });
    expect(isForkliftWalkable(w, 12, 12)).toBe(true);
  });
});
