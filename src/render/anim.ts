import type { Vec2 } from '../sim/world';

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function lerpAngle(a: number, b: number, t: number): number {
  const d = ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return a + d * t;
}

export const interp = (prev: Vec2, pos: Vec2, alpha: number): Vec2 => ({ x: lerp(prev.x, pos.x, alpha), y: lerp(prev.y, pos.y, alpha) });

const states = new Map<string, { heading: number; forkY: number }>();
/** Smoothed per-entity render values shared between Forklift and PalletInstances. */
export function renderState(id: string): { heading: number; forkY: number } {
  let s = states.get(id);
  if (!s) {
    s = { heading: 0, forkY: 0.06 };
    states.set(id, s);
  }
  return s;
}

/** Scale for a pallet that appeared `age` in-game minutes ago: eases from ~0 to 1 with overshoot. */
export function popScale(age: number): number {
  if (age >= 1.5) return 1;
  const t = Math.max(0, age) / 1.5;
  const c = 1.70158 * 1.4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}
