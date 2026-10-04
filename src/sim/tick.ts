import { MIN_PER_DAY, START_MINUTE } from './balance';
import { checkContractComplete, generateOffers, updateContracts } from './contracts';
import { runMidnight } from './economy';
import { rollEvent } from './events';
import { activateParked, updateForklifts } from './forklifts';
import { rebuildGrid } from './grid';
import { updateJobs } from './jobs';
import { int } from './rng';
import { checkOutcome } from './scenarios';
import { updateTrucks } from './trucks';
import { pushEvent, type World } from './world';

export function step(w: World): void {
  if (w.outcome) return;
  w.minute += 1;
  if (w.parts.some((p) => p.readyAt === w.minute)) {
    rebuildGrid(w);
    activateParked(w);
    pushEvent(w, 'toast', 'Construction complete');
  }
  if (w.minute % MIN_PER_DAY === START_MINUTE) generateOffers(w, int(w.rng, 3, 5));
  if (w.minute % 60 === 0) rollEvent(w);
  updateContracts(w);
  updateTrucks(w);
  updateJobs(w);
  updateForklifts(w);
  for (const c of Object.values(w.contracts)) if (c.status === 'active') checkContractComplete(w, c);
  if (w.minute % MIN_PER_DAY === 0) runMidnight(w);
  checkOutcome(w);
}

export function runFor(w: World, minutes: number): void {
  for (let i = 0; i < minutes && !w.outcome; i++) step(w);
}
