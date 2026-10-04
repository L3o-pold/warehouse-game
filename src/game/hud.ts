import { canAcceptContract } from '../sim/contracts';
import { netWorth } from '../sim/economy';
import { isStoredLoc } from '../sim/pallets';
import { PRODUCTS, UNLOCKED_PRODUCTS } from '../sim/products';
import {
  clockLabel, dayOf, type ClientId, type Contract, type ContractStatus, type ContractType, type DoorKind, type ForkliftState,
  type JobType, type Mode, type ProductId, type Stats, type TruckState, type World,
} from '../sim/world';
import { forkliftLabel } from '../ui/format';

export interface DockRow { id: string; label: string; kind: DoorKind; truckId: string | null; client: ClientId | null; status: 'Available' | 'Reserved' | 'Docking' | 'Unloading' | 'Loading'; done: number; total: number }
export interface ForkliftRow { id: string; label: string; state: ForkliftState; status: string; detail: string; fast: boolean; warn: boolean }
export interface TruckRow { id: string; client: ClientId; kind: DoorKind; state: TruckState; door: string | null; status: string; done: number; total: number; arriveAt: number; contractId: string }
export interface ContractRow {
  id: string; type: ContractType; client: ClientId; product: ProductId; productName: string; qty: number; payout: number;
  arriveAt: number; deadline: number; offerExpires: number; status: ContractStatus; rush: boolean; hot: boolean; done: number;
  rentPerDay: number; storeDays: number; earned: number; blocker: string | null;
}
export interface InventoryRow { product: ProductId; name: string; count: number }
export interface Hud {
  minute: number; clock: string; day: number; mode: Mode;
  cash: number; netWorth: number; reputation: number;
  stock: number; capacity: number; inventory: InventoryRow[];
  trucksOnSite: number; inboundArriving: number; onTimePct: number;
  docks: DockRow[]; forklifts: ForkliftRow[]; trucks: TruckRow[];
  offers: ContractRow[]; active: ContractRow[]; history: ContractRow[];
  gridVersion: number; forkliftIds: string; truckIds: string; doorIds: string; rackIds: string;
  buildingReady: boolean; constructing: boolean;
  checklist: { label: string; done: boolean }[];
  stats: Stats; outcome: World['outcome']; outcomeReason: string;
}

const JOB_VERB: Record<JobType, string> = { UNLOAD: 'Unloading', PUTAWAY: 'Putting away', LOAD: 'Loading', CROSSDOCK: 'Cross-docking' };
const TRUCK_STATUS: Record<TruckState, string> = {
  scheduled: 'Scheduled', queued: 'Waiting for door', driving: 'En route', docking: 'Docking', docked: '', departing: 'Departing',
};

