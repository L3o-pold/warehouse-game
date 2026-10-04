import { describe, expect, it } from 'vitest';
import { newGame } from '../sim/scenarios';
import { advance, loop } from './loop';

describe('advance', () => {
  it('runs 10 sim minutes per real second at 1×', () => {
    const w = newGame('sandbox', 1);
    loop.acc = 0;
    let steps = 0;
    for (let i = 0; i < 10; i++) steps += advance(w, 0.1, 1);
    expect(steps).toBe(10);
    expect(w.minute).toBe(370);
  });
  it('does nothing while paused and caps long frames', () => {
    const w = newGame('sandbox', 1);
    loop.acc = 0;
    expect(advance(w, 1, 0)).toBe(0);
    expect(advance(w, 5, 4)).toBe(10);
  });
});
