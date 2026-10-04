import { describe, expect, it } from 'vitest';
import { createRng, int, next } from './rng';
import { clockLabel, createWorld, dayOf, fmtMoney, genId, pushEvent } from './world';
import { PRODUCTS, UNLOCKED_PRODUCTS } from './products';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = [next(a), next(a), next(a)];
    expect([next(b), next(b), next(b)]).toEqual(xs);
  });
  it('keeps int() inside the range', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = int(r, 3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});

describe('createWorld', () => {
  it('starts with the spec values', () => {
    const w = createWorld(1, 'scenario');
    expect(w.cash).toBe(60000);
    expect(w.reputation).toBe(3);
    expect(w.minute).toBe(360);
    expect(Object.keys(w.forklifts)).toEqual(['fl-1']);
    expect(w.forklifts['fl-1'].state).toBe('parked');
    expect(w.assetValue).toBe(8000);
  });
  it('formats the clock and money', () => {
    expect(clockLabel(360)).toBe('Day 1 · 06:00');
    expect(dayOf(1440 * 2 + 5)).toBe(3);
    expect(fmtMoney(12345)).toBe('$12,345');
    expect(fmtMoney(-2000)).toBe('−$2,000');
  });
  it('generates unique ids and caps the event log', () => {
    const w = createWorld(1, 'sandbox');
    expect(genId(w, 'rack')).not.toBe(genId(w, 'rack'));
    for (let i = 0; i < 100; i++) pushEvent(w, 'toast', `e${i}`);
    expect(w.events.length).toBe(60);
    expect(w.events[59].text).toBe('e99');
  });
});

describe('products', () => {
  it('is a TCG catalogue with the handling rules', () => {
    expect(PRODUCTS.slabs.locked).toBe(true);
    expect(PRODUCTS.playmats.heavy).toBe(true);
    expect(PRODUCTS.collector.fragile).toBe(true);
    expect(UNLOCKED_PRODUCTS).toEqual(['starters', 'playmats', 'collector', 'boosters', 'sleeves']);
    expect(PRODUCTS.boosters.name).toBe('Pocket Critters Booster Display');
  });
});
