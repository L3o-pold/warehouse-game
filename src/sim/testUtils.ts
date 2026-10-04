import { BUILD_MINUTES } from './balance';
import { applyCommand, type CommandResult } from './commands';
import { findSpawnCell, rebuildGrid } from './grid';
import { createWorld, type World } from './world';

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
