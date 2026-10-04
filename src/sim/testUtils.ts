import { BUILD_MINUTES } from './balance';
import { applyCommand, type CommandResult } from './commands';
import { findSpawnCell, rebuildGrid } from './grid';
import { createWorld, genId, type Contract, type World } from './world';

export function must(r: CommandResult): void {
  if (!r.ok) throw new Error(r.reason);
}

/**
 * Ready 14×10 warehouse at (10,6): interior x 11..22, y 7..14.
 * "In 1" at (14,15) and "Out 1" at (20,15), both facing S. fl-1 active. Cash $1,000,000.
 */
export function readyWorld(seed = 1): World {
  const w = createWorld(seed, 'sandbox');
  w.cash = 1_000_000;
  must(applyCommand(w, { type: 'buildFootprint', rect: { x: 10, y: 6, w: 14, h: 10 } }));
  w.minute += BUILD_MINUTES;
  rebuildGrid(w);
  const f = w.forklifts['fl-1'];
  const s = findSpawnCell(w)!;
  f.pos = { ...s };
  f.prev = { ...s };
  f.state = 'idle';
  must(applyCommand(w, { type: 'placeDoor', cell: { x: 14, y: 15 }, kind: 'in' }));
  must(applyCommand(w, { type: 'placeDoor', cell: { x: 20, y: 15 }, kind: 'out' }));
  return w;
}

export function testContract(w: World, over: Partial<Contract> = {}): Contract {
  const id = genId(w, 'ctr');
  const c: Contract = {
    id, type: 'storage', client: 'Wizards of the West', product: 'starters', qty: 4, payout: 1000, rentPerDay: 40,
    arriveAt: w.minute, storeDays: 1, deadline: w.minute + 600, offerExpires: w.minute + 720, status: 'active',
    rush: false, hot: false, truckIds: [], shipped: 0, transferred: 0, completedAt: null, earned: 0, ...over,
  };
  w.contracts[id] = c;
  return c;
}

export function runMinutes(w: World, n: number, ...updaters: ((w: World) => void)[]): void {
  for (let i = 0; i < n; i++) {
    w.minute++;
    for (const u of updaters) u(w);
  }
}
