import { describe, expect, it } from 'vitest';
import { interp, lerpAngle, popScale } from './anim';

describe('anim helpers', () => {
  it('interpolates positions', () => {
    expect(interp({ x: 0, y: 0 }, { x: 2, y: 4 }, 0.5)).toEqual({ x: 1, y: 2 });
  });
  it('turns the short way round', () => {
    const r = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(Math.abs(r) - Math.PI)).toBeLessThan(1e-9);
  });
  it('pops pallets in with a small overshoot then settles at 1', () => {
    expect(popScale(0)).toBeLessThan(0.2);
    expect(popScale(0.8)).toBeGreaterThan(1);
    expect(popScale(5)).toBe(1);
  });
});
