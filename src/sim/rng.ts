export interface Rng {
  state: number;
}

export const createRng = (seed: number): Rng => ({ state: seed >>> 0 });

/** mulberry32: returns a float in [0, 1). Mutates r.state. */
export function next(r: Rng): number {
  r.state = (r.state + 0x6d2b79f5) >>> 0;
  let t = r.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const int = (r: Rng, min: number, max: number): number => min + Math.floor(next(r) * (max - min + 1));
export const pick = <T,>(r: Rng, arr: readonly T[]): T => arr[Math.floor(next(r) * arr.length)];
export const chance = (r: Rng, p: number): boolean => next(r) < p;
