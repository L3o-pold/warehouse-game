import {
  FAIL_AFTER_LATE_MIN, FAIL_FEE, LATE_PCT_PER_HOUR, OFFERS, OFFER_TTL, REP_FAILED, REP_LATE, REP_ON_TIME, TRUCK_CAPACITY, TRUCK_GAP_MIN,
} from './balance';
import type { CommandResult } from './commands';
import { addReputation, earn, spend } from './economy';
import { cellOf } from './grid';
import { isStoredLoc, removePallet } from './pallets';
import { PRODUCTS, UNLOCKED_PRODUCTS } from './products';
import { int, next, pick } from './rng';
import { scheduleTruck, startDeparture } from './trucks';
import {
  dayOf, fmtMoney, genId, pushEvent, type ClientId, type Contract, type ContractType, type Pallet, type ProductId, type Truck, type Vec2, type World,
} from './world';

export const CLIENTS: ClientId[] = ['Critter Co.', 'Wizards of the West', "Dragon's Hoard Games", 'DeckBazaar'];
const OK: CommandResult = { ok: true };
const fail = (reason: string): CommandResult => ({ ok: false, reason });
const between = (w: World, range: readonly [number, number]) => int(w.rng, range[0], range[1]);

export function eligibleStock(w: World, product?: ProductId): Pallet[] {
  return Object.values(w.pallets)
    .filter((p) => {
      if (!isStoredLoc(p.loc) || (product && p.product !== product)) return false;
      const c = w.contracts[p.contractId];
      if (!c || c.type !== 'storage' || c.status !== 'active') return false;
      return c.truckIds.every((id) => {
        const t = w.trucks[id];
        return !t || t.kind === 'in' || t.state === 'scheduled';
      });
    })
    .sort((a, b) => a.placedAt - b.placedAt);
}

export function stockByProduct(w: World): Partial<Record<ProductId, number>> {
  const s: Partial<Record<ProductId, number>> = {};
  for (const p of eligibleStock(w)) s[p.product] = (s[p.product] ?? 0) + 1;
  return s;
}

function offerQty(w: World): number {
  const t = Math.min(1, Math.max(0, (dayOf(w.minute) - 1) / 6));
  const min = Math.round(OFFERS.qtyDay1[0] + (OFFERS.qtyDay7[0] - OFFERS.qtyDay1[0]) * t);
  const max = Math.round(OFFERS.qtyDay1[1] + (OFFERS.qtyDay7[1] - OFFERS.qtyDay1[1]) * t);
  const repFactor = 0.7 + 0.1 * w.reputation;
  return Math.max(2, Math.round(int(w.rng, min, max) * repFactor));
}

export function makeOffer(w: World, forceType?: ContractType): Contract {
  let qty = offerQty(w);
  const stock = stockByProduct(w);
  const inStock = UNLOCKED_PRODUCTS.filter((p) => (stock[p] ?? 0) >= 2);
  const roll = next(w.rng);
  let type: ContractType = forceType ?? (roll < 0.45 ? 'storage' : roll < 0.8 ? 'crossdock' : 'outbound');
  if (type === 'outbound' && inStock.length === 0) type = 'storage';
  const client = pick(w.rng, CLIENTS);
  const base = {
    id: genId(w, 'ctr'), type, client, qty, rentPerDay: 0, storeDays: 0, offerExpires: w.minute + OFFER_TTL,
    status: 'offer' as const, rush: false, hot: false, truckIds: [], shipped: 0, transferred: 0, completedAt: null, earned: 0,
  };
  if (type === 'storage') {
    const product = pick(w.rng, UNLOCKED_PRODUCTS);
    const arriveAt = w.minute + between(w, OFFERS.storageArriveHours) * 60;
    const storeDays = between(w, OFFERS.storageDays);
    return {
      ...base, product, arriveAt, storeDays, rentPerDay: between(w, OFFERS.storageRent),
      payout: qty * between(w, OFFERS.storageFeePerPallet), deadline: arriveAt + storeDays * 1440 + OFFERS.pickupWindowMin,
    };
  }
  if (type === 'crossdock') {
    const product = pick(w.rng, UNLOCKED_PRODUCTS);
    const arriveAt = w.minute + between(w, OFFERS.crossdockArriveHours) * 60;
    return {
      ...base, product, arriveAt, payout: qty * between(w, OFFERS.crossdockPerPallet), deadline: arriveAt + between(w, OFFERS.crossdockWindowMin),
    };
  }
  const product = pick(w.rng, inStock);
  qty = Math.min(qty, stock[product] ?? 0);
  const arriveAt = w.minute + between(w, OFFERS.outboundArriveHours) * 60;
  const perPallet = Math.round(OFFERS.outboundBase + PRODUCTS[product].value * OFFERS.outboundValuePct);
  return { ...base, product, qty, arriveAt, payout: qty * perPallet, deadline: arriveAt + OFFERS.pickupWindowMin };
}

export function generateOffers(w: World, count: number): void {
  for (let i = 0; i < count; i++) {
    const c = makeOffer(w);
    w.contracts[c.id] = c;
  }
  pushEvent(w, 'toast', `${count} new contract offers`);
}

