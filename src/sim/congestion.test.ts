import { expect, it } from 'vitest';
import { applyCommand } from './commands';
import { canAcceptContract } from './contracts';
import { newGame } from './scenarios';
import { runFor, step } from './tick';
import { must } from './testUtils';

it('12 forklifts on 8 doors keep flowing instead of gridlocking at the doors', () => {
  const w = newGame('sandbox', 5);
  w.cash = 5_000_000;
  must(applyCommand(w, { type: 'buildFootprint', rect: { x: 6, y: 4, w: 26, h: 18 } }));
  runFor(w, 121);
  for (const x of [8, 10, 12, 14]) must(applyCommand(w, { type: 'placeDoor', cell: { x, y: 21 }, kind: 'in' }));
  for (const x of [22, 24, 26, 28]) must(applyCommand(w, { type: 'placeDoor', cell: { x, y: 21 }, kind: 'out' }));
  for (const y of [7, 10, 13, 16]) for (let x = 9; x <= 27; x += 3) applyCommand(w, { type: 'placeRack', cell: { x, y }, orient: 'h' });
  for (let i = 0; i < 11; i++) must(applyCommand(w, { type: 'buyForklift' }));
  let blockedMinutes = 0;
  while (w.minute < 2160) {
    if (w.minute % 60 === 0) for (const c of Object.values(w.contracts)) if (canAcceptContract(w, c).ok) applyCommand(w, { type: 'acceptContract', contractId: c.id });
    step(w);
    blockedMinutes += Object.values(w.forklifts).filter((f) => f.blockedUntil > w.minute).length;
  }
  // Before the per-door cap: ~52 pallets by now and ~6 forklifts blocked on average.
  expect(w.stats.palletsHandled).toBeGreaterThanOrEqual(90);
  expect(blockedMinutes / (2160 - 481) / 12).toBeLessThan(0.05);
});
