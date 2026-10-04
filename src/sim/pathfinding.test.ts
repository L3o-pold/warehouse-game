import { describe, expect, it } from 'vitest';
import { findPath } from './pathfinding';

const open = (w: number, h: number) => (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

describe('findPath', () => {
  it('returns [] when already at a goal', () => {
    expect(findPath({ x: 1, y: 1 }, [{ x: 1, y: 1 }], open(5, 5))).toEqual([]);
  });
  it('finds a straight path excluding the start', () => {
    expect(findPath({ x: 0, y: 0 }, [{ x: 3, y: 0 }], open(5, 5))).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
  });
  it('detours around a wall', () => {
    const walk = (x: number, y: number) => open(5, 5)(x, y) && !(x === 2 && y < 4);
    const p = findPath({ x: 0, y: 0 }, [{ x: 4, y: 0 }], walk)!;
    expect(p.at(-1)).toEqual({ x: 4, y: 0 });
    expect(p).toContainEqual({ x: 2, y: 4 });
    expect(p.length).toBe(12);
  });
  it('returns null when unreachable', () => {
    const walk = (x: number, y: number) => open(5, 5)(x, y) && x !== 2;
    expect(findPath({ x: 0, y: 0 }, [{ x: 4, y: 0 }], walk)).toBeNull();
  });
  it('picks the nearest of several goals', () => {
    const p = findPath({ x: 0, y: 0 }, [{ x: 4, y: 4 }, { x: 0, y: 2 }], open(5, 5))!;
    expect(p.at(-1)).toEqual({ x: 0, y: 2 });
  });
  it('avoids blocked cells but may still end on a blocked goal', () => {
    const p = findPath({ x: 0, y: 0 }, [{ x: 2, y: 0 }], open(5, 5), new Set(['1,0', '2,0']))!;
    expect(p).not.toContainEqual({ x: 1, y: 0 });
    expect(p.at(-1)).toEqual({ x: 2, y: 0 });
  });
});
