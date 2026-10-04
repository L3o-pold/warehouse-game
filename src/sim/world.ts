import { createRng, type Rng } from './rng';
import { COST, LOT_H, LOT_W, MAX_EVENTS, MIN_PER_DAY, START_CASH, START_MINUTE, START_REP } from './balance';

export type Vec2 = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Dir = 'N' | 'S' | 'E' | 'W';
export type ProductId = 'starters' | 'playmats' | 'collector' | 'boosters' | 'sleeves' | 'slabs';
export type ContractType = 'storage' | 'outbound' | 'crossdock';
export type ClientId = 'Critter Co.' | 'Wizards of the West' | "Dragon's Hoard Games" | 'DeckBazaar';
export type Mode = 'scenario' | 'sandbox';
export type DoorKind = 'in' | 'out';

export interface BuildingPart {
  rect: Rect;
  readyAt: number;
}

export interface Door {
  id: string;
  label: string;
  cell: Vec2;
  facing: Dir;
  kind: DoorKind;
  truckId: string | null;
}

/** slots[0], slots[1] = level 0 at cells[0], cells[1]; slots[2], slots[3] = level 1 at cells[0], cells[1]. */
export interface Rack {
  id: string;
  cells: [Vec2, Vec2];
  slots: (string | null)[];
}

export type PalletLoc =
  | { kind: 'truck'; truckId: string }
  | { kind: 'rack'; rackId: string; slot: number }
  | { kind: 'staging'; cell: Vec2 }
  | { kind: 'floor'; cell: Vec2 }
  | { kind: 'forklift'; forkliftId: string };

export interface Pallet {
  id: string;
  product: ProductId;
  contractId: string;
  loc: PalletLoc;
  placedAt: number;
}

export type ForkliftState = 'parked' | 'idle' | 'toPickup' | 'lifting' | 'toDrop' | 'dropping' | 'moving' | 'broken';

export interface Forklift {
  id: string;
  pos: Vec2;
  prev: Vec2;
  heading: number;
  path: Vec2[];
  goals: Vec2[];
  state: ForkliftState;
  jobId: string | null;
  carrying: string | null;
  timer: number;
  fast: boolean;
  brokenUntil: number;
  waited: number;
  blockedUntil: number;
  focusTruckId: string | null;
}

export type TruckState = 'scheduled' | 'queued' | 'driving' | 'docking' | 'docked' | 'departing';

export interface Truck {
  id: string;
  client: ClientId;
  contractId: string;
  kind: DoorKind;
  state: TruckState;
  arriveAt: number;
  /** Rear point of the truck; the body extends forward along `heading`. */
  pos: Vec2;
  prev: Vec2;
  heading: number;
  path: Vec2[];
  doorId: string | null;
  palletIds: string[];
  capacity: number;
  timer: number;
  dockFrom: Vec2 | null;
}

export type ContractStatus = 'offer' | 'active' | 'done' | 'failed';

export interface Contract {
  id: string;
  type: ContractType;
  client: ClientId;
  product: ProductId;
  qty: number;
  payout: number;
  rentPerDay: number;
  arriveAt: number;
  storeDays: number;
  deadline: number;
  offerExpires: number;
  status: ContractStatus;
  rush: boolean;
  hot: boolean;
  truckIds: string[];
  shipped: number;
  transferred: number;
  completedAt: number | null;
  earned: number;
}

export type JobType = 'UNLOAD' | 'PUTAWAY' | 'LOAD' | 'CROSSDOCK';
export type JobDest =
  | { kind: 'rack'; rackId: string; slot: number }
  | { kind: 'staging'; cell: Vec2 }
  | { kind: 'floor'; cell: Vec2 }
  | { kind: 'truck'; truckId: string };

export interface Job {
  id: string;
  type: JobType;
  palletId: string;
  forkliftId: string | null;
  dest: JobDest | null;
  manual: boolean;
}

