import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import { updateForklifts } from './forklifts';
import { isConnected } from './grid';
import { updateJobs } from './jobs';
import { scheduleTruck, updateTrucks } from './trucks';
import type { World } from './world';
import { must, readyWorld, runMinutes, testContract } from './testUtils';

const tick = (w: World) => {
  updateTrucks(w);
  updateJobs(w);
  updateForklifts(w);
};

describe('overflow without racks', () => {
  it('never seals a doorway: a 60-pallet cross-dock with no racks still completes', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'buyForklift' }));
    const c = testContract(w, { type: 'crossdock', qty: 60, deadline: w.minute + 99999 });
    for (let i = 0; i < 3; i++) scheduleTruck(w, c, 'in', w.minute + 1 + i * 30, 20);
    for (let i = 0; i < 3; i++) scheduleTruck(w, c, 'out', w.minute + 900 + i * 30, 20);
    runMinutes(w, 4000, tick);
    expect(isConnected(w)).toBe(true);
    expect(c.shipped).toBe(60);
  });
});