export function canAcceptContract(w: World, c: Contract): CommandResult {
  if (c.status !== 'offer') return fail('Offer no longer available');
  const doors = Object.values(w.doors);
  if (c.type !== 'outbound' && !doors.some((d) => d.kind === 'in')) return fail('Build an inbound dock door first');
  if (c.type !== 'storage' && !doors.some((d) => d.kind === 'out')) return fail('Build an outbound dock door first');
  if (c.type === 'outbound' && eligibleStock(w, c.product).length < c.qty) return fail(`Not enough ${PRODUCTS[c.product].name} in stock`);
  return OK;
}

const chunks = (n: number): number[] => {
  const out: number[] = [];
  for (let left = n; left > 0; left -= TRUCK_CAPACITY) out.push(Math.min(TRUCK_CAPACITY, left));
  return out;
};

function shrinkStorage(w: World, src: Contract, n: number): void {
  src.transferred += n;
  let left = n;
  const outs = src.truckIds
    .map((id) => w.trucks[id])
    .filter((t): t is Truck => !!t && t.kind === 'out' && t.state === 'scheduled');
  for (let i = outs.length - 1; i >= 0 && left > 0; i--) {
    const t = outs[i];
    const k = Math.min(left, t.capacity);
    t.capacity -= k;
    left -= k;
    if (t.capacity === 0) {
      delete w.trucks[t.id];
      src.truckIds = src.truckIds.filter((id) => id !== t.id);
    }
  }
}

export function acceptContract(w: World, id: string): CommandResult {
  const c = w.contracts[id];
  if (!c) return fail('Offer no longer available');
  const check = canAcceptContract(w, c);
  if (!check.ok) return check;
  if (c.arriveAt < w.minute + 60) {
    const shift = w.minute + 60 - c.arriveAt;
    c.arriveAt += shift;
    c.deadline += shift;
  }
  if (c.type === 'outbound') {
    for (const p of eligibleStock(w, c.product).slice(0, c.qty)) {
      const src = w.contracts[p.contractId];
      p.contractId = c.id;
      shrinkStorage(w, src, 1);
    }
  } else {
    chunks(c.qty).forEach((k, i) => scheduleTruck(w, c, 'in', c.arriveAt + i * TRUCK_GAP_MIN, k));
  }
  const outAt =
    c.type === 'storage' ? c.arriveAt + c.storeDays * 1440 : c.type === 'crossdock' ? c.arriveAt + OFFERS.outTruckDelayMin : c.arriveAt;
  chunks(c.qty).forEach((k, i) => scheduleTruck(w, c, 'out', outAt + i * TRUCK_GAP_MIN, k));
  c.status = 'active';
  pushEvent(w, 'toast', `Accepted ${c.client}: ${c.qty} × ${PRODUCTS[c.product].name}`);
  return OK;
}

export function toggleRush(w: World, id: string): CommandResult {
  const c = w.contracts[id];
  if (!c || c.status !== 'active') return fail('Only active contracts can be rushed');
  c.rush = !c.rush;
  return OK;
}

export function completeContract(w: World, c: Contract, at?: Vec2): void {
  const late = w.minute > c.deadline ? Math.ceil((w.minute - c.deadline) / 60) : 0;
  const amount = Math.round(c.payout * Math.max(0, 1 - LATE_PCT_PER_HOUR * late));
  earn(w, amount);
  c.earned += amount;
  c.status = 'done';
  c.completedAt = w.minute;
  if (late) {
    w.stats.late++;
    addReputation(w, REP_LATE);
  } else {
    w.stats.onTime++;
    addReputation(w, REP_ON_TIME);
  }
  pushEvent(w, 'payout', `${c.client} paid ${fmtMoney(amount)}${late ? ` (${late}h late)` : ''}`, { amount, at });
}

export function checkContractComplete(w: World, c: Contract): void {
  if (c.status !== 'active') return;
  const remaining = c.truckIds.map((id) => w.trucks[id]).filter((t): t is Truck => !!t);
  if (remaining.every((t) => t.kind === 'out' && t.state === 'departing')) {
    const last = remaining.at(-1);
    completeContract(w, c, last ? cellOf(last.pos) : undefined);
  }
}

export function failContract(w: World, c: Contract): void {
  c.status = 'failed';
  spend(w, FAIL_FEE);
  addReputation(w, REP_FAILED);
  w.stats.failed++;
  for (const p of Object.values(w.pallets)) if (p.contractId === c.id) removePallet(w, p.id);
  for (const id of c.truckIds) {
    const t = w.trucks[id];
    if (!t) continue;
    if (t.state === 'docking' || t.state === 'docked') startDeparture(w, t);
    else if (t.state !== 'departing') {
      if (t.doorId && w.doors[t.doorId]?.truckId === t.id) w.doors[t.doorId].truckId = null;
      delete w.trucks[id];
    }
  }
  pushEvent(w, 'alert', `Contract with ${c.client} failed: −${fmtMoney(FAIL_FEE)} and −0.5★`);
}

export function updateContracts(w: World): void {
  for (const c of Object.values(w.contracts)) {
    if (c.status === 'offer' && w.minute >= c.offerExpires) delete w.contracts[c.id];
    else if (c.status === 'active' && w.minute > c.deadline + FAIL_AFTER_LATE_MIN) failContract(w, c);
  }
}
