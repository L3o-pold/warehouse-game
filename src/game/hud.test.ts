import { describe, expect, it } from 'vitest';
import { newGame } from '../sim/scenarios';
import { readyWorld } from '../sim/testUtils';
import { makeHud } from './hud';

describe('makeHud', () => {
  it('summarises a new game', () => {
    const h = makeHud(newGame('scenario', 1));
    expect(h.cash).toBe(60000);
    expect(h.clock).toBe('Day 1 · 06:00');
    expect(h.offers).toHaveLength(3);
    expect(h.checklist.every((c) => !c.done)).toBe(true);
    expect(h.docks).toEqual([]);
    expect(h.forkliftIds).toBe('fl-1');
    expect(h.onTimePct).toBe(100);
  });
  it('lists docks and ticks the checklist', () => {
    const h = makeHud(readyWorld());
    expect(h.docks.map((d) => [d.label, d.status])).toEqual([
      ['In 1', 'Available'],
      ['Out 1', 'Available'],
    ]);
    expect(h.checklist.slice(0, 2).map((c) => c.done)).toEqual([true, true]);
    expect(h.checklist[4].done).toBe(true);
  });
});