export function makeHud(w: World): Hud {
  const counts: Record<string, { onIn: number; onOut: number; other: number }> = {};
  const inventory: Record<string, number> = {};
  let stock = 0;
  for (const p of Object.values(w.pallets)) {
    const c = (counts[p.contractId] ??= { onIn: 0, onOut: 0, other: 0 });
    if (p.loc.kind === 'truck') {
      const t = w.trucks[p.loc.truckId];
      if (t?.kind === 'in') c.onIn++;
      else c.onOut++;
    } else c.other++;
    if (isStoredLoc(p.loc)) {
      stock++;
      inventory[p.product] = (inventory[p.product] ?? 0) + 1;
    }
  }
  const contractRow = (c: Contract): ContractRow => {
    const k = counts[c.id] ?? { onIn: 0, onOut: 0, other: 0 };
    // Every pallet exists from acceptance, so storage progress = pallets no longer waiting on an inbound truck.
    const done = c.type === 'storage' ? c.qty - c.transferred - k.onIn : k.onOut + c.shipped;
    const blocker = c.status === 'offer' ? (() => {
      const r = canAcceptContract(w, c);
      return r.ok ? null : r.reason;
    })() : null;
    return {
      id: c.id, type: c.type, client: c.client, product: c.product, productName: PRODUCTS[c.product].name, qty: c.qty, payout: c.payout,
      arriveAt: c.arriveAt, deadline: c.deadline, offerExpires: c.offerExpires, status: c.status, rush: c.rush, hot: c.hot,
      done: c.status === 'offer' ? 0 : Math.max(0, done), rentPerDay: c.rentPerDay, storeDays: c.storeDays, earned: c.earned, blocker,
    };
  };
  const doors = Object.values(w.doors).sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === 'in' ? -1 : 1));
  const docks: DockRow[] = doors.map((d) => {
    const t = d.truckId ? w.trucks[d.truckId] : undefined;
    let status: DockRow['status'] = 'Available';
    if (t) status = t.state === 'docked' ? (t.kind === 'in' ? 'Unloading' : 'Loading') : t.state === 'docking' ? 'Docking' : 'Reserved';
    const total = t ? t.capacity : 0;
    const done = t ? (t.kind === 'in' ? t.capacity - t.palletIds.length : t.palletIds.length) : 0;
    return { id: d.id, label: d.label, kind: d.kind, truckId: t?.id ?? null, client: t?.client ?? null, status, done, total };
  });
  const forklifts: ForkliftRow[] = Object.values(w.forklifts).map((f) => {
    const job = f.jobId ? w.jobs[f.jobId] : undefined;
    const p = job ? w.pallets[job.palletId] : undefined;
    const status =
      f.state === 'broken' ? 'Broken' : f.state === 'parked' ? 'Parked' : f.state === 'idle' ? 'Idle' : f.state === 'moving' ? 'Moving' : 'Working';
    const detail = job && p ? `${JOB_VERB[job.type]} ${PRODUCTS[p.product].name}` : f.state === 'parked' ? 'Waiting for a warehouse' : '';
    return { id: f.id, label: forkliftLabel(f.id), state: f.state, status, detail, fast: f.fast, warn: f.state === 'broken' || f.blockedUntil > w.minute };
  });
  const trucks: TruckRow[] = Object.values(w.trucks)
    .sort((a, b) => a.arriveAt - b.arriveAt)
    .map((t) => ({
      id: t.id, client: t.client, kind: t.kind, state: t.state, door: t.doorId ? (w.doors[t.doorId]?.label ?? null) : null,
      status: t.state === 'docked' ? (t.kind === 'in' ? 'Unloading' : 'Loading') : TRUCK_STATUS[t.state],
      done: t.kind === 'in' ? t.capacity - t.palletIds.length : t.palletIds.length, total: t.capacity, arriveAt: t.arriveAt, contractId: t.contractId,
    }));
  const contracts = Object.values(w.contracts);
  const parts = w.parts.filter((p) => p.readyAt <= w.minute);
  const big = parts.some((p) => Math.max(p.rect.w, p.rect.h) >= 12 && Math.min(p.rect.w, p.rect.h) >= 8);
  const s = w.stats;
  const finished = s.onTime + s.late + s.failed;
  return {
    minute: w.minute, clock: clockLabel(w.minute), day: dayOf(w.minute), mode: w.mode,
    cash: w.cash, netWorth: netWorth(w), reputation: w.reputation,
    stock, capacity: Object.keys(w.racks).length * 4 + Object.keys(w.staging).length,
    inventory: UNLOCKED_PRODUCTS.map((p) => ({ product: p, name: PRODUCTS[p].name, count: inventory[p] ?? 0 })),
    trucksOnSite: trucks.filter((t) => t.state !== 'scheduled').length,
    inboundArriving: trucks.filter((t) => t.kind === 'in' && (t.state === 'queued' || t.state === 'driving' || t.state === 'docking')).length,
    onTimePct: finished ? Math.round((s.onTime / finished) * 1000) / 10 : 100,
    docks, forklifts, trucks,
    offers: contracts.filter((c) => c.status === 'offer').sort((a, b) => Number(b.hot) - Number(a.hot) || a.offerExpires - b.offerExpires).map(contractRow),
    active: contracts.filter((c) => c.status === 'active').sort((a, b) => a.deadline - b.deadline).map(contractRow),
    history: contracts.filter((c) => c.status === 'done' || c.status === 'failed').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)).slice(0, 5).map(contractRow),
    gridVersion: w.gridVersion,
    forkliftIds: Object.keys(w.forklifts).join(','), truckIds: Object.keys(w.trucks).join(','),
    doorIds: Object.keys(w.doors).join(','), rackIds: Object.keys(w.racks).join(','),
    buildingReady: parts.length > 0, constructing: w.parts.some((p) => p.readyAt > w.minute),
    checklist: [
      { label: 'Build a warehouse of at least 12×8', done: big },
      { label: 'Add an inbound door', done: doors.some((d) => d.kind === 'in') },
      { label: 'Place 4 racks', done: Object.keys(w.racks).length >= 4 },
      { label: 'Accept a contract', done: contracts.some((c) => c.status !== 'offer') },
      { label: 'Add an outbound door', done: doors.some((d) => d.kind === 'out') },
      { label: 'Complete your first contract', done: s.onTime + s.late > 0 },
    ],
    stats: { ...s }, outcome: w.outcome, outcomeReason: w.outcomeReason,
  };
}
