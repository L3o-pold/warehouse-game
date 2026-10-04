import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import { runMidnight } from './economy';
import { rollEvent } from './events';
import { attachPallet, createPallet } from './pallets';
import { checkOutcome, newGame } from './scenarios';
import { runFor } from './tick';
import { scheduleTruck } from './trucks';
import { must, readyWorld, testContract } from './testUtils';

describe('runMidnight', () => {
  it('earns rent and pays wages and upkeep', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeStaging', cell: { x: 12, y: 12 } }));
    must(applyCommand(w, { type: 'placeStaging', cell: { x: 13, y: 12 } }));
    const c = testContract(w, { rentPerDay: 40 });
    for (const x of [12, 13]) {
      const loc = { kind: 'staging' as const, cell: { x, y: 12 } };
      attachPallet(w, createPallet(w, 'boxes', c.id, loc), loc);
    }
    const cash = w.cash;
    runMidnight(w);
    expect(w.cash).toBe(cash + 80 - 300 - 140 * 15);
  });
});

describe('rollEvent', () => {
  it('produces each kind of event over time', () => {
    const w = readyWorld();
    const c = testContract(w);
    const texts: string[] = [];
    for (let h = 0; h < 400; h++) {
      w.minute += 60;
      scheduleTruck(w, c, 'in', w.minute + 120, 0);
      for (const f of Object.values(w.forklifts)) if (f.state === 'broken') f.state = 'idle';
      const before = w.events.length;
      rollEvent(w);
      texts.push(...w.events.slice(before).map((e) => e.text));
    }
    expect(texts.some((t) => t.includes('early'))).toBe(true);
    expect(texts.some((t) => t.includes('broke down'))).toBe(true);
    expect(texts.some((t) => t.startsWith('Rush order'))).toBe(true);
    expect(Object.values(w.contracts).some((x) => x.hot && x.status === 'offer')).toBe(true);
  });
});

describe('checkOutcome', () => {
  it('wins on net worth and reputation in scenario mode only', () => {
    const w = newGame('scenario', 1);
    w.cash = 300000;
    w.reputation = 4;
    checkOutcome(w);
    expect(w.outcome).toBe('won');
    const s = newGame('sandbox', 1);
    s.cash = 300000;
    s.reputation = 4;
    checkOutcome(s);
    expect(s.outcome).toBeNull();
  });
  it('loses after a full day below −$20k', () => {
    const w = newGame('scenario', 1);
    w.cash = -25000;
    checkOutcome(w);
    expect(w.outcome).toBeNull();
    w.minute += 1440;
    checkOutcome(w);
    expect(w.outcome).toBe('lost');
  });
  it('loses when Day 7 ends', () => {
    const w = newGame('scenario', 1);
    w.minute = 7 * 1440;
    checkOutcome(w);
    expect(w.outcome).toBe('lost');
  });
});

describe('step', () => {
  it('finishes construction and activates the starter forklift', () => {
    const w = newGame('scenario', 1);
    must(applyCommand(w, { type: 'buildFootprint', rect: { x: 10, y: 6, w: 12, h: 8 } }));
    runFor(w, 120);
    expect(w.forklifts['fl-1'].state).toBe('idle');
    expect(w.events.some((e) => e.text === 'Construction complete')).toBe(true);
  });
  it('posts new offers every day at 06:00', () => {
    const w = newGame('sandbox', 1);
    runFor(w, 1440);
    expect(w.events.filter((e) => e.text.endsWith('new contract offers') && e.minute === 1800)).toHaveLength(1);
  });
});
