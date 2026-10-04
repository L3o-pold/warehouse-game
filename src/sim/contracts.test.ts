import { describe, expect, it } from 'vitest';
import {
  acceptContract, checkContractComplete, completeContract, failContract, generateOffers, makeOffer, stockByProduct, updateContracts,
} from './contracts';
import { applyCommand } from './commands';
import { attachPallet, createPallet } from './pallets';
import { scheduleTruck } from './trucks';
import { createWorld } from './world';
import { must, readyWorld, testContract } from './testUtils';

describe('offers', () => {
  it('generates day-1 sized offers that expire after 12h', () => {
    const w = createWorld(3, 'scenario');
    generateOffers(w, 3);
    const offers = Object.values(w.contracts);
    expect(offers).toHaveLength(3);
    for (const o of offers) {
      expect(o.status).toBe('offer');
      expect(o.qty).toBeGreaterThanOrEqual(6);
      expect(o.qty).toBeLessThanOrEqual(12);
      expect(o.type).not.toBe('outbound'); // nothing in stock yet
      expect(o.deadline).toBeGreaterThan(o.arriveAt);
    }
    w.minute += 720;
    updateContracts(w);
    expect(Object.keys(w.contracts)).toHaveLength(0);
  });
  it('is deterministic per seed', () => {
    const a = createWorld(9, 'scenario');
    const b = createWorld(9, 'scenario');
    generateOffers(a, 4);
    generateOffers(b, 4);
    expect(Object.values(a.contracts)).toEqual(Object.values(b.contracts));
  });
});

describe('acceptContract', () => {
  it('needs an inbound door for storage', () => {
    const w = createWorld(1, 'scenario');
    const o = makeOffer(w, 'storage');
    w.contracts[o.id] = o;
    expect(acceptContract(w, o.id)).toEqual({ ok: false, reason: 'Build an inbound dock door first' });
  });
  it('schedules inbound trucks with pallets and the pickup truck(s) after the storage period', () => {
    const w = readyWorld();
    const o = makeOffer(w, 'storage');
    o.qty = 25;
    w.contracts[o.id] = o;
    must(applyCommand(w, { type: 'acceptContract', contractId: o.id }));
    const trucks = o.truckIds.map((id) => w.trucks[id]);
    const ins = trucks.filter((t) => t.kind === 'in');
    const outs = trucks.filter((t) => t.kind === 'out');
    expect(ins.map((t) => t.palletIds.length)).toEqual([20, 5]);
    expect(ins[1].arriveAt).toBe(o.arriveAt + 30);
    expect(outs.map((t) => t.capacity)).toEqual([20, 5]);
    expect(outs[0].arriveAt).toBe(o.arriveAt + o.storeDays * 1440);
    expect(o.status).toBe('active');
  });
  it('outbound takes stock from a storage contract and shrinks its pickup', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 12, y: 9 }, orient: 'h' }));
    const rackId = Object.keys(w.racks)[0];
    const s = testContract(w, { type: 'storage', product: 'starters', qty: 4 });
    const pickup = scheduleTruck(w, s, 'out', w.minute + 2000, 4);
    for (let slot = 0; slot < 4; slot++) {
      const loc = { kind: 'rack' as const, rackId, slot };
      attachPallet(w, createPallet(w, 'starters', s.id, loc), loc);
    }
    expect(stockByProduct(w)).toEqual({ starters: 4 });
    const o = testContract(w, { type: 'outbound', status: 'offer', product: 'starters', qty: 3 });
    must(acceptContract(w, o.id));
    expect(Object.values(w.pallets).filter((p) => p.contractId === o.id)).toHaveLength(3);
    expect(pickup.capacity).toBe(1);
    expect(s.transferred).toBe(3);
    expect(o.truckIds.map((id) => w.trucks[id].capacity)).toEqual([3]);
    const tooMany = testContract(w, { type: 'outbound', status: 'offer', product: 'starters', qty: 5 });
    expect(acceptContract(w, tooMany.id).ok).toBe(false);
  });
});

describe('completion and failure', () => {
  it('pays in full and adds reputation when on time', () => {
    const w = readyWorld();
    const c = testContract(w, { payout: 5000 });
    const cash = w.cash;
    completeContract(w, c);
    expect(w.cash).toBe(cash + 5000);
    expect(w.reputation).toBe(3.1);
    expect(c.status).toBe('done');
    expect(w.stats.onTime).toBe(1);
  });
  it('applies 10% per started late hour and −0.2★', () => {
    const w = readyWorld();
    const c = testContract(w, { payout: 5000, deadline: w.minute - 61 });
    const cash = w.cash;
    completeContract(w, c);
    expect(w.cash).toBe(cash + 4000);
    expect(w.reputation).toBe(2.8);
    expect(w.stats.late).toBe(1);
  });
  it('completes when only departing outbound trucks remain', () => {
    const w = readyWorld();
    const c = testContract(w, { type: 'crossdock' });
    const t = scheduleTruck(w, c, 'out', w.minute, 2);
    checkContractComplete(w, c);
    expect(c.status).toBe('active');
    t.state = 'departing';
    checkContractComplete(w, c);
    expect(c.status).toBe('done');
  });
  it('fails 10h after the deadline: fee, −0.5★, pallets and trucks removed', () => {
    const w = readyWorld();
    const c = testContract(w, { deadline: w.minute });
    const t = scheduleTruck(w, c, 'in', w.minute + 5, 3);
    const cash = w.cash;
    w.minute += 601;
    updateContracts(w);
    expect(c.status).toBe('failed');
    expect(w.cash).toBe(cash - 2000);
    expect(w.reputation).toBe(2.5);
    expect(w.trucks[t.id]).toBeUndefined();
    expect(Object.keys(w.pallets)).toHaveLength(0);
  });
  it('failContract sends a docked truck away and frees the door', () => {
    const w = readyWorld();
    const c = testContract(w);
    const t = scheduleTruck(w, c, 'in', w.minute, 2);
    const door = Object.values(w.doors)[0];
    t.state = 'docked';
    t.doorId = door.id;
    door.truckId = t.id;
    failContract(w, c);
    expect(t.state).toBe('departing');
    expect(door.truckId).toBeNull();
  });
});
