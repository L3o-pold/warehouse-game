import { step } from '../sim/tick';
import type { World } from '../sim/world';

/** Real seconds per sim step at 1× (1 real second = 10 in-game minutes). */
export const STEP_SECONDS = 0.1;
const MAX_STEPS_PER_FRAME = 40;
const MAX_DELTA = 0.25;

export const loop = { acc: 0, alpha: 1 };

export function advance(w: World, deltaSeconds: number, speed: number): number {
  if (speed === 0 || w.outcome) {
    loop.alpha = 1;
    return 0;
  }
  loop.acc += Math.min(deltaSeconds, MAX_DELTA) * speed;
  let steps = 0;
  while (loop.acc >= STEP_SECONDS - 1e-9 && steps < MAX_STEPS_PER_FRAME) {
    step(w);
    loop.acc -= STEP_SECONDS;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) loop.acc = Math.min(loop.acc, STEP_SECONDS);
  loop.alpha = Math.min(1, Math.max(0, loop.acc / STEP_SECONDS));
  return steps;
}