export type GameEventKind = 'toast' | 'payout' | 'alert';
export interface GameEvent {
  id: number;
  minute: number;
  kind: GameEventKind;
  text: string;
  amount?: number;
  at?: Vec2;
}

export interface Stats {
  onTime: number;
  late: number;
  failed: number;
  revenue: number;
  expenses: number;
  palletsHandled: number;
}

export interface World {
  seed: number;
  rng: Rng;
  mode: Mode;
  minute: number;
  cash: number;
  reputation: number;
  /** Sum of purchase prices of everything owned (structures + forklifts + upgrades). */
  assetValue: number;
  parts: BuildingPart[];
  doors: Record<string, Door>;
  racks: Record<string, Rack>;
  staging: Record<string, Vec2>;
  pallets: Record<string, Pallet>;
  /** cellKey → pallet id for pallets on staging or floor cells. */
  cellPallets: Record<string, string>;
  forklifts: Record<string, Forklift>;
  trucks: Record<string, Truck>;
  contracts: Record<string, Contract>;
  jobs: Record<string, Job>;
  /** reservation key → job id. Keys: `r:<rackId>:<slot>` and `c:<x>,<y>`. */
  reservations: Record<string, string>;
  grid: Uint8Array;
  gridVersion: number;
  nextId: number;
  events: GameEvent[];
  nextEventId: number;
  stats: Stats;
  negativeSince: number | null;
  lastFullAlert: number;
  outcome: null | 'won' | 'lost';
  outcomeReason: string;
}

export const DIRS: Record<Dir, Vec2> = { N: { x: 0, y: -1 }, S: { x: 0, y: 1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 } };
export const dirAngle = (d: Dir): number => Math.atan2(DIRS[d].y, DIRS[d].x);
export const cellKey = (c: Vec2): string => `${c.x},${c.y}`;

export function genId(w: World, prefix: string): string {
  return `${prefix}-${w.nextId++}`;
}

export function pushEvent(w: World, kind: GameEventKind, text: string, extra: { amount?: number; at?: Vec2 } = {}): void {
  w.events.push({ id: w.nextEventId++, minute: w.minute, kind, text, ...extra });
  if (w.events.length > MAX_EVENTS) w.events.splice(0, w.events.length - MAX_EVENTS);
}

export const dayOf = (minute: number): number => Math.floor(minute / MIN_PER_DAY) + 1;
const pad2 = (n: number) => String(n).padStart(2, '0');
export const clockLabel = (minute: number): string =>
  `Day ${dayOf(minute)} · ${pad2(Math.floor((minute % MIN_PER_DAY) / 60))}:${pad2(minute % 60)}`;
export const fmtMoney = (n: number): string => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

export function newForklift(id: string, pos: Vec2, state: ForkliftState): Forklift {
  return {
    id, pos: { ...pos }, prev: { ...pos }, heading: 0, path: [], goals: [], state, jobId: null, carrying: null,
    timer: 0, fast: false, brokenUntil: 0, waited: 0, blockedUntil: 0, focusTruckId: null,
  };
}

export function createWorld(seed: number, mode: Mode): World {
  const w: World = {
    seed, rng: createRng(seed), mode, minute: START_MINUTE, cash: START_CASH, reputation: START_REP,
    assetValue: COST.forklift, parts: [], doors: {}, racks: {}, staging: {}, pallets: {}, cellPallets: {},
    forklifts: {}, trucks: {}, contracts: {}, jobs: {}, reservations: {},
    grid: new Uint8Array(LOT_W * LOT_H), gridVersion: 0, nextId: 2, events: [], nextEventId: 1,
    stats: { onTime: 0, late: 0, failed: 0, revenue: 0, expenses: 0, palletsHandled: 0 },
    negativeSince: null, lastFullAlert: -Infinity, outcome: null, outcomeReason: '',
  };
  w.forklifts['fl-1'] = newForklift('fl-1', { x: 1, y: LOT_H - 2 }, 'parked');
  return w;
}
