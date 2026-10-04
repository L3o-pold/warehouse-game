# WareTrack Tycoon — Warehouse Sim Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable browser demo of a single-warehouse logistics tycoon: draw a warehouse, add docks/racks/forklifts, accept contracts, watch trucks and forklifts work, override them RTS-style, and win the 7-day "First Lot" scenario (or play sandbox).

**Architecture:** A deterministic pure-TypeScript simulation (`src/sim/`) advances in fixed 1-in-game-minute steps and is mutated only through commands. React Three Fiber (`src/render/`) reads the world every frame and interpolates; a Zustand store (`src/game/`) owns the world, drives the loop and publishes a ~5 Hz HUD snapshot to a Tailwind DOM overlay (`src/ui/`).

**Tech Stack:** Vite, React 19, TypeScript (strict), three, @react-three/fiber 9, @react-three/drei 10, Zustand 5, Tailwind CSS 4 (`@tailwindcss/vite`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-warehouse-sim-demo-design.md`

## Global Constraints

- `src/sim/**` must never import from `react`, `three`, `@react-three/*`, or touch the DOM.
- Renderer and UI never mutate `World`; every change goes through `applyCommand` (store `dispatch`).
- All randomness in the sim uses `world.rng` (mulberry32). Same seed + same commands at the same minutes ⇒ identical world.
- Time: 1 sim step = 1 in-game minute; **1 real second = 10 in-game minutes at 1×**; speeds 0 (pause), 1×, 2×, 4×.
- Lot is **40×30** cells (1 cell = 1 m); road rows are y = 30 and 31 (south of the lot). Sim coordinates: integer = cell centre; render maps sim `(x, y)` → three `(x, 0, y)`.
- Start: **$60,000**, **3★**, **1 forklift (parked)**, **Day 1 06:00** (minute 360). Scenario win: **net worth ≥ $250,000 and reputation ≥ 4★ by end of Day 7** (minute 10080). Lose: **cash < −$20,000 for 24 consecutive in-game hours**, or Day 7 ends without winning.
- Prices: cell $250, door $6,000, door toggle $500, rack $1,500, staging $100/cell, forklift $8,000 + $300/day wage, Fast mast $5,000, repair $500, upkeep $15/building cell/day, demolish refunds 50%.
- Products: Cardboard Boxes $400, Spring Water 24-pack $350 (heavy → rack level 0 only), LED Panel 60×60 $2,200 (fragile → handling ×1.5), Safety Helmets $900, Packing Tape $300, Frozen Goods locked.
- Contracts: late penalty 10% of payout per started late hour (cap 100%); on time +0.1★, late −0.2★, failed −0.5★ and $2,000; contract fails 10 in-game hours after its deadline; offers expire after 12 in-game hours.
- Commands are applied **immediately** when dispatched (also while paused); they are deterministic because they are applied between steps. This is a deliberate simplification of the spec's "queued until next tick".
- Visual palette (from spec): blue `#2563EB`, off-white `#F1F5F9`, cardboard `#D9A066`, forklift yellow `#FACC15`, ground `#E2E8F0`, bay yellow `#F5B83D`.
- All tests: `npx vitest run`. Typecheck/build: `npm run build`.

## Review Focus

1. **A truck cannot reach its door** (the player walls in the yard with an expansion, or a door's apron is unreachable from the road): the truck must stay queued without crashing and the player gets an alert. Test in Task 6.
2. **The warehouse is completely full** (no rack, staging or floor space) while a truck is unloading: the job stays unassigned, the truck waits, and a "Warehouse full" alert is raised at most once per in-game hour. Test in Task 8.
3. **Demolishing or toggling a door a truck is assigned to, or a rack that holds or expects pallets**: rejected with a clear reason, with no dangling references. Test in Task 5.
4. **Forklifts meeting head-on in a 1-wide aisle, or an idle forklift parked in the only path**: they must nudge or re-plan within a few in-game minutes, never stall forever. Test in Task 9.
5. **A contract fails while a forklift is carrying one of its pallets**: the pallet is removed, the forklift becomes idle and free, and no job or reservation leaks. Test in Task 9.

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, index.html, .gitignore
src/
  main.tsx                 React root
  App.tsx                  menu vs game screen, hotkeys, overlay layout
  index.css                Tailwind import + base styles
  sim/
    balance.ts             every tuning constant
    rng.ts                 seeded mulberry32 helpers
    world.ts               all sim types, createWorld, ids, events, clock helpers
    products.ts            product table
    grid.ts                cell flags, rebuildGrid, walkability, placement validators, connectivity
    pathfinding.ts         A* on a 4-connected grid
    economy.ts             spend/earn/refund, reputation, net worth, midnight costs
    commands.ts            Command union + applyCommand
    pallets.ts             create/attach/detach/remove pallets, reservations, free-cell predicates
    trucks.ts              truck scheduling, door assignment, driving, docking, departure
    contracts.ts           offers, acceptance, completion, failure, stock
    jobs.ts                job generation, destination choice, assignment
    forklifts.ts           forklift movement, handling, blocking, manual orders, breakdowns
    events.ts              random events
    scenarios.ts           newGame, win/lose
    tick.ts                step(world) in fixed order
    testUtils.ts           test helpers (readyWorld, testContract, runMinutes, must)
    *.test.ts              colocated unit tests
  game/
    loop.ts                fixed-timestep accumulator
    hud.ts                 makeHud(world) → plain snapshot for the UI
    store.ts               Zustand store
  input/
    inputState.ts          shared pointer state
    selection.ts           entity click handlers (select / right-click commands)
    buildMode.ts           tool validation + command creation
    hotkeys.ts             keyboard shortcuts hook
  render/
    palette.ts             colours + material cache
    models.tsx             procedural low-poly models
    Scene.tsx              Canvas, lights, composition
    CameraRig.tsx          iso orthographic camera controls
    SimDriver.tsx          advances the sim each frame
    Ground.tsx             ground, lot, road, trees
    GroundInteraction.tsx  clicks on ground: build tools, box select, move orders
    BuildGhost.tsx         placement preview
    Building.tsx           walls, roof, floor, scaffolding
    DockDoor.tsx           door frames, shutters, aprons, labels
    Rack.tsx               rack frames
    PalletInstances.tsx    instanced pallets
    Forklift.tsx           forklift entity
    Truck.tsx              truck entity
    Entities.tsx           mounts per-entity components from HUD id lists
    Effects.tsx            floating payout text + map pins
    SelectionRing.tsx      ground ring
    anim.ts                interpolation helpers
  ui/
    format.ts              money/time/label helpers
    Panel.tsx              shared glass panel + small primitives
    TopBar.tsx, KpiCards.tsx, Inspector.tsx, OpsPanel.tsx, ShipmentTimeline.tsx,
    BuildToolbar.tsx, ContractBoard.tsx, Toasts.tsx, Checklist.tsx,
    ScenarioEndModal.tsx, MainMenu.tsx, BoxSelectOverlay.tsx
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/sim/scaffold.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `npm run dev`, `npm run build`, `npm test` scripts; Tailwind available via `src/index.css`.

- [ ] **Step 1: Write config files**

`package.json`:
```json
{
  "name": "waretrack-tycoon",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WareTrack Tycoon</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`.gitignore`:
```
node_modules
dist
.idea
.DS_Store
*.log
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install react react-dom three @react-three/fiber @react-three/drei zustand
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/three tailwindcss @tailwindcss/vite vitest
```
Expected: installs without peer-dependency errors (R3F 9 requires React 19, which `npm install react` provides).

- [ ] **Step 3: Write the app shell**

`src/index.css`:
```css
@import "tailwindcss";

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --color-brand: #2563eb;
  --color-brand-dark: #1e40af;
  --color-ink: #0f172a;
}

html, body, #root { height: 100%; margin: 0; }
body { background: #dce6f2; color: var(--color-ink); font-family: var(--font-sans); overflow: hidden; user-select: none; }
canvas { touch-action: none; }
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx` (temporary; replaced in Task 12):
```tsx
import { Canvas } from '@react-three/fiber';

export default function App() {
  return (
    <div className="h-full w-full">
      <Canvas camera={{ position: [4, 4, 4] }}>
        <ambientLight />
        <mesh>
          <boxGeometry />
          <meshStandardMaterial color="#2563EB" />
        </mesh>
      </Canvas>
      <div className="pointer-events-none absolute left-4 top-4 rounded-xl bg-white/85 px-4 py-2 font-bold shadow">WareTrack Tycoon</div>
    </div>
  );
}
```

`src/sim/scaffold.test.ts`:
```ts
import { expect, it } from 'vitest';

it('runs the test runner', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 4: Verify**

Run: `npm test` → Expected: 1 passed.
Run: `npm run build` → Expected: exits 0, `dist/` created.
Run: `npm run dev` and open the printed URL → Expected: a blue cube and the "WareTrack Tycoon" label. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + R3F + Tailwind + Vitest"
```

---

### Task 2: Sim foundations (balance, rng, products, world types)

**Files:**
- Create: `src/sim/balance.ts`, `src/sim/rng.ts`, `src/sim/products.ts`, `src/sim/world.ts`, `src/sim/world.test.ts`
- Delete: `src/sim/scaffold.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces (used by every later task):
  - `rng.ts`: `Rng`, `createRng(seed)`, `next(r)`, `int(r, min, max)`, `pick(r, arr)`, `chance(r, p)`
  - `products.ts`: `PRODUCTS: Record<ProductId, Product>`, `UNLOCKED_PRODUCTS: ProductId[]`
  - `world.ts`: all types (`World`, `Vec2`, `Rect`, `Dir`, `Door`, `Rack`, `Pallet`, `PalletLoc`, `Forklift`, `Truck`, `Contract`, `Job`, `JobDest`, …), `createWorld(seed, mode)`, `newForklift(id, pos, state)`, `cellKey(c)`, `genId(w, prefix)`, `pushEvent(w, kind, text, extra?)`, `DIRS`, `dirAngle(d)`, `dayOf(minute)`, `clockLabel(minute)`, `fmtMoney(n)`

- [ ] **Step 1: Write the failing test**

`src/sim/world.test.ts`:
```ts
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
  it('has the spec rules', () => {
    expect(PRODUCTS.frozen.locked).toBe(true);
    expect(PRODUCTS.water.heavy).toBe(true);
    expect(PRODUCTS.led.fragile).toBe(true);
    expect(UNLOCKED_PRODUCTS).not.toContain('frozen');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/world.test.ts`
Expected: FAIL — cannot resolve `./rng`.

- [ ] **Step 3: Implement**

Delete `src/sim/scaffold.test.ts`.

`src/sim/balance.ts`:
```ts
export const LOT_W = 40;
export const LOT_H = 30;
export const ROAD_ROWS = 2;
export const MIN_PER_DAY = 1440;
export const START_MINUTE = 360;
export const SCENARIO_END_MINUTE = 7 * MIN_PER_DAY;

export const COST = {
  cell: 250,
  door: 6000,
  doorToggle: 500,
  rack: 1500,
  staging: 100,
  forklift: 8000,
  fastMast: 5000,
  repair: 500,
} as const;
export const WAGE_PER_FORKLIFT = 300;
export const RUNNING_PER_CELL = 15;
export const BUILD_MINUTES = 120;
export const FOOTPRINT = { minShort: 6, minLong: 8, maxLong: 36, maxShort: 24, minExpansion: 2, minSharedEdge: 2 } as const;
export const DOOR_APRON = 8;
export const TRUCK_STAGE_DIST = 4;
export const DOCK_OFFSET = 0.6;

export const FORKLIFT_SPEED = 0.8;
export const FAST_DRIVE = 1.15;
export const FAST_LIFT = 1.3;
export const HANDLE_MIN = 1;
export const FRAGILE_FACTOR = 1.5;
export const BLOCK_REPLAN_MIN = 3;
export const BLOCKED_MARKER_MIN = 10;

export const TRUCK_SPEED = 1.2;
export const DOCK_MIN = 5;
export const TRUCK_CAPACITY = 20;
export const TRUCK_GAP_MIN = 30;

export const START_CASH = 60000;
export const START_REP = 3;
export const WIN_NET_WORTH = 250000;
export const WIN_REP = 4;
export const LOSE_CASH = -20000;
export const LOSE_MINUTES = 24 * 60;

export const REP_ON_TIME = 0.1;
export const REP_LATE = -0.2;
export const REP_FAILED = -0.5;
export const FAIL_FEE = 2000;
export const LATE_PCT_PER_HOUR = 0.1;
export const FAIL_AFTER_LATE_MIN = 600;
export const OFFER_TTL = 720;
export const HOT_OFFER_TTL = 180;
export const EVENT_CHANCE_PER_HOUR = 1 / 6;
export const BREAKDOWN_MIN = 120;
export const MAX_EVENTS = 60;
export const FULL_ALERT_EVERY_MIN = 60;

/** Contract generation tuning. Ranges are inclusive [min, max]. */
export const OFFERS = {
  qtyDay1: [6, 12],
  qtyDay7: [30, 60],
  storageFeePerPallet: [80, 120],
  storageRent: [30, 50],
  storageDays: [1, 3],
  storageArriveHours: [2, 8],
  crossdockPerPallet: [250, 320],
  crossdockArriveHours: [2, 6],
  crossdockWindowMin: [240, 300],
  outboundBase: 150,
  outboundValuePct: 0.08,
  outboundArriveHours: [3, 8],
  pickupWindowMin: 360,
  outTruckDelayMin: 30,
} as const;
```

`src/sim/rng.ts`:
```ts
export interface Rng {
  state: number;
}

export const createRng = (seed: number): Rng => ({ state: seed >>> 0 });

/** mulberry32: returns a float in [0, 1). Mutates r.state. */
export function next(r: Rng): number {
  r.state = (r.state + 0x6d2b79f5) >>> 0;
  let t = r.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const int = (r: Rng, min: number, max: number): number => min + Math.floor(next(r) * (max - min + 1));
export const pick = <T,>(r: Rng, arr: readonly T[]): T => arr[Math.floor(next(r) * arr.length)];
export const chance = (r: Rng, p: number): boolean => next(r) < p;
```

`src/sim/products.ts`:
```ts
import type { ProductId } from './world';

export interface Product {
  id: ProductId;
  name: string;
  value: number;
  heavy: boolean;
  fragile: boolean;
  locked: boolean;
  color: string;
}

export const PRODUCTS: Record<ProductId, Product> = {
  boxes: { id: 'boxes', name: 'Cardboard Boxes', value: 400, heavy: false, fragile: false, locked: false, color: '#D9A066' },
  water: { id: 'water', name: 'Spring Water 24-pack', value: 350, heavy: true, fragile: false, locked: false, color: '#60A5FA' },
  led: { id: 'led', name: 'LED Panel 60×60', value: 2200, heavy: false, fragile: true, locked: false, color: '#E2E8F0' },
  helmets: { id: 'helmets', name: 'Safety Helmets', value: 900, heavy: false, fragile: false, locked: false, color: '#F59E0B' },
  tape: { id: 'tape', name: 'Packing Tape', value: 300, heavy: false, fragile: false, locked: false, color: '#C08A4B' },
  frozen: { id: 'frozen', name: 'Frozen Goods', value: 1200, heavy: false, fragile: false, locked: true, color: '#67E8F9' },
};

export const UNLOCKED_PRODUCTS: ProductId[] = (Object.keys(PRODUCTS) as ProductId[]).filter((p) => !PRODUCTS[p].locked);
```

`src/sim/world.ts`:
```ts
import { createRng, type Rng } from './rng';
import { COST, LOT_H, LOT_W, MAX_EVENTS, MIN_PER_DAY, START_CASH, START_MINUTE, START_REP } from './balance';

export type Vec2 = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Dir = 'N' | 'S' | 'E' | 'W';
export type ProductId = 'boxes' | 'water' | 'led' | 'helmets' | 'tape' | 'frozen';
export type ContractType = 'storage' | 'outbound' | 'crossdock';
export type ClientId = 'WareTrack' | 'Nordline' | 'Cargoviva' | 'Bluepeak';
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/world.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sim): world types, seeded rng, products, balance constants"
```

---

### Task 3: Grid, walkability and placement validators

**Files:**
- Create: `src/sim/grid.ts`, `src/sim/grid.test.ts`

**Interfaces:**
- Consumes: `world.ts` types/helpers, `balance.ts`
- Produces:
  - flags `F_BUILDING, F_WALL, F_DOOR, F_RACK, F_STAGING, F_FLOOR_PALLET, F_CONSTRUCTION`
  - `inLot(x,y)`, `flagsAt(w,x,y)`, `add(a,b,k?)`, `manhattan(a,b)`, `cellOf(p)`, `forEachCell(rect, fn)`
  - `rebuildGrid(w)`, `isInterior(w,x,y)`, `isForkliftWalkable(w,x,y)`, `isTruckWalkable(w,x,y)`, `walkableNeighbors(w,c)`, `doorInward(door)`, `isDoorInward(w,c)`, `readyCellCount(w)`, `sharedEdge(a,b)`, `rackCells(cell, orient)`
  - `type Check = {ok:true; cost:number} | {ok:false; reason:string}`; `DoorCheck` (adds `facing`); `DemolishCheck` (`refund`, `assetCost`, `target`)
  - `validateFootprint(w, rect)`, `validateDoor(w, cell)`, `validateRack(w, cell, orient)`, `validateStaging(w, cell)`, `validateDemolish(w, cell)`, `isConnected(w, newRackCells?)`, `findSpawnCell(w)`

- [ ] **Step 1: Write the failing test**

`src/sim/grid.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  F_CONSTRUCTION, F_WALL, flagsAt, isConnected, isForkliftWalkable, rebuildGrid, validateDemolish,
  validateDoor, validateFootprint, validateRack, validateStaging, findSpawnCell,
} from './grid';
import { createWorld, type Rect, type World } from './world';

function built(rect: Rect = { x: 10, y: 6, w: 14, h: 10 }): World {
  const w = createWorld(1, 'sandbox');
  w.cash = 1_000_000;
  w.parts.push({ rect, readyAt: w.minute });
  rebuildGrid(w);
  return w;
}

function addDoor(w: World, id: string, x: number, y: number, kind: 'in' | 'out' = 'in') {
  w.doors[id] = { id, label: id, cell: { x, y }, facing: 'S', kind, truckId: null };
  rebuildGrid(w);
}

describe('rebuildGrid', () => {
  it('marks the perimeter as wall and the inside as walkable', () => {
    const w = built();
    expect(flagsAt(w, 10, 6) & F_WALL).toBeTruthy();
    expect(flagsAt(w, 23, 15) & F_WALL).toBeTruthy();
    expect(isForkliftWalkable(w, 11, 7)).toBe(true);
    expect(isForkliftWalkable(w, 10, 10)).toBe(false);
    expect(isForkliftWalkable(w, 5, 5)).toBe(false);
  });
  it('marks unfinished parts as construction, not walkable', () => {
    const w = createWorld(1, 'sandbox');
    w.parts.push({ rect: { x: 0, y: 0, w: 8, h: 6 }, readyAt: w.minute + 120 });
    rebuildGrid(w);
    expect(flagsAt(w, 3, 3) & F_CONSTRUCTION).toBeTruthy();
    expect(isForkliftWalkable(w, 3, 3)).toBe(false);
  });
});

describe('validateFootprint', () => {
  it('accepts a first building and prices it per cell', () => {
    const w = createWorld(1, 'sandbox');
    expect(validateFootprint(w, { x: 10, y: 6, w: 14, h: 10 })).toEqual({ ok: true, cost: 35000 });
  });
  it('rejects too small, too big, outside the lot and unaffordable', () => {
    const w = createWorld(1, 'sandbox');
    expect(validateFootprint(w, { x: 0, y: 0, w: 5, h: 5 }).ok).toBe(false);
    expect(validateFootprint(w, { x: 0, y: 0, w: 38, h: 10 }).ok).toBe(false);
    expect(validateFootprint(w, { x: 35, y: 0, w: 8, h: 6 }).ok).toBe(false);
    w.cash = 100;
    const r = validateFootprint(w, { x: 0, y: 0, w: 8, h: 6 });
    expect(r.ok).toBe(false);
  });
  it('requires expansions to share a wall and not overlap', () => {
    const w = built();
    expect(validateFootprint(w, { x: 12, y: 8, w: 4, h: 4 }).ok).toBe(false);
    expect(validateFootprint(w, { x: 30, y: 20, w: 4, h: 4 }).ok).toBe(false);
    expect(validateFootprint(w, { x: 24, y: 6, w: 6, h: 10 }).ok).toBe(true);
  });
  it('rejects covering a dock apron', () => {
    const w = built();
    addDoor(w, 'd1', 14, 15);
    expect(validateFootprint(w, { x: 12, y: 16, w: 6, h: 4 }).ok).toBe(false);
  });
});

describe('validateDoor', () => {
  it('accepts a straight wall cell with clear yard and reports facing', () => {
    const w = built();
    expect(validateDoor(w, { x: 14, y: 15 })).toEqual({ ok: true, cost: 6000, facing: 'S' });
    expect(validateDoor(w, { x: 10, y: 9 })).toMatchObject({ ok: true, facing: 'W' });
  });
  it('rejects corners, interior cells and walls without 8 cells of yard', () => {
    const w = built();
    expect(validateDoor(w, { x: 10, y: 6 }).ok).toBe(false);
    expect(validateDoor(w, { x: 12, y: 10 }).ok).toBe(false);
    const edge = built({ x: 0, y: 22, w: 8, h: 6 });
    expect(validateDoor(edge, { x: 3, y: 27 }).ok).toBe(false);
  });
});

describe('validateRack and connectivity', () => {
  it('accepts racks inside and rejects walls and door-inward cells', () => {
    const w = built();
    addDoor(w, 'd1', 14, 15);
    expect(validateRack(w, { x: 12, y: 9 }, 'h')).toEqual({ ok: true, cost: 1500 });
    expect(validateRack(w, { x: 10, y: 9 }, 'h').ok).toBe(false);
    expect(validateRack(w, { x: 14, y: 13 }, 'v').ok).toBe(false);
  });
  it('rejects a rack that would cut one door off from the other', () => {
    const w = built();
    addDoor(w, 'd1', 14, 15);
    addDoor(w, 'd2', 20, 15, 'out');
    for (const y of [7, 9, 11]) w.racks[`r${y}`] = { id: `r${y}`, cells: [{ x: 17, y }, { x: 17, y: y + 1 }], slots: [null, null, null, null] };
    rebuildGrid(w);
    expect(isConnected(w)).toBe(true);
    const r = validateRack(w, { x: 17, y: 13 }, 'v');
    expect(r).toEqual({ ok: false, reason: 'That would block forklift access' });
  });
});

describe('validateStaging and validateDemolish', () => {
  it('places staging inside only', () => {
    const w = built();
    expect(validateStaging(w, { x: 12, y: 12 })).toEqual({ ok: true, cost: 100 });
    expect(validateStaging(w, { x: 10, y: 12 }).ok).toBe(false);
  });
  it('refuses to demolish a door with a truck or a rack holding pallets', () => {
    const w = built();
    addDoor(w, 'd1', 14, 15);
    w.doors.d1.truckId = 'TRK-1';
    expect(validateDemolish(w, { x: 14, y: 15 })).toEqual({ ok: false, reason: 'A truck is using this door' });
    w.racks.r1 = { id: 'r1', cells: [{ x: 12, y: 9 }, { x: 13, y: 9 }], slots: ['plt-1', null, null, null] };
    rebuildGrid(w);
    expect(validateDemolish(w, { x: 13, y: 9 })).toEqual({ ok: false, reason: 'Empty the rack first' });
    w.racks.r1.slots[0] = null;
    expect(validateDemolish(w, { x: 13, y: 9 })).toMatchObject({ ok: true, refund: 750, target: { kind: 'rack', id: 'r1' } });
  });
});

describe('findSpawnCell', () => {
  it('prefers the cell inside the first door', () => {
    const w = built();
    expect(findSpawnCell(w)).toEqual({ x: 11, y: 7 });
    addDoor(w, 'd1', 14, 15);
    expect(findSpawnCell(w)).toEqual({ x: 14, y: 14 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/grid.test.ts`
Expected: FAIL — cannot resolve `./grid`.

- [ ] **Step 3: Implement**

`src/sim/grid.ts`:
```ts
import { COST, DOOR_APRON, FOOTPRINT, LOT_H, LOT_W, ROAD_ROWS } from './balance';
import { DIRS, cellKey, fmtMoney, type Dir, type Door, type Rect, type Vec2, type World } from './world';

export const F_BUILDING = 1;
export const F_WALL = 2;
export const F_DOOR = 4;
export const F_RACK = 8;
export const F_STAGING = 16;
export const F_FLOOR_PALLET = 32;
export const F_CONSTRUCTION = 64;

export type Check = { ok: true; cost: number } | { ok: false; reason: string };
export type DoorCheck = { ok: true; cost: number; facing: Dir } | { ok: false; reason: string };
export type DemolishTarget = { kind: 'rack'; id: string } | { kind: 'door'; id: string } | { kind: 'staging'; key: string };
export type DemolishCheck =
  | { ok: true; refund: number; assetCost: number; target: DemolishTarget }
  | { ok: false; reason: string };

const fail = (reason: string) => ({ ok: false as const, reason });
const ALL_DIRS: Dir[] = ['N', 'S', 'E', 'W'];

export const inLot = (x: number, y: number) => x >= 0 && y >= 0 && x < LOT_W && y < LOT_H;
export const flagsAt = (w: World, x: number, y: number) => (inLot(x, y) ? w.grid[y * LOT_W + x] : 0);
export const add = (a: Vec2, b: Vec2, k = 1): Vec2 => ({ x: a.x + b.x * k, y: a.y + b.y * k });
export const manhattan = (a: Vec2, b: Vec2) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const cellOf = (p: Vec2): Vec2 => ({ x: Math.round(p.x), y: Math.round(p.y) });
const same = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;

export function forEachCell(r: Rect, fn: (x: number, y: number) => void): void {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) fn(x, y);
}

export function rebuildGrid(w: World): void {
  const g = w.grid;
  g.fill(0);
  for (const p of w.parts) {
    const f = p.readyAt <= w.minute ? F_BUILDING : F_CONSTRUCTION;
    forEachCell(p.rect, (x, y) => {
      if (inLot(x, y)) g[y * LOT_W + x] |= f;
    });
  }
  for (let y = 0; y < LOT_H; y++) {
    for (let x = 0; x < LOT_W; x++) {
      const i = y * LOT_W + x;
      if (!(g[i] & F_BUILDING)) continue;
      for (const d of ALL_DIRS) {
        const nx = x + DIRS[d].x;
        const ny = y + DIRS[d].y;
        if (!(inLot(nx, ny) && g[ny * LOT_W + nx] & F_BUILDING)) {
          g[i] |= F_WALL;
          break;
        }
      }
    }
  }
  const mark = (c: Vec2, f: number) => {
    if (inLot(c.x, c.y)) g[c.y * LOT_W + c.x] |= f;
  };
  for (const d of Object.values(w.doors)) mark(d.cell, F_DOOR);
  for (const r of Object.values(w.racks)) r.cells.forEach((c) => mark(c, F_RACK));
  for (const c of Object.values(w.staging)) mark(c, F_STAGING);
  for (const p of Object.values(w.pallets)) if (p.loc.kind === 'floor') mark(p.loc.cell, F_FLOOR_PALLET);
  w.gridVersion++;
}

export function isInterior(w: World, x: number, y: number): boolean {
  const f = flagsAt(w, x, y);
  return (f & F_BUILDING) !== 0 && (f & F_WALL) === 0;
}

export function isForkliftWalkable(w: World, x: number, y: number): boolean {
  const f = flagsAt(w, x, y);
  if (!(f & F_BUILDING)) return false;
  if (f & F_WALL && !(f & F_DOOR)) return false;
  return (f & (F_RACK | F_FLOOR_PALLET)) === 0;
}

export function isTruckWalkable(w: World, x: number, y: number): boolean {
  if (x < 0 || x >= LOT_W || y < 0 || y >= LOT_H + ROAD_ROWS) return false;
  return y >= LOT_H || (flagsAt(w, x, y) & (F_BUILDING | F_CONSTRUCTION)) === 0;
}

export function walkableNeighbors(w: World, c: Vec2): Vec2[] {
  return ALL_DIRS.map((d) => add(c, DIRS[d])).filter((n) => isForkliftWalkable(w, n.x, n.y));
}

export const doorInward = (d: Door): Vec2 => add(d.cell, DIRS[d.facing], -1);
export const isDoorInward = (w: World, c: Vec2) => Object.values(w.doors).some((d) => same(doorInward(d), c));

export function readyCellCount(w: World): number {
  return w.parts.filter((p) => p.readyAt <= w.minute).reduce((s, p) => s + p.rect.w * p.rect.h, 0);
}

export function sharedEdge(a: Rect, b: Rect): number {
  if (a.x + a.w === b.x || b.x + b.w === a.x) return Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  if (a.y + a.h === b.y || b.y + b.h === a.y) return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  return 0;
}

function bbox(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

export function validateFootprint(w: World, r: Rect): Check {
  if (r.w < 1 || r.h < 1) return fail('Drag out an area');
  if (r.x < 0 || r.y < 0 || r.x + r.w > LOT_W || r.y + r.h > LOT_H) return fail('Outside the lot');
  const long = Math.max(r.w, r.h);
  const short = Math.min(r.w, r.h);
  if (w.parts.length === 0) {
    if (short < FOOTPRINT.minShort || long < FOOTPRINT.minLong) return fail('Minimum size is 8×6');
    if (long > FOOTPRINT.maxLong || short > FOOTPRINT.maxShort) return fail('Maximum size is 36×24');
  } else {
    if (w.parts.some((p) => p.readyAt > w.minute)) return fail('Wait for construction to finish');
    if (short < FOOTPRINT.minExpansion) return fail('Expansion must be at least 2 cells wide');
    if (!w.parts.some((p) => sharedEdge(p.rect, r) >= FOOTPRINT.minSharedEdge)) return fail('Expansion must share a wall with your warehouse');
    const bb = bbox([...w.parts.map((p) => p.rect), r]);
    if (Math.max(bb.w, bb.h) > FOOTPRINT.maxLong || Math.min(bb.w, bb.h) > FOOTPRINT.maxShort) return fail('Warehouse would exceed 36×24');
  }
  let overlap = false;
  forEachCell(r, (x, y) => {
    if (flagsAt(w, x, y) & (F_BUILDING | F_CONSTRUCTION)) overlap = true;
  });
  if (overlap) return fail('Overlaps your warehouse');
  const inside = (c: Vec2) => c.x >= r.x && c.y >= r.y && c.x < r.x + r.w && c.y < r.y + r.h;
  for (const d of Object.values(w.doors)) {
    for (let k = 1; k <= DOOR_APRON; k++) if (inside(add(d.cell, DIRS[d.facing], k))) return fail('Blocks a dock apron');
  }
  const cost = r.w * r.h * COST.cell;
  if (cost > w.cash) return fail(`Need ${fmtMoney(cost)}`);
  return { ok: true, cost };
}

export function validateDoor(w: World, c: Vec2): DoorCheck {
  const f = flagsAt(w, c.x, c.y);
  if (!(f & F_WALL)) return fail('Doors go on a finished warehouse wall');
  if (f & F_DOOR) return fail('There is already a door here');
  const outs = ALL_DIRS.filter((d) => {
    const n = add(c, DIRS[d]);
    return !(flagsAt(w, n.x, n.y) & F_BUILDING);
  });
  if (outs.length !== 1) return fail('Doors can’t go on corners');
  const facing = outs[0];
  const inward = add(c, DIRS[facing], -1);
  if (!isInterior(w, inward.x, inward.y) || flagsAt(w, inward.x, inward.y) & (F_RACK | F_FLOOR_PALLET)) {
    return fail('The inside of the door must be clear');
  }
  const apron = new Set<string>();
  for (let k = 1; k <= DOOR_APRON; k++) {
    const a = add(c, DIRS[facing], k);
    if (!inLot(a.x, a.y) || flagsAt(w, a.x, a.y) & (F_BUILDING | F_CONSTRUCTION)) return fail('Needs 8 clear cells of yard outside');
    apron.add(cellKey(a));
  }
  for (const d of Object.values(w.doors)) {
    for (let k = 1; k <= DOOR_APRON; k++) if (apron.has(cellKey(add(d.cell, DIRS[d.facing], k)))) return fail('Overlaps another dock apron');
  }
  if (w.cash < COST.door) return fail(`Need ${fmtMoney(COST.door)}`);
  return { ok: true, cost: COST.door, facing };
}

export function rackCells(cell: Vec2, orient: 'h' | 'v'): [Vec2, Vec2] {
  return [{ ...cell }, orient === 'h' ? { x: cell.x + 1, y: cell.y } : { x: cell.x, y: cell.y + 1 }];
}

export function isConnected(w: World, newRackCells: Vec2[] = []): boolean {
  const extra = new Set(newRackCells.map(cellKey));
  const walk = (x: number, y: number) => isForkliftWalkable(w, x, y) && !extra.has(`${x},${y}`);
  const doors = Object.values(w.doors);
  let start: Vec2 | null = doors.length ? doors[0].cell : null;
  for (let y = 0; y < LOT_H && !start; y++) {
    for (let x = 0; x < LOT_W; x++) {
      if (walk(x, y)) {
        start = { x, y };
        break;
      }
    }
  }
  if (!start) return true;
  const seen = new Set<string>([cellKey(start)]);
  const queue: Vec2[] = [start];
  while (queue.length) {
    const c = queue.shift()!;
    for (const d of ALL_DIRS) {
      const n = add(c, DIRS[d]);
      const k = cellKey(n);
      if (!seen.has(k) && walk(n.x, n.y)) {
        seen.add(k);
        queue.push(n);
      }
    }
  }
  if (doors.some((d) => !seen.has(cellKey(d.cell)))) return false;
  const reachable = (c: Vec2) => ALL_DIRS.some((d) => seen.has(cellKey(add(c, DIRS[d]))));
  const allRackCells = [...Object.values(w.racks).flatMap((r) => r.cells), ...newRackCells];
  if (!allRackCells.every(reachable)) return false;
  return Object.values(w.staging).every((c) => seen.has(cellKey(c)));
}

export function validateRack(w: World, cell: Vec2, orient: 'h' | 'v'): Check {
  const cells = rackCells(cell, orient);
  for (const c of cells) {
    if (!isInterior(w, c.x, c.y)) return fail('Racks go inside a finished warehouse');
    if (flagsAt(w, c.x, c.y) & (F_RACK | F_STAGING | F_FLOOR_PALLET)) return fail('That spot is occupied');
    if (isDoorInward(w, c)) return fail('Keep the cell inside a door clear');
    const blocker = Object.values(w.forklifts).some((f) => f.state !== 'parked' && same(cellOf(f.pos), c));
    if (blocker) return fail('A forklift is in the way');
  }
  if (!isConnected(w, cells)) return fail('That would block forklift access');
  if (w.cash < COST.rack) return fail(`Need ${fmtMoney(COST.rack)}`);
  return { ok: true, cost: COST.rack };
}

export function validateStaging(w: World, c: Vec2): Check {
  if (!isInterior(w, c.x, c.y)) return fail('Staging goes inside a finished warehouse');
  if (flagsAt(w, c.x, c.y) & (F_RACK | F_STAGING | F_FLOOR_PALLET)) return fail('That spot is occupied');
  if (w.cash < COST.staging) return fail(`Need ${fmtMoney(COST.staging)}`);
  return { ok: true, cost: COST.staging };
}

export function validateDemolish(w: World, c: Vec2): DemolishCheck {
  const rack = Object.values(w.racks).find((r) => r.cells.some((rc) => same(rc, c)));
  if (rack) {
    const busy = rack.slots.some((s, i) => s !== null || w.reservations[`r:${rack.id}:${i}`]);
    if (busy) return fail('Empty the rack first');
    return { ok: true, refund: COST.rack / 2, assetCost: COST.rack, target: { kind: 'rack', id: rack.id } };
  }
  const door = Object.values(w.doors).find((d) => same(d.cell, c));
  if (door) {
    if (door.truckId) return fail('A truck is using this door');
    return { ok: true, refund: COST.door / 2, assetCost: COST.door, target: { kind: 'door', id: door.id } };
  }
  const key = cellKey(c);
  if (w.staging[key]) {
    if (w.cellPallets[key] || w.reservations[`c:${key}`]) return fail('Clear the staging cell first');
    return { ok: true, refund: COST.staging / 2, assetCost: COST.staging, target: { kind: 'staging', key } };
  }
  return fail('Nothing to demolish here');
}

export function findSpawnCell(w: World): Vec2 | null {
  const taken = new Set(Object.values(w.forklifts).filter((f) => f.state !== 'parked').map((f) => cellKey(cellOf(f.pos))));
  const free = (c: Vec2) => isForkliftWalkable(w, c.x, c.y) && !(flagsAt(w, c.x, c.y) & F_DOOR) && !taken.has(cellKey(c));
  for (const d of Object.values(w.doors)) {
    const i = doorInward(d);
    if (free(i)) return i;
    for (const n of walkableNeighbors(w, i)) if (free(n)) return n;
  }
  for (let y = 0; y < LOT_H; y++) for (let x = 0; x < LOT_W; x++) if (free({ x, y })) return { x, y };
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/grid.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sim): grid flags, walkability and placement validators"
```

---

### Task 4: A* pathfinding

**Files:**
- Create: `src/sim/pathfinding.ts`, `src/sim/pathfinding.test.ts`

**Interfaces:**
- Consumes: `Vec2` from `world.ts`
- Produces: `type Walkable = (x: number, y: number) => boolean`; `findPath(start: Vec2, goals: Vec2[], walkable: Walkable, blocked?: Set<string>): Vec2[] | null` returns the cells to visit **excluding** `start` and **including** the reached goal; `[]` when `start` is a goal; `null` when unreachable. Goal cells are allowed even if `walkable` says no; `blocked` holds `"x,y"` keys to avoid (goals are exempt). Coordinates must be ≥ 0.

- [ ] **Step 1: Write the failing test**

`src/sim/pathfinding.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/pathfinding.test.ts`
Expected: FAIL — cannot resolve `./pathfinding`.

- [ ] **Step 3: Implement**

`src/sim/pathfinding.ts`:
```ts
import type { Vec2 } from './world';

export type Walkable = (x: number, y: number) => boolean;

const STRIDE = 1024;
const MAX_EXPANDED = 6000;
const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

class MinHeap {
  private keys: number[] = [];
  private pri: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, p: number) {
    this.keys.push(key);
    this.pri.push(p);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.pri[parent] <= this.pri[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const top = this.keys[0];
    const lastK = this.keys.pop()!;
    const lastP = this.pri.pop()!;
    if (this.keys.length) {
      this.keys[0] = lastK;
      this.pri[0] = lastP;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.pri[l] < this.pri[m]) m = l;
        if (r < this.keys.length && this.pri[r] < this.pri[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.pri[a], this.pri[b]] = [this.pri[b], this.pri[a]];
  }
}

export function findPath(start: Vec2, goals: Vec2[], walkable: Walkable, blocked?: Set<string>): Vec2[] | null {
  if (goals.length === 0) return null;
  const key = (x: number, y: number) => y * STRIDE + x;
  const goalSet = new Set(goals.map((g) => key(g.x, g.y)));
  const startK = key(start.x, start.y);
  if (goalSet.has(startK)) return [];
  const h = (x: number, y: number) => {
    let m = Infinity;
    for (const g of goals) m = Math.min(m, Math.abs(g.x - x) + Math.abs(g.y - y));
    return m;
  };
  const open = new MinHeap();
  const gScore = new Map<number, number>([[startK, 0]]);
  const came = new Map<number, number>();
  const closed = new Set<number>();
  open.push(startK, h(start.x, start.y));
  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (++expanded > MAX_EXPANDED) return null;
    if (goalSet.has(cur)) {
      const path: Vec2[] = [];
      let k = cur;
      while (k !== startK) {
        path.push({ x: k % STRIDE, y: Math.floor(k / STRIDE) });
        k = came.get(k)!;
      }
      return path.reverse();
    }
    const cx = cur % STRIDE;
    const cy = Math.floor(cur / STRIDE);
    const g = gScore.get(cur)!;
    for (const [dx, dy] of STEPS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const isGoal = goalSet.has(nk);
      if (!isGoal && (!walkable(nx, ny) || blocked?.has(`${nx},${ny}`))) continue;
      const ng = g + 1;
      if (ng < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, ng);
        came.set(nk, cur);
        open.push(nk, ng + h(nx, ny));
      }
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/pathfinding.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sim): A* pathfinding with multi-goal and blocked cells"
```

---

### Task 5: Economy basics, build commands and test helpers

**Files:**
- Create: `src/sim/economy.ts`, `src/sim/commands.ts`, `src/sim/testUtils.ts`, `src/sim/commands.test.ts`

**Interfaces:**
- Consumes: `grid.ts` validators, `world.ts`
- Produces:
  - `economy.ts`: `spend(w, amount, assetValue = 0)`, `earn(w, amount)`, `refund(w, amount, assetCost)`, `addReputation(w, delta)`, `netWorth(w)`
  - `commands.ts`: `type Command` (build variants now; Tasks 6/7/9 add `reassignTruck`, `acceptContract`, `toggleRush`, `orderForklifts`), `type CommandResult = {ok:true} | {ok:false; reason:string}`, `applyCommand(w, cmd)`: on failure it also pushes an `'alert'` event with the reason
  - `testUtils.ts`: `must(r)`, `readyWorld(seed?)`: a ready 14×10 warehouse at (10,6) (interior x 11..22, y 7..14) with door "In 1" at (14,15) and "Out 1" at (20,15), both facing S; `fl-1` active at the first free interior cell; cash $1,000,000

- [ ] **Step 1: Write the failing test**

`src/sim/commands.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import { netWorth } from './economy';
import { createWorld } from './world';
import { must, readyWorld } from './testUtils';

describe('build commands', () => {
  it('builds a footprint, charges cash and adds asset value', () => {
    const w = createWorld(1, 'scenario');
    must(applyCommand(w, { type: 'buildFootprint', rect: { x: 10, y: 6, w: 12, h: 8 } }));
    expect(w.cash).toBe(60000 - 24000);
    expect(w.parts).toHaveLength(1);
    expect(w.parts[0].readyAt).toBe(w.minute + 120);
    expect(netWorth(w)).toBe(36000 + 0.5 * (8000 + 24000));
  });
  it('rejects invalid commands with an alert event', () => {
    const w = createWorld(1, 'scenario');
    const r = applyCommand(w, { type: 'buildFootprint', rect: { x: 0, y: 0, w: 3, h: 3 } });
    expect(r.ok).toBe(false);
    expect(w.events.at(-1)).toMatchObject({ kind: 'alert', text: 'Minimum size is 8×6' });
  });
  it('labels doors per kind and toggles them', () => {
    const w = readyWorld();
    const doors = Object.values(w.doors);
    expect(doors.map((d) => d.label)).toEqual(['In 1', 'Out 1']);
    must(applyCommand(w, { type: 'placeDoor', cell: { x: 17, y: 15 }, kind: 'in' }));
    const d = Object.values(w.doors).find((x) => x.cell.x === 17)!;
    expect(d.label).toBe('In 2');
    const cash = w.cash;
    must(applyCommand(w, { type: 'toggleDoor', doorId: d.id }));
    expect(d.kind).toBe('out');
    expect(d.label).toBe('Out 2');
    expect(w.cash).toBe(cash - 500);
  });
  it('refuses to toggle a door a truck is assigned to', () => {
    const w = readyWorld();
    const d = Object.values(w.doors)[0];
    d.truckId = 'TRK-1';
    expect(applyCommand(w, { type: 'toggleDoor', doorId: d.id })).toEqual({ ok: false, reason: 'A truck is using this door' });
  });
  it('places racks and staging, then demolishes for a 50% refund', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 12, y: 9 }, orient: 'h' }));
    must(applyCommand(w, { type: 'placeStaging', cell: { x: 15, y: 12 } }));
    expect(Object.keys(w.racks)).toHaveLength(1);
    expect(w.staging['15,12']).toEqual({ x: 15, y: 12 });
    const cash = w.cash;
    const assets = w.assetValue;
    must(applyCommand(w, { type: 'demolish', cell: { x: 13, y: 9 } }));
    expect(w.cash).toBe(cash + 750);
    expect(w.assetValue).toBe(assets - 1500);
    expect(Object.keys(w.racks)).toHaveLength(0);
  });
  it('buys, upgrades and repairs forklifts', () => {
    const w = createWorld(1, 'scenario');
    expect(applyCommand(w, { type: 'buyForklift' })).toEqual({ ok: false, reason: 'Build a warehouse first' });
    const r = readyWorld();
    must(applyCommand(r, { type: 'buyForklift' }));
    const f = Object.values(r.forklifts).find((x) => x.id !== 'fl-1')!;
    expect(f.state).toBe('idle');
    must(applyCommand(r, { type: 'upgradeForklift', forkliftId: f.id }));
    expect(f.fast).toBe(true);
    expect(applyCommand(r, { type: 'upgradeForklift', forkliftId: f.id }).ok).toBe(false);
    expect(applyCommand(r, { type: 'repairForklift', forkliftId: f.id }).ok).toBe(false);
    f.state = 'broken';
    f.brokenUntil = r.minute + 100;
    must(applyCommand(r, { type: 'repairForklift', forkliftId: f.id }));
    expect(f.state).toBe('idle');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/commands.test.ts`
Expected: FAIL — cannot resolve `./commands`.

- [ ] **Step 3: Implement**

`src/sim/economy.ts`:
```ts
import type { World } from './world';

export function spend(w: World, amount: number, assetValue = 0): void {
  w.cash -= amount;
  w.stats.expenses += amount;
  w.assetValue += assetValue;
}

export function earn(w: World, amount: number): void {
  w.cash += amount;
  w.stats.revenue += amount;
}

export function refund(w: World, amount: number, assetCost: number): void {
  w.cash += amount;
  w.assetValue -= assetCost;
}

export function addReputation(w: World, delta: number): void {
  w.reputation = Math.min(5, Math.max(0, Math.round((w.reputation + delta) * 10) / 10));
}

export const netWorth = (w: World): number => Math.round(w.cash + 0.5 * w.assetValue);
```

`src/sim/commands.ts`:
```ts
import { BUILD_MINUTES, COST } from './balance';
import { refund, spend } from './economy';
import {
  findSpawnCell, rackCells, rebuildGrid, validateDemolish, validateDoor, validateFootprint, validateRack, validateStaging,
} from './grid';
import { cellKey, fmtMoney, genId, newForklift, pushEvent, type DoorKind, type Rect, type Vec2, type World } from './world';

export type Command =
  | { type: 'buildFootprint'; rect: Rect }
  | { type: 'placeDoor'; cell: Vec2; kind: DoorKind }
  | { type: 'toggleDoor'; doorId: string }
  | { type: 'placeRack'; cell: Vec2; orient: 'h' | 'v' }
  | { type: 'placeStaging'; cell: Vec2 }
  | { type: 'buyForklift' }
  | { type: 'upgradeForklift'; forkliftId: string }
  | { type: 'repairForklift'; forkliftId: string }
  | { type: 'demolish'; cell: Vec2 };

export type CommandResult = { ok: true } | { ok: false; reason: string };

const OK: CommandResult = { ok: true };
const fail = (reason: string): CommandResult => ({ ok: false, reason });

export function applyCommand(w: World, cmd: Command): CommandResult {
  const r = run(w, cmd);
  if (!r.ok) pushEvent(w, 'alert', r.reason);
  return r;
}

function doorLabel(w: World, kind: DoorKind): string {
  const base = kind === 'in' ? 'In' : 'Out';
  const used = new Set(Object.values(w.doors).filter((d) => d.kind === kind).map((d) => d.label));
  let n = 1;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

function run(w: World, cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'buildFootprint': {
      const c = validateFootprint(w, cmd.rect);
      if (!c.ok) return c;
      spend(w, c.cost, c.cost);
      w.parts.push({ rect: { ...cmd.rect }, readyAt: w.minute + BUILD_MINUTES });
      rebuildGrid(w);
      pushEvent(w, 'toast', `Construction started (${cmd.rect.w}×${cmd.rect.h}) — ready in 2h`);
      return OK;
    }
    case 'placeDoor': {
      const c = validateDoor(w, cmd.cell);
      if (!c.ok) return c;
      spend(w, c.cost, c.cost);
      const id = genId(w, 'door');
      w.doors[id] = { id, label: doorLabel(w, cmd.kind), cell: { ...cmd.cell }, facing: c.facing, kind: cmd.kind, truckId: null };
      rebuildGrid(w);
      return OK;
    }
    case 'toggleDoor': {
      const d = w.doors[cmd.doorId];
      if (!d) return fail('Unknown door');
      if (d.truckId) return fail('A truck is using this door');
      if (w.cash < COST.doorToggle) return fail(`Need ${fmtMoney(COST.doorToggle)}`);
      spend(w, COST.doorToggle);
      d.kind = d.kind === 'in' ? 'out' : 'in';
      d.label = doorLabel(w, d.kind);
      return OK;
    }
    case 'placeRack': {
      const c = validateRack(w, cmd.cell, cmd.orient);
      if (!c.ok) return c;
      spend(w, c.cost, c.cost);
      const id = genId(w, 'rack');
      w.racks[id] = { id, cells: rackCells(cmd.cell, cmd.orient), slots: [null, null, null, null] };
      rebuildGrid(w);
      return OK;
    }
    case 'placeStaging': {
      const c = validateStaging(w, cmd.cell);
      if (!c.ok) return c;
      spend(w, c.cost, c.cost);
      w.staging[cellKey(cmd.cell)] = { ...cmd.cell };
      rebuildGrid(w);
      return OK;
    }
    case 'buyForklift': {
      const s = findSpawnCell(w);
      if (!s) return fail('Build a warehouse first');
      if (w.cash < COST.forklift) return fail(`Need ${fmtMoney(COST.forklift)}`);
      spend(w, COST.forklift, COST.forklift);
      const id = genId(w, 'fl');
      w.forklifts[id] = newForklift(id, s, 'idle');
      pushEvent(w, 'toast', 'New forklift ready');
      return OK;
    }
    case 'upgradeForklift': {
      const f = w.forklifts[cmd.forkliftId];
      if (!f) return fail('Unknown forklift');
      if (f.fast) return fail('Already upgraded');
      if (w.cash < COST.fastMast) return fail(`Need ${fmtMoney(COST.fastMast)}`);
      spend(w, COST.fastMast, COST.fastMast);
      f.fast = true;
      return OK;
    }
    case 'repairForklift': {
      const f = w.forklifts[cmd.forkliftId];
      if (!f) return fail('Unknown forklift');
      if (f.state !== 'broken') return fail('This forklift is not broken');
      if (w.cash < COST.repair) return fail(`Need ${fmtMoney(COST.repair)}`);
      spend(w, COST.repair);
      f.state = 'idle';
      f.brokenUntil = w.minute;
      return OK;
    }
    case 'demolish': {
      const c = validateDemolish(w, cmd.cell);
      if (!c.ok) return c;
      refund(w, c.refund, c.assetCost);
      if (c.target.kind === 'rack') delete w.racks[c.target.id];
      else if (c.target.kind === 'door') delete w.doors[c.target.id];
      else delete w.staging[c.target.key];
      rebuildGrid(w);
      return OK;
    }
  }
}
```

`src/sim/testUtils.ts`:
```ts
import { BUILD_MINUTES } from './balance';
import { applyCommand, type CommandResult } from './commands';
import { findSpawnCell, rebuildGrid } from './grid';
import { createWorld, type World } from './world';

export function must(r: CommandResult): void {
  if (!r.ok) throw new Error(r.reason);
}

/**
 * Ready 14×10 warehouse at (10,6): interior x 11..22, y 7..14.
 * "In 1" at (14,15) and "Out 1" at (20,15), both facing S. fl-1 active. Cash $1,000,000.
 */
export function readyWorld(seed = 1): World {
  const w = createWorld(seed, 'sandbox');
  w.cash = 1_000_000;
  must(applyCommand(w, { type: 'buildFootprint', rect: { x: 10, y: 6, w: 14, h: 10 } }));
  w.minute += BUILD_MINUTES;
  rebuildGrid(w);
  const f = w.forklifts['fl-1'];
  const s = findSpawnCell(w)!;
  f.pos = { ...s };
  f.prev = { ...s };
  f.state = 'idle';
  must(applyCommand(w, { type: 'placeDoor', cell: { x: 14, y: 15 }, kind: 'in' }));
  must(applyCommand(w, { type: 'placeDoor', cell: { x: 20, y: 15 }, kind: 'out' }));
  return w;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim`
Expected: PASS (all sim tests so far).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sim): economy helpers, build commands and test helpers"
```

---
### Task 6: Pallets and trucks

**Files:**
- Create: `src/sim/pallets.ts`, `src/sim/trucks.ts`, `src/sim/trucks.test.ts`
- Modify: `src/sim/testUtils.ts` (add `testContract`, `runMinutes`), `src/sim/commands.ts` (add `reassignTruck`)

**Interfaces:**
- Consumes: `grid.ts` (`isTruckWalkable`, `isInterior`, `flagsAt`, `isDoorInward`, `rebuildGrid`, `cellOf`, flags), `pathfinding.ts` (`findPath`), `world.ts`
- Produces:
  - `pallets.ts`: `createPallet(w, product, contractId, loc): Pallet` (registers it in `w.pallets` only; it does **not** attach), `attachPallet(w, p, loc)`, `detachPallet(w, p)`, `reservationKey(dest): string | null`, `releaseJob(w, job)` (frees the reservation and the forklift and unassigns the job, but keeps it), `removePallet(w, id)`, `isFreeStaging(w, c)`, `isFreeFloor(w, c)`, `isStoredLoc(loc)`
  - `trucks.ts`: `ROAD_ENTRY`, `ROAD_EXIT`, `stagePoint(door)`, `dockPoint(door)`, `scheduleTruck(w, contract, kind, arriveAt, count): Truck` (inbound trucks get `count` new pallets aboard; outbound trucks get `capacity = count`), `updateTrucks(w)`, `startDeparture(w, t)`, `reassignTruck(w, truckId, doorId): CommandResult`
  - Command `{ type: 'reassignTruck'; truckId: string; doorId: string }`
  - `testUtils.ts`: `testContract(w, overrides?)`, `runMinutes(w, n, ...updaters)`
- Truck life cycle: `scheduled` → (at `arriveAt`) `queued` → (door free and path found) `driving` → `docking` (5 min reverse) → `docked` → (inbound empty, or outbound has `capacity` pallets) `departing` → deleted at `ROAD_EXIT`. An outbound truck adds its pallet count to `contract.shipped` when it starts departing.

- [ ] **Step 1: Write the failing test**

Append to `src/sim/testUtils.ts`:
```ts
import { genId, type Contract } from './world';

export function testContract(w: World, over: Partial<Contract> = {}): Contract {
  const id = genId(w, 'ctr');
  const c: Contract = {
    id, type: 'storage', client: 'Nordline', product: 'boxes', qty: 4, payout: 1000, rentPerDay: 40,
    arriveAt: w.minute, storeDays: 1, deadline: w.minute + 600, offerExpires: w.minute + 720, status: 'active',
    rush: false, hot: false, truckIds: [], shipped: 0, transferred: 0, completedAt: null, earned: 0, ...over,
  };
  w.contracts[id] = c;
  return c;
}

export function runMinutes(w: World, n: number, ...updaters: ((w: World) => void)[]): void {
  for (let i = 0; i < n; i++) {
    w.minute++;
    for (const u of updaters) u(w);
  }
}
```
(Merge the `genId`/`Contract` import into the existing `./world` import line.)

`src/sim/trucks.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import { attachPallet, createPallet } from './pallets';
import { reassignTruck, scheduleTruck, updateTrucks } from './trucks';
import { must, readyWorld, runMinutes, testContract } from './testUtils';

const inDoor = (w: ReturnType<typeof readyWorld>) => Object.values(w.doors).find((d) => d.kind === 'in')!;

describe('trucks', () => {
  it('drives in, docks at a free door of its kind and waits while it has pallets', () => {
    const w = readyWorld();
    const c = testContract(w);
    const t = scheduleTruck(w, c, 'in', w.minute + 1, 3);
    expect(t.palletIds).toHaveLength(3);
    expect(w.pallets[t.palletIds[0]].loc).toEqual({ kind: 'truck', truckId: t.id });
    runMinutes(w, 120, updateTrucks);
    expect(t.state).toBe('docked');
    expect(t.doorId).toBe(inDoor(w).id);
    expect(inDoor(w).truckId).toBe(t.id);
    expect(t.pos.x).toBeCloseTo(14);
    expect(t.pos.y).toBeCloseTo(15.6);
  });
  it('leaves and is removed once an inbound truck is empty', () => {
    const w = readyWorld();
    const c = testContract(w);
    const t = scheduleTruck(w, c, 'in', w.minute + 1, 0);
    runMinutes(w, 150, updateTrucks);
    expect(w.trucks[t.id]).toBeUndefined();
    expect(inDoor(w).truckId).toBeNull();
  });
  it('queues when every door of its kind is busy', () => {
    const w = readyWorld();
    const c = testContract(w);
    const a = scheduleTruck(w, c, 'in', w.minute + 1, 2);
    const b = scheduleTruck(w, c, 'in', w.minute + 2, 2);
    runMinutes(w, 120, updateTrucks);
    expect(a.state).toBe('docked');
    expect(b.state).toBe('queued');
    expect(b.pos.y).toBe(31);
  });
  it('stays queued with an alert when its door cannot be reached from the road', () => {
    const w = readyWorld();
    const c = testContract(w);
    for (let x = 0; x < 40; x++) w.grid[29 * 40 + x] = 1; // simulate a building row sealing the yard off from the road
    const t = scheduleTruck(w, c, 'in', w.minute + 1, 2);
    runMinutes(w, 30, updateTrucks);
    expect(t.state).toBe('queued');
    expect(w.events.some((e) => e.kind === 'alert' && e.text.includes('can’t reach'))).toBe(true);
  });
  it('outbound truck departs once full and counts shipped pallets', () => {
    const w = readyWorld();
    const c = testContract(w, { type: 'crossdock', qty: 2 });
    const t = scheduleTruck(w, c, 'out', w.minute + 1, 2);
    runMinutes(w, 120, updateTrucks);
    expect(t.state).toBe('docked');
    for (let i = 0; i < 2; i++) {
      const p = createPallet(w, 'boxes', c.id, { kind: 'truck', truckId: t.id });
      attachPallet(w, p, { kind: 'truck', truckId: t.id });
    }
    runMinutes(w, 1, updateTrucks);
    expect(t.state).toBe('departing');
    expect(c.shipped).toBe(2);
    runMinutes(w, 120, updateTrucks);
    expect(w.trucks[t.id]).toBeUndefined();
    expect(Object.keys(w.pallets)).toHaveLength(0);
  });
  it('reassigns a not-yet-docked truck to another free door of its kind', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeDoor', cell: { x: 17, y: 15 }, kind: 'in' }));
    const in2 = Object.values(w.doors).find((d) => d.label === 'In 2')!;
    const c = testContract(w);
    const t = scheduleTruck(w, c, 'in', w.minute + 5, 1);
    expect(reassignTruck(w, t.id, in2.id)).toEqual({ ok: true });
    runMinutes(w, 120, updateTrucks);
    expect(t.doorId).toBe(in2.id);
    expect(t.state).toBe('docked');
    const out = Object.values(w.doors).find((d) => d.kind === 'out')!;
    expect(reassignTruck(w, t.id, out.id).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/trucks.test.ts`
Expected: FAIL — cannot resolve `./pallets` / `./trucks`.

- [ ] **Step 3: Implement**

`src/sim/pallets.ts`:
```ts
import { F_DOOR, F_FLOOR_PALLET, F_RACK, F_STAGING, flagsAt, isDoorInward, isInterior, rebuildGrid } from './grid';
import { cellKey, genId, type Job, type JobDest, type Pallet, type PalletLoc, type ProductId, type Vec2, type World } from './world';

export function createPallet(w: World, product: ProductId, contractId: string, loc: PalletLoc): Pallet {
  const id = genId(w, 'plt');
  const p: Pallet = { id, product, contractId, loc, placedAt: w.minute };
  w.pallets[id] = p;
  return p;
}

export function reservationKey(d: JobDest): string | null {
  if (d.kind === 'rack') return `r:${d.rackId}:${d.slot}`;
  if (d.kind === 'staging' || d.kind === 'floor') return `c:${cellKey(d.cell)}`;
  return null;
}

/** Removes the pallet from wherever it currently sits (its `loc` is left unchanged). */
export function detachPallet(w: World, p: Pallet): void {
  const l = p.loc;
  if (l.kind === 'truck') {
    const t = w.trucks[l.truckId];
    if (t) t.palletIds = t.palletIds.filter((id) => id !== p.id);
  } else if (l.kind === 'rack') {
    const r = w.racks[l.rackId];
    if (r && r.slots[l.slot] === p.id) r.slots[l.slot] = null;
  } else if (l.kind === 'staging' || l.kind === 'floor') {
    delete w.cellPallets[cellKey(l.cell)];
    if (l.kind === 'floor') rebuildGrid(w);
  } else {
    const f = w.forklifts[l.forkliftId];
    if (f && f.carrying === p.id) f.carrying = null;
  }
}

export function attachPallet(w: World, p: Pallet, loc: PalletLoc): void {
  p.loc = loc;
  p.placedAt = w.minute;
  if (loc.kind === 'truck') w.trucks[loc.truckId]?.palletIds.push(p.id);
  else if (loc.kind === 'rack') w.racks[loc.rackId].slots[loc.slot] = p.id;
  else if (loc.kind === 'staging' || loc.kind === 'floor') {
    w.cellPallets[cellKey(loc.cell)] = p.id;
    if (loc.kind === 'floor') rebuildGrid(w);
  } else w.forklifts[loc.forkliftId].carrying = p.id;
}

/** Unassigns a job: frees its reservation and its forklift. The job itself stays in w.jobs. */
export function releaseJob(w: World, job: Job): void {
  const k = job.dest ? reservationKey(job.dest) : null;
  if (k && w.reservations[k] === job.id) delete w.reservations[k];
  if (job.forkliftId) {
    const f = w.forklifts[job.forkliftId];
    if (f && f.jobId === job.id) {
      f.jobId = null;
      f.path = [];
      if (f.state !== 'broken' && f.state !== 'parked') f.state = 'idle';
    }
  }
  job.forkliftId = null;
  job.dest = null;
  job.manual = false;
}

export function removePallet(w: World, id: string): void {
  const p = w.pallets[id];
  if (!p) return;
  const job = w.jobs[`job-${id}`];
  if (job) {
    releaseJob(w, job);
    delete w.jobs[job.id];
  }
  detachPallet(w, p);
  delete w.pallets[id];
}

export function isFreeStaging(w: World, c: Vec2): boolean {
  const k = cellKey(c);
  return !!w.staging[k] && !w.cellPallets[k] && !w.reservations[`c:${k}`];
}

export function isFreeFloor(w: World, c: Vec2): boolean {
  if (!isInterior(w, c.x, c.y)) return false;
  if (flagsAt(w, c.x, c.y) & (F_RACK | F_STAGING | F_FLOOR_PALLET | F_DOOR)) return false;
  if (isDoorInward(w, c)) return false;
  return !w.reservations[`c:${cellKey(c)}`];
}

export const isStoredLoc = (l: PalletLoc): boolean => l.kind === 'rack' || l.kind === 'staging' || l.kind === 'floor';
```

`src/sim/trucks.ts`:
```ts
import { DOCK_MIN, DOCK_OFFSET, LOT_H, LOT_W, TRUCK_SPEED, TRUCK_STAGE_DIST } from './balance';
import type { CommandResult } from './commands';
import { cellOf, isTruckWalkable } from './grid';
import { createPallet } from './pallets';
import { findPath } from './pathfinding';
import { DIRS, dirAngle, pushEvent, type Contract, type Door, type DoorKind, type Truck, type Vec2, type World } from './world';

export const ROAD_ENTRY: Vec2 = { x: 0, y: LOT_H };
export const ROAD_EXIT: Vec2 = { x: LOT_W - 1, y: LOT_H };
const QUEUE_ROW = LOT_H + 1;
const UNREACHABLE_ALERT_EVERY = 60;

export const stagePoint = (d: Door): Vec2 => ({
  x: d.cell.x + DIRS[d.facing].x * TRUCK_STAGE_DIST,
  y: d.cell.y + DIRS[d.facing].y * TRUCK_STAGE_DIST,
});
export const dockPoint = (d: Door): Vec2 => ({
  x: d.cell.x + DIRS[d.facing].x * DOCK_OFFSET,
  y: d.cell.y + DIRS[d.facing].y * DOCK_OFFSET,
});
const truckWalk = (w: World) => (x: number, y: number) => isTruckWalkable(w, x, y);

export function scheduleTruck(w: World, c: Contract, kind: DoorKind, arriveAt: number, count: number): Truck {
  const id = `TRK-${2200 + w.nextId++}`;
  const t: Truck = {
    id, client: c.client, contractId: c.id, kind, state: 'scheduled', arriveAt,
    pos: { ...ROAD_ENTRY }, prev: { ...ROAD_ENTRY }, heading: 0, path: [], doorId: null,
    palletIds: [], capacity: count, timer: 0, dockFrom: null,
  };
  w.trucks[id] = t;
  c.truckIds.push(id);
  if (kind === 'in') {
    for (let i = 0; i < count; i++) t.palletIds.push(createPallet(w, c.product, c.id, { kind: 'truck', truckId: id }).id);
  }
  return t;
}

function moveAlong(t: Truck, speed: number): boolean {
  let budget = speed;
  while (budget > 1e-9 && t.path.length) {
    const n = t.path[0];
    const dx = n.x - t.pos.x;
    const dy = n.y - t.pos.y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-6) t.heading = Math.atan2(dy, dx);
    if (d <= budget) {
      t.pos = { x: n.x, y: n.y };
      t.path.shift();
      budget -= d;
    } else {
      t.pos = { x: t.pos.x + (dx / d) * budget, y: t.pos.y + (dy / d) * budget };
      budget = 0;
    }
  }
  return t.path.length === 0;
}

function tryAssignDoor(w: World, t: Truck): boolean {
  let door = t.doorId ? w.doors[t.doorId] : undefined;
  if (!door || door.kind !== t.kind || (door.truckId && door.truckId !== t.id)) {
    door = Object.values(w.doors)
      .filter((d) => d.kind === t.kind && !d.truckId)
      .sort((a, b) => a.label.localeCompare(b.label))[0];
  }
  if (!door) {
    t.doorId = null;
    return false;
  }
  const path = findPath(cellOf(t.pos), [stagePoint(door)], truckWalk(w));
  if (!path) {
    // While queued, t.timer counts down to the next "unreachable" alert.
    if (t.timer <= 0) {
      pushEvent(w, 'alert', `${t.id} can’t reach ${door.label} — keep the yard open`, { at: door.cell });
      t.timer = UNREACHABLE_ALERT_EVERY;
    } else t.timer -= 1;
    return false;
  }
  door.truckId = t.id;
  t.doorId = door.id;
  t.path = path;
  t.state = 'driving';
  t.timer = 0;
  return true;
}

export function startDeparture(w: World, t: Truck): void {
  if (t.doorId) {
    const d = w.doors[t.doorId];
    if (d && d.truckId === t.id) d.truckId = null;
  }
  if (t.kind === 'out' && t.palletIds.length) {
    const c = w.contracts[t.contractId];
    if (c) c.shipped += t.palletIds.length;
  }
  t.state = 'departing';
  t.doorId = null;
  t.path = findPath(cellOf(t.pos), [ROAD_EXIT], truckWalk(w)) ?? [];
}

export function updateTrucks(w: World): void {
  const queued: Truck[] = [];
  for (const t of Object.values(w.trucks)) {
    t.prev = { x: t.pos.x, y: t.pos.y };
    switch (t.state) {
      case 'scheduled':
        if (w.minute >= t.arriveAt) {
          t.state = 'queued';
          pushEvent(w, 'toast', `${t.id} · ${t.client} arrived`);
          if (!tryAssignDoor(w, t)) queued.push(t);
        }
        break;
      case 'queued':
        if (!tryAssignDoor(w, t)) queued.push(t);
        break;
      case 'driving': {
        const door = t.doorId ? w.doors[t.doorId] : undefined;
        if (!door) {
          t.state = 'queued';
          t.doorId = null;
          t.path = [];
          queued.push(t);
          break;
        }
        if (moveAlong(t, TRUCK_SPEED)) {
          t.state = 'docking';
          t.timer = DOCK_MIN;
          t.dockFrom = { ...t.pos };
          t.heading = dirAngle(door.facing);
        }
        break;
      }
      case 'docking': {
        const door = t.doorId ? w.doors[t.doorId] : undefined;
        if (!door || !t.dockFrom) {
          startDeparture(w, t);
          break;
        }
        t.timer -= 1;
        const k = 1 - Math.max(0, t.timer) / DOCK_MIN;
        const to = dockPoint(door);
        t.pos = { x: t.dockFrom.x + (to.x - t.dockFrom.x) * k, y: t.dockFrom.y + (to.y - t.dockFrom.y) * k };
        if (t.timer <= 0) {
          t.state = 'docked';
          pushEvent(w, 'toast', `${t.id} docked at ${door.label}`, { at: door.cell });
        }
        break;
      }
      case 'docked':
        if (t.kind === 'in' ? t.palletIds.length === 0 : t.palletIds.length >= t.capacity) startDeparture(w, t);
        break;
      case 'departing':
        if (moveAlong(t, TRUCK_SPEED)) {
          for (const pid of t.palletIds) delete w.pallets[pid];
          delete w.trucks[t.id];
        }
        break;
    }
  }
  queued
    .sort((a, b) => a.arriveAt - b.arriveAt)
    .forEach((t, i) => {
      t.pos = { x: Math.min(LOT_W - 1, 1 + i * 5), y: QUEUE_ROW };
      t.heading = 0;
    });
}

export function reassignTruck(w: World, truckId: string, doorId: string): CommandResult {
  const t = w.trucks[truckId];
  if (!t) return { ok: false, reason: 'Unknown truck' };
  if (!['scheduled', 'queued', 'driving'].includes(t.state)) return { ok: false, reason: 'Trucks can only be redirected before docking' };
  const d = w.doors[doorId];
  if (!d) return { ok: false, reason: 'Unknown door' };
  if (d.kind !== t.kind) return { ok: false, reason: t.kind === 'in' ? 'Pick an inbound door' : 'Pick an outbound door' };
  if (d.truckId && d.truckId !== t.id) return { ok: false, reason: 'That door is busy' };
  if (t.doorId && t.doorId !== d.id) {
    const old = w.doors[t.doorId];
    if (old && old.truckId === t.id) old.truckId = null;
  }
  t.doorId = d.id;
  if (t.state === 'driving') {
    t.state = 'queued';
    t.path = [];
  }
  return { ok: true };
}
```

In `src/sim/commands.ts`: add `import { reassignTruck } from './trucks';`, add `| { type: 'reassignTruck'; truckId: string; doorId: string }` to the `Command` union, and add this case to `run`:
```ts
    case 'reassignTruck':
      return reassignTruck(w, cmd.truckId, cmd.doorId);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/sim`
Expected: PASS. (The yard-sealing test writes `F_BUILDING` = 1 into row 29 directly, so it only exercises the truck code. `isTruckWalkable` treats those cells as blocked.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sim): pallet bookkeeping and truck lifecycle with door assignment"
```

---

### Task 7: Contracts

**Files:**
- Create: `src/sim/contracts.ts`, `src/sim/contracts.test.ts`
- Modify: `src/sim/commands.ts` (add `acceptContract`, `toggleRush`)

**Interfaces:**
- Consumes: `trucks.ts` (`scheduleTruck`, `startDeparture`), `pallets.ts` (`removePallet`, `isStoredLoc`), `economy.ts`, `rng.ts`, `products.ts`, `balance.ts` (`OFFERS`, …)
- Produces:
  - `CLIENTS: ClientId[]`
  - `eligibleStock(w, product?): Pallet[]`: stored pallets of active storage contracts whose pickup trucks are all still `scheduled`
  - `stockByProduct(w): Partial<Record<ProductId, number>>`
  - `makeOffer(w, forceType?): Contract`: returns the offer without registering it; `generateOffers(w, count)` registers offers
  - `canAcceptContract(w, c): CommandResult`, `acceptContract(w, id): CommandResult`, `toggleRush(w, id): CommandResult`
  - `updateContracts(w)`: expires offers; fails contracts more than 10 h past their deadline
  - `checkContractComplete(w, c)`: completes an active contract once none of its trucks remain except outbound trucks that are departing
  - `completeContract(w, c, at?)`, `failContract(w, c)`
  - Commands `{ type: 'acceptContract'; contractId: string }`, `{ type: 'toggleRush'; contractId: string }`

- [ ] **Step 1: Write the failing test**

`src/sim/contracts.test.ts`:
```ts
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
    const s = testContract(w, { type: 'storage', product: 'boxes', qty: 4 });
    const pickup = scheduleTruck(w, s, 'out', w.minute + 2000, 4);
    for (let slot = 0; slot < 4; slot++) {
      const loc = { kind: 'rack' as const, rackId, slot };
      attachPallet(w, createPallet(w, 'boxes', s.id, loc), loc);
    }
    expect(stockByProduct(w)).toEqual({ boxes: 4 });
    const o = testContract(w, { type: 'outbound', status: 'offer', product: 'boxes', qty: 3 });
    must(acceptContract(w, o.id));
    expect(Object.values(w.pallets).filter((p) => p.contractId === o.id)).toHaveLength(3);
    expect(pickup.capacity).toBe(1);
    expect(s.transferred).toBe(3);
    expect(o.truckIds.map((id) => w.trucks[id].capacity)).toEqual([3]);
    const tooMany = testContract(w, { type: 'outbound', status: 'offer', product: 'boxes', qty: 5 });
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/contracts.test.ts`
Expected: FAIL — cannot resolve `./contracts`.

- [ ] **Step 3: Implement**

`src/sim/contracts.ts`:
```ts
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

export const CLIENTS: ClientId[] = ['WareTrack', 'Nordline', 'Cargoviva', 'Bluepeak'];
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
```

In `src/sim/commands.ts`: add `import { acceptContract, toggleRush } from './contracts';`, extend the union with
```ts
  | { type: 'acceptContract'; contractId: string }
  | { type: 'toggleRush'; contractId: string }
```
and add the cases:
```ts
    case 'acceptContract':
      return acceptContract(w, cmd.contractId);
    case 'toggleRush':
      return toggleRush(w, cmd.contractId);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/sim`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sim): contract offers, acceptance, completion and failure"
```

---

### Task 8: Jobs — generation, destinations, assignment

**Files:**
- Create: `src/sim/jobs.ts`, `src/sim/jobs.test.ts`

**Interfaces:**
- Consumes: `pallets.ts` (`isFreeFloor`, `isFreeStaging`, `reservationKey`, `releaseJob`), `grid.ts`, `pathfinding.ts`, `products.ts`, `world.ts`
- Produces:
  - `jobIdFor(palletId) = 'job-' + palletId`
  - `locCell(w, loc)`, `accessCells(w, loc)`: the cells a forklift must stand on to handle a location (truck → door cell; staging → the cell; rack/floor → walkable neighbours)
  - `outTruckWithRoom(w, contractId): Truck | null`
  - `freeRackSlots(w, product)`
  - `desiredJobType(w, pallet, ctx?)`, `generateJobs(w)`, `chooseDest(w, job, pallet)`, `assignJobTo(w, forklift, job, manual?) : boolean`, `assignJobs(w)`, `updateJobs(w)`
- Rules: one job per pallet (`job-<palletId>`); unassigned jobs are re-typed every tick; assigned jobs are only removed by the forklift. Ranking: rush first, then earliest contract deadline, then distance. An idle forklift with `focusTruckId` takes jobs for that truck first. A forklift with `blockedUntil > minute` is skipped. If an `UNLOAD`/`CROSSDOCK` job finds no destination, a "Warehouse full" alert is pushed at most once per `FULL_ALERT_EVERY_MIN`.

- [ ] **Step 1: Write the failing test**

`src/sim/jobs.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import { attachPallet, createPallet } from './pallets';
import { scheduleTruck } from './trucks';
import { updateJobs } from './jobs';
import type { ContractType, ProductId, World } from './world';
import { must, readyWorld, testContract } from './testUtils';

function dockedTruck(w: World, kind: 'in' | 'out', opts: { product?: ProductId; n?: number; type?: ContractType; contractId?: string } = {}) {
  const c = opts.contractId ? w.contracts[opts.contractId] : testContract(w, { product: opts.product ?? 'boxes', type: opts.type ?? 'storage' });
  const t = scheduleTruck(w, c, kind, w.minute, opts.n ?? 3);
  const door = Object.values(w.doors).find((d) => d.kind === kind)!;
  t.state = 'docked';
  t.doorId = door.id;
  door.truckId = t.id;
  return { c, t, door };
}
const buyForklifts = (w: World, n: number) => {
  for (let i = 0; i < n; i++) must(applyCommand(w, { type: 'buyForklift' }));
};

describe('jobs', () => {
  it('creates an UNLOAD job per pallet and sends the idle forklift to the nearest rack slot', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 12, y: 9 }, orient: 'h' }));
    dockedTruck(w, 'in');
    updateJobs(w);
    const jobs = Object.values(w.jobs);
    expect(jobs).toHaveLength(3);
    expect(jobs.every((j) => j.type === 'UNLOAD')).toBe(true);
    const mine = jobs.find((j) => j.forkliftId === 'fl-1')!;
    expect(mine.dest?.kind === 'rack' && mine.dest.slot < 2).toBe(true);
    expect(w.forklifts['fl-1'].state).toBe('toPickup');
    expect(Object.values(w.reservations)).toContain(mine.id);
  });
  it('keeps heavy products on rack level 0', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 12, y: 9 }, orient: 'h' }));
    buyForklifts(w, 2);
    dockedTruck(w, 'in', { product: 'water' });
    updateJobs(w);
    const dests = Object.values(w.jobs).map((j) => j.dest!);
    const rackSlots = dests.filter((d) => d.kind === 'rack').map((d) => (d.kind === 'rack' ? d.slot : -1));
    expect(rackSlots.sort()).toEqual([0, 1]);
    expect(dests.some((d) => d.kind === 'floor' || d.kind === 'staging')).toBe(true);
  });
  it('falls back to staging, then floor, when there are no racks', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeStaging', cell: { x: 15, y: 13 } }));
    buyForklifts(w, 1);
    dockedTruck(w, 'in', { n: 2 });
    updateJobs(w);
    const kinds = Object.values(w.jobs).map((j) => j.dest?.kind).sort();
    expect(kinds).toEqual(['floor', 'staging']);
  });
  it('raises a throttled "Warehouse full" alert when nothing can be placed', () => {
    const w = readyWorld();
    dockedTruck(w, 'in', { n: 1 });
    for (let x = 11; x <= 22; x++) for (let y = 7; y <= 14; y++) w.reservations[`c:${x},${y}`] = 'blocked';
    updateJobs(w);
    updateJobs(w);
    expect(w.events.filter((e) => e.text.startsWith('Warehouse full'))).toHaveLength(1);
    expect(Object.values(w.jobs)[0].forkliftId).toBeNull();
  });
  it('creates LOAD jobs when an outbound truck for the contract is docked', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 18, y: 12 }, orient: 'h' }));
    const rackId = Object.keys(w.racks)[0];
    const c = testContract(w, { product: 'boxes' });
    for (const slot of [0, 1]) {
      const loc = { kind: 'rack' as const, rackId, slot };
      attachPallet(w, createPallet(w, 'boxes', c.id, loc), loc);
    }
    updateJobs(w);
    expect(Object.keys(w.jobs)).toHaveLength(0);
    const { t } = dockedTruck(w, 'out', { contractId: c.id, n: 2 });
    updateJobs(w);
    const jobs = Object.values(w.jobs);
    expect(jobs.map((j) => j.type)).toEqual(['LOAD', 'LOAD']);
    expect(jobs.find((j) => j.forkliftId)!.dest).toEqual({ kind: 'truck', truckId: t.id });
  });
  it('sends cross-dock pallets straight to a docked outbound truck, else to staging/floor', () => {
    const w = readyWorld();
    dockedTruck(w, 'in', { type: 'crossdock', n: 1 });
    updateJobs(w);
    const j = Object.values(w.jobs)[0];
    expect(j.type).toBe('CROSSDOCK');
    expect(j.dest!.kind).toBe('floor');
    const w2 = readyWorld();
    const { c: c2 } = dockedTruck(w2, 'in', { type: 'crossdock', n: 1 });
    const { t: out } = dockedTruck(w2, 'out', { contractId: c2.id, n: 1 });
    updateJobs(w2);
    expect(Object.values(w2.jobs)[0].dest).toEqual({ kind: 'truck', truckId: out.id });
  });
  it('prefers rush contracts over nearer work', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 18, y: 9 }, orient: 'h' }));
    must(applyCommand(w, { type: 'placeStaging', cell: { x: 11, y: 8 } }));
    must(applyCommand(w, { type: 'placeStaging', cell: { x: 21, y: 13 } }));
    const near = testContract(w, { deadline: w.minute + 100 });
    const far = testContract(w, { deadline: w.minute + 900, rush: true });
    const pNear = createPallet(w, 'boxes', near.id, { kind: 'staging', cell: { x: 11, y: 8 } });
    attachPallet(w, pNear, pNear.loc);
    const pFar = createPallet(w, 'boxes', far.id, { kind: 'staging', cell: { x: 21, y: 13 } });
    attachPallet(w, pFar, pFar.loc);
    updateJobs(w);
    expect(w.jobs[`job-${pFar.id}`].forkliftId).toBe('fl-1');
    expect(w.jobs[`job-${pNear.id}`].forkliftId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/jobs.test.ts`
Expected: FAIL — cannot resolve `./jobs`.

- [ ] **Step 3: Implement**

`src/sim/jobs.ts`:
```ts
import { FULL_ALERT_EVERY_MIN, LOT_H, LOT_W } from './balance';
import { cellOf, isForkliftWalkable, manhattan, walkableNeighbors } from './grid';
import { isFreeFloor, isFreeStaging, releaseJob, reservationKey } from './pallets';
import { findPath } from './pathfinding';
import { PRODUCTS } from './products';
import { pushEvent, type Forklift, type Job, type JobDest, type JobType, type Pallet, type PalletLoc, type ProductId, type Truck, type Vec2, type World } from './world';

export const jobIdFor = (palletId: string): string => `job-${palletId}`;
const walk = (w: World) => (x: number, y: number) => isForkliftWalkable(w, x, y);
const CANDIDATES_PER_FORKLIFT = 6;

export function locCell(w: World, loc: PalletLoc | JobDest): Vec2 | null {
  switch (loc.kind) {
    case 'truck': {
      const t = w.trucks[loc.truckId];
      const d = t?.doorId ? w.doors[t.doorId] : undefined;
      return d ? d.cell : null;
    }
    case 'rack': {
      const r = w.racks[loc.rackId];
      return r ? r.cells[loc.slot % 2] : null;
    }
    case 'staging':
    case 'floor':
      return loc.cell;
    case 'forklift': {
      const f = w.forklifts[loc.forkliftId];
      return f ? cellOf(f.pos) : null;
    }
  }
}

export function accessCells(w: World, loc: PalletLoc | JobDest): Vec2[] {
  const c = locCell(w, loc);
  if (!c || loc.kind === 'forklift') return [];
  if (loc.kind === 'truck' || loc.kind === 'staging') return [c];
  return walkableNeighbors(w, c);
}

function pendingLoads(w: World, truckId: string): number {
  let n = 0;
  for (const j of Object.values(w.jobs)) if (j.dest?.kind === 'truck' && j.dest.truckId === truckId) n++;
  return n;
}

export function outTruckWithRoom(w: World, contractId: string): Truck | null {
  for (const t of Object.values(w.trucks)) {
    if (t.kind === 'out' && t.state === 'docked' && t.contractId === contractId && t.palletIds.length + pendingLoads(w, t.id) < t.capacity) return t;
  }
  return null;
}

export function freeRackSlots(w: World, product: ProductId): { rackId: string; slot: number; cell: Vec2 }[] {
  const heavy = PRODUCTS[product].heavy;
  const out: { rackId: string; slot: number; cell: Vec2 }[] = [];
  for (const r of Object.values(w.racks)) {
    for (let s = 0; s < 4; s++) {
      if (heavy && s >= 2) continue;
      if (r.slots[s] === null && !w.reservations[`r:${r.id}:${s}`]) out.push({ rackId: r.id, slot: s, cell: r.cells[s % 2] });
    }
  }
  return out;
}

function nearest<T>(items: T[], at: (t: T) => Vec2, ref: Vec2): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const it of items) {
    const d = manhattan(at(it), ref);
    if (d < bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}

function stagingOrFloor(w: World, ref: Vec2): JobDest | null {
  const s = nearest(Object.values(w.staging).filter((c) => isFreeStaging(w, c)), (c) => c, ref);
  if (s) return { kind: 'staging', cell: { ...s } };
  const floor: Vec2[] = [];
  for (let y = 0; y < LOT_H; y++) {
    for (let x = 0; x < LOT_W; x++) {
      const c = { x, y };
      if (isFreeFloor(w, c) && walkableNeighbors(w, c).length > 0) floor.push(c);
    }
  }
  const f = nearest(floor, (c) => c, ref);
  return f ? { kind: 'floor', cell: f } : null;
}

interface JobCtx {
  freeNormal: boolean;
  freeHeavy: boolean;
  loadable: Set<string>;
}

function makeCtx(w: World): JobCtx {
  const loadable = new Set<string>();
  for (const t of Object.values(w.trucks)) if (t.kind === 'out' && t.state === 'docked' && t.palletIds.length < t.capacity) loadable.add(t.contractId);
  return { freeNormal: freeRackSlots(w, 'boxes').length > 0, freeHeavy: freeRackSlots(w, 'water').length > 0, loadable };
}

export function desiredJobType(w: World, p: Pallet, ctx: JobCtx = makeCtx(w)): JobType | null {
  const c = w.contracts[p.contractId];
  if (!c || c.status !== 'active') return null;
  const loc = p.loc;
  if (loc.kind === 'forklift') return null;
  if (loc.kind === 'truck') {
    const t = w.trucks[loc.truckId];
    if (!t || t.kind !== 'in' || t.state !== 'docked') return null;
    return c.type === 'crossdock' ? 'CROSSDOCK' : 'UNLOAD';
  }
  if (ctx.loadable.has(c.id)) return 'LOAD';
  const hasSlot = PRODUCTS[p.product].heavy ? ctx.freeHeavy : ctx.freeNormal;
  if (c.type === 'storage' && (loc.kind === 'staging' || loc.kind === 'floor') && hasSlot) return 'PUTAWAY';
  return null;
}

export function generateJobs(w: World): void {
  for (const j of Object.values(w.jobs)) {
    if (!w.pallets[j.palletId]) {
      releaseJob(w, j);
      delete w.jobs[j.id];
    }
  }
  const ctx = makeCtx(w);
  for (const p of Object.values(w.pallets)) {
    if (p.loc.kind === 'forklift') continue;
    const id = jobIdFor(p.id);
    const existing = w.jobs[id];
    if (existing?.forkliftId) continue;
    const type = desiredJobType(w, p, ctx);
    if (!type) {
      if (existing) delete w.jobs[id];
      continue;
    }
    if (existing) existing.type = type;
    else w.jobs[id] = { id, type, palletId: p.id, forkliftId: null, dest: null, manual: false };
  }
}

export function chooseDest(w: World, job: Job, p: Pallet): JobDest | null {
  const here = locCell(w, p.loc) ?? { x: 0, y: 0 };
  switch (job.type) {
    case 'UNLOAD': {
      const s = nearest(freeRackSlots(w, p.product), (x) => x.cell, here);
      if (s) return { kind: 'rack', rackId: s.rackId, slot: s.slot };
      return stagingOrFloor(w, here);
    }
    case 'PUTAWAY': {
      const s = nearest(freeRackSlots(w, p.product), (x) => x.cell, here);
      return s ? { kind: 'rack', rackId: s.rackId, slot: s.slot } : null;
    }
    case 'CROSSDOCK': {
      const t = outTruckWithRoom(w, p.contractId);
      if (t) return { kind: 'truck', truckId: t.id };
      const outDoor = nearest(Object.values(w.doors).filter((d) => d.kind === 'out'), (d) => d.cell, here);
      return stagingOrFloor(w, outDoor ? outDoor.cell : here);
    }
    case 'LOAD': {
      const t = outTruckWithRoom(w, p.contractId);
      return t ? { kind: 'truck', truckId: t.id } : null;
    }
  }
}

export function assignJobTo(w: World, f: Forklift, job: Job, manual = false): boolean {
  const p = w.pallets[job.palletId];
  if (!p) return false;
  const dest = chooseDest(w, job, p);
  if (!dest) {
    if ((job.type === 'UNLOAD' || job.type === 'CROSSDOCK') && w.minute - w.lastFullAlert >= FULL_ALERT_EVERY_MIN) {
      w.lastFullAlert = w.minute;
      pushEvent(w, 'alert', 'Warehouse full — build racks or staging');
    }
    return false;
  }
  const goals = accessCells(w, p.loc);
  const path = findPath(cellOf(f.pos), goals, walk(w));
  if (!path) return false;
  job.forkliftId = f.id;
  job.dest = dest;
  job.manual = manual;
  const k = reservationKey(dest);
  if (k) w.reservations[k] = job.id;
  f.jobId = job.id;
  f.goals = goals;
  f.path = path;
  f.state = 'toPickup';
  f.waited = 0;
  return true;
}

function relatesToTruck(w: World, j: Job, truckId: string): boolean {
  const p = w.pallets[j.palletId];
  const t = w.trucks[truckId];
  if (!p || !t) return false;
  if (p.loc.kind === 'truck' && p.loc.truckId === truckId) return true;
  return t.kind === 'out' && p.contractId === t.contractId && (j.type === 'LOAD' || j.type === 'CROSSDOCK');
}

export function assignJobs(w: World): void {
  const idle = Object.values(w.forklifts).filter((f) => f.state === 'idle' && f.blockedUntil <= w.minute);
  if (!idle.length) return;
  for (const f of idle) {
    if (f.focusTruckId) {
      const t = w.trucks[f.focusTruckId];
      if (!t || t.state === 'departing') f.focusTruckId = null;
    }
    let pool = Object.values(w.jobs).filter((j) => !j.forkliftId);
    if (!pool.length) return;
    if (f.focusTruckId) {
      const focused = pool.filter((j) => relatesToTruck(w, j, f.focusTruckId!));
      if (focused.length) pool = focused;
    }
    const here = cellOf(f.pos);
    const ranked = pool
      .map((j) => {
        const p = w.pallets[j.palletId];
        const c = w.contracts[p.contractId];
        const at = locCell(w, p.loc) ?? here;
        return { j, rush: c?.rush ? 0 : 1, deadline: c?.deadline ?? Infinity, dist: manhattan(here, at) };
      })
      .sort((a, b) => a.rush - b.rush || a.deadline - b.deadline || a.dist - b.dist)
      .slice(0, CANDIDATES_PER_FORKLIFT);
    for (const { j } of ranked) if (assignJobTo(w, f, j)) break;
  }
}

export function updateJobs(w: World): void {
  generateJobs(w);
  assignJobs(w);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/sim`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sim): job generation, destination choice and forklift assignment"
```

---

### Task 9: Forklifts — movement, handling, blocking, manual orders

**Files:**
- Create: `src/sim/forklifts.ts`, `src/sim/forklifts.test.ts`
- Modify: `src/sim/commands.ts` (add `orderForklifts`)

**Interfaces:**
- Consumes: `jobs.ts` (`accessCells`, `assignJobTo`, `jobIdFor`), `pallets.ts`, `grid.ts`, `pathfinding.ts`, `products.ts`, `balance.ts`
- Produces:
  - `activateParked(w)`, `updateForklifts(w)`, `cancelJob(w, f)` (re-queues the job and drops any carried pallet at the nearest free staging or floor cell), `breakdown(w, f, minutes)`
  - `type OrderTarget = { kind: 'truck'; truckId: string } | { kind: 'pallet'; palletId: string } | { kind: 'cell'; cell: Vec2 }`
  - `orderForklifts(w, ids, target): CommandResult`
  - Command `{ type: 'orderForklifts'; forkliftIds: string[]; target: OrderTarget }`
  - `handlingTarget(w, f): PalletLoc | JobDest | null`: what the forks are working on (used by the renderer for fork height)

- [ ] **Step 1: Write the failing test**

`src/sim/forklifts.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import { failContract } from './contracts';
import { activateParked, breakdown, updateForklifts } from './forklifts';
import { rebuildGrid } from './grid';
import { generateJobs, updateJobs } from './jobs';
import { scheduleTruck, updateTrucks } from './trucks';
import { createWorld, type World } from './world';
import { must, readyWorld, runMinutes, testContract } from './testUtils';

const tick = (w: World) => {
  updateTrucks(w);
  updateJobs(w);
  updateForklifts(w);
};

describe('forklifts', () => {
  it('activates the parked starter forklift when a building is ready', () => {
    const w = createWorld(1, 'scenario');
    must(applyCommand(w, { type: 'buildFootprint', rect: { x: 10, y: 6, w: 12, h: 8 } }));
    activateParked(w);
    expect(w.forklifts['fl-1'].state).toBe('parked');
    w.minute += 120;
    rebuildGrid(w);
    activateParked(w);
    expect(w.forklifts['fl-1'].state).toBe('idle');
    expect(w.forklifts['fl-1'].pos).toEqual({ x: 11, y: 7 });
  });
  it('unloads a whole truck into racks and the truck leaves', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 12, y: 10 }, orient: 'h' }));
    must(applyCommand(w, { type: 'placeRack', cell: { x: 16, y: 10 }, orient: 'h' }));
    const c = testContract(w);
    const t = scheduleTruck(w, c, 'in', w.minute + 1, 4);
    runMinutes(w, 300, tick);
    const pallets = Object.values(w.pallets);
    expect(pallets).toHaveLength(4);
    expect(pallets.every((p) => p.loc.kind === 'rack')).toBe(true);
    expect(w.trucks[t.id]).toBeUndefined();
    expect(w.stats.palletsHandled).toBe(4);
    expect(Object.keys(w.reservations)).toHaveLength(0);
  });
  it('moves to a cell on a manual order and rejects non-walkable cells', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'orderForklifts', forkliftIds: ['fl-1'], target: { kind: 'cell', cell: { x: 20, y: 12 } } }));
    runMinutes(w, 60, updateForklifts);
    expect(w.forklifts['fl-1'].pos).toEqual({ x: 20, y: 12 });
    expect(w.forklifts['fl-1'].state).toBe('idle');
    expect(applyCommand(w, { type: 'orderForklifts', forkliftIds: ['fl-1'], target: { kind: 'cell', cell: { x: 10, y: 10 } } }).ok).toBe(false);
  });
  it('nudges an idle forklift out of a 1-wide aisle instead of stalling', () => {
    const w = readyWorld();
    // Wall off everything except row y=10 between x=12..20 using racks placed directly.
    for (let x = 12; x <= 20; x += 2) {
      w.racks[`top${x}`] = { id: `top${x}`, cells: [{ x, y: 9 }, { x: x + 1, y: 9 }], slots: [null, null, null, null] };
      w.racks[`bot${x}`] = { id: `bot${x}`, cells: [{ x, y: 11 }, { x: x + 1, y: 11 }], slots: [null, null, null, null] };
    }
    rebuildGrid(w);
    must(applyCommand(w, { type: 'buyForklift' }));
    const [a, b] = Object.values(w.forklifts);
    a.pos = { x: 11, y: 10 };
    a.prev = { ...a.pos };
    b.pos = { x: 16, y: 10 };
    b.prev = { ...b.pos };
    must(applyCommand(w, { type: 'orderForklifts', forkliftIds: [a.id], target: { kind: 'cell', cell: { x: 22, y: 10 } } }));
    runMinutes(w, 120, updateForklifts);
    expect(a.pos).toEqual({ x: 22, y: 10 });
  });
  it('a manual pallet order takes over that pallet’s job', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 12, y: 10 }, orient: 'h' }));
    must(applyCommand(w, { type: 'buyForklift' }));
    const c = testContract(w);
    const t = scheduleTruck(w, c, 'in', w.minute, 2);
    runMinutes(w, 60, updateTrucks);
    generateJobs(w);
    const pid = t.palletIds[1];
    const other = Object.keys(w.forklifts).find((id) => id !== 'fl-1')!;
    must(applyCommand(w, { type: 'orderForklifts', forkliftIds: [other], target: { kind: 'pallet', palletId: pid } }));
    expect(w.jobs[`job-${pid}`]).toMatchObject({ forkliftId: other, manual: true });
  });
  it('breakdown drops a carried pallet nearby and frees the job', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 12, y: 10 }, orient: 'h' }));
    const c = testContract(w);
    scheduleTruck(w, c, 'in', w.minute, 1);
    const f = w.forklifts['fl-1'];
    let guard = 0;
    while (!f.carrying && guard++ < 300) runMinutes(w, 1, tick);
    expect(f.carrying).not.toBeNull();
    const pid = f.carrying!;
    breakdown(w, f, 120);
    expect(f.state).toBe('broken');
    expect(f.carrying).toBeNull();
    expect(['floor', 'staging']).toContain(w.pallets[pid].loc.kind);
    expect(w.jobs[`job-${pid}`]?.forkliftId ?? null).toBeNull();
  });
  it('contract failure while carrying frees the forklift with no leaks', () => {
    const w = readyWorld();
    must(applyCommand(w, { type: 'placeRack', cell: { x: 12, y: 10 }, orient: 'h' }));
    const c = testContract(w);
    scheduleTruck(w, c, 'in', w.minute, 2);
    const f = w.forklifts['fl-1'];
    let guard = 0;
    while (!f.carrying && guard++ < 300) runMinutes(w, 1, tick);
    failContract(w, c);
    expect(f.carrying).toBeNull();
    expect(f.jobId).toBeNull();
    expect(f.state).toBe('idle');
    expect(Object.keys(w.jobs)).toHaveLength(0);
    expect(Object.keys(w.reservations)).toHaveLength(0);
    expect(Object.keys(w.pallets)).toHaveLength(0);
    runMinutes(w, 5, tick);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/forklifts.test.ts`
Expected: FAIL — cannot resolve `./forklifts`.

- [ ] **Step 3: Implement**

`src/sim/forklifts.ts`:
```ts
import { BLOCKED_MARKER_MIN, BLOCK_REPLAN_MIN, FAST_DRIVE, FAST_LIFT, FORKLIFT_SPEED, FRAGILE_FACTOR, HANDLE_MIN } from './balance';
import type { CommandResult } from './commands';
import { cellOf, findSpawnCell, isForkliftWalkable, walkableNeighbors } from './grid';
import { accessCells, assignJobTo, jobIdFor } from './jobs';
import { attachPallet, detachPallet, isFreeFloor, isFreeStaging, releaseJob, reservationKey } from './pallets';
import { findPath } from './pathfinding';
import { PRODUCTS } from './products';
import { cellKey, type Forklift, type JobDest, type PalletLoc, type Vec2, type World } from './world';

export type OrderTarget = { kind: 'truck'; truckId: string } | { kind: 'pallet'; palletId: string } | { kind: 'cell'; cell: Vec2 };

const walk = (w: World) => (x: number, y: number) => isForkliftWalkable(w, x, y);
const same = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;

export function activateParked(w: World): void {
  for (const f of Object.values(w.forklifts)) {
    if (f.state !== 'parked') continue;
    const s = findSpawnCell(w);
    if (!s) return;
    f.pos = { ...s };
    f.prev = { ...s };
    f.state = 'idle';
  }
}

function nearestDropSpot(w: World, from: Vec2): PalletLoc | null {
  const seen = new Set<string>([cellKey(from)]);
  const queue: Vec2[] = [from];
  while (queue.length && seen.size < 600) {
    const c = queue.shift()!;
    for (const n of [
      { x: c.x + 1, y: c.y },
      { x: c.x - 1, y: c.y },
      { x: c.x, y: c.y + 1 },
      { x: c.x, y: c.y - 1 },
    ]) {
      const k = cellKey(n);
      if (seen.has(k)) continue;
      seen.add(k);
      if (isFreeStaging(w, n)) return { kind: 'staging', cell: n };
      if (isFreeFloor(w, n) && !w.cellPallets[k]) return { kind: 'floor', cell: n };
      if (isForkliftWalkable(w, n.x, n.y)) queue.push(n);
    }
  }
  return null;
}

export function cancelJob(w: World, f: Forklift): void {
  const job = f.jobId ? w.jobs[f.jobId] : undefined;
  if (job) releaseJob(w, job);
  if (f.carrying) {
    const p = w.pallets[f.carrying];
    if (p) {
      const spot = nearestDropSpot(w, cellOf(f.pos)) ?? { kind: 'floor' as const, cell: cellOf(f.pos) };
      detachPallet(w, p);
      attachPallet(w, p, spot);
    }
    f.carrying = null;
  }
  f.jobId = null;
  f.path = [];
  if (f.state !== 'broken' && f.state !== 'parked') f.state = 'idle';
}

export function breakdown(w: World, f: Forklift, minutes: number): void {
  cancelJob(w, f);
  f.state = 'broken';
  f.brokenUntil = w.minute + minutes;
  f.focusTruckId = null;
}

function handleTime(w: World, f: Forklift): number {
  const pid = f.carrying ?? (f.jobId ? w.jobs[f.jobId]?.palletId : null);
  const p = pid ? w.pallets[pid] : undefined;
  let t = HANDLE_MIN * (p && PRODUCTS[p.product].fragile ? FRAGILE_FACTOR : 1);
  if (f.fast) t /= FAST_LIFT;
  return t;
}

export function handlingTarget(w: World, f: Forklift): PalletLoc | JobDest | null {
  const job = f.jobId ? w.jobs[f.jobId] : undefined;
  if (!job) return null;
  if (f.state === 'lifting' || f.state === 'toPickup') return w.pallets[job.palletId]?.loc ?? null;
  return job.dest;
}

function taskStillValid(w: World, f: Forklift): boolean {
  if (f.state === 'moving') return true;
  const job = f.jobId ? w.jobs[f.jobId] : undefined;
  if (!job || !job.dest) return false;
  const p = w.pallets[job.palletId];
  if (!p) return false;
  if (f.state === 'toPickup' || f.state === 'lifting') {
    if (p.loc.kind === 'truck') return w.trucks[p.loc.truckId]?.state === 'docked';
    return p.loc.kind !== 'forklift';
  }
  if (job.dest.kind === 'truck') return w.trucks[job.dest.truckId]?.state === 'docked';
  if (job.dest.kind === 'rack') return !!w.racks[job.dest.rackId];
  return true;
}

function replan(w: World, f: Forklift, occ: Map<string, string>, avoidOthers: boolean): boolean {
  const here = cellKey(cellOf(f.pos));
  const blocked = avoidOthers ? new Set([...occ.keys()].filter((k) => k !== here)) : undefined;
  const p = findPath(cellOf(f.pos), f.goals, walk(w), blocked);
  if (p) {
    f.path = p;
    return true;
  }
  f.blockedUntil = w.minute + BLOCKED_MARKER_MIN;
  if (f.jobId) cancelJob(w, f);
  else {
    f.path = [];
    f.state = 'idle';
  }
  return false;
}

function nudge(w: World, other: Forklift, occ: Map<string, string>, by: Forklift): void {
  const free = walkableNeighbors(w, cellOf(other.pos)).filter((c) => !occ.has(cellKey(c)) && !same(c, cellOf(by.pos)));
  // Prefer stepping aside off the requester's path; in a 1-wide aisle, step ahead along it instead.
  const spot = free.find((c) => !by.path.some((p) => same(p, c))) ?? free[0];
  if (!spot) return;
  other.path = [spot];
  other.goals = [spot];
  other.state = 'moving';
}

function stepMove(w: World, f: Forklift, occ: Map<string, string>): 'moving' | 'arrived' | 'blocked' {
  if (!f.path.length) return 'arrived';
  const next = f.path[0];
  const here = cellKey(cellOf(f.pos));
  const nk = cellKey(next);
  if (nk !== here && !isForkliftWalkable(w, next.x, next.y)) return replan(w, f, occ, false) ? 'moving' : 'blocked';
  const otherId = occ.get(nk);
  if (otherId && otherId !== f.id) {
    const other = w.forklifts[otherId];
    if (other && other.state === 'idle') nudge(w, other, occ, f);
    f.waited += 1;
    if (f.waited >= BLOCK_REPLAN_MIN) {
      f.waited = 0;
      replan(w, f, occ, true);
    }
    return 'blocked';
  }
  f.waited = 0;
  let budget = FORKLIFT_SPEED * (f.fast ? FAST_DRIVE : 1);
  while (budget > 1e-9 && f.path.length) {
    const n = f.path[0];
    const occupant = occ.get(cellKey(n));
    if (occupant && occupant !== f.id) break;
    const dx = n.x - f.pos.x;
    const dy = n.y - f.pos.y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-6) f.heading = Math.atan2(dy, dx);
    if (d <= budget) {
      f.pos = { x: n.x, y: n.y };
      f.path.shift();
      budget -= d;
    } else {
      f.pos = { x: f.pos.x + (dx / d) * budget, y: f.pos.y + (dy / d) * budget };
      budget = 0;
    }
  }
  if (occ.get(here) === f.id) occ.delete(here);
  occ.set(cellKey(cellOf(f.pos)), f.id);
  return f.path.length ? 'moving' : 'arrived';
}

function pickUp(w: World, f: Forklift): void {
  const job = f.jobId ? w.jobs[f.jobId] : undefined;
  const p = job ? w.pallets[job.palletId] : undefined;
  if (!job || !p || !job.dest) {
    cancelJob(w, f);
    return;
  }
  detachPallet(w, p);
  attachPallet(w, p, { kind: 'forklift', forkliftId: f.id });
  const goals = accessCells(w, job.dest);
  const path = findPath(cellOf(f.pos), goals, walk(w));
  if (!path) {
    cancelJob(w, f);
    return;
  }
  f.goals = goals;
  f.path = path;
  f.state = 'toDrop';
}

function dropOff(w: World, f: Forklift): void {
  const job = f.jobId ? w.jobs[f.jobId] : undefined;
  const p = job ? w.pallets[job.palletId] : undefined;
  if (!job || !p || !job.dest) {
    cancelJob(w, f);
    return;
  }
  const d = job.dest;
  detachPallet(w, p);
  let loc: PalletLoc;
  if (d.kind === 'truck') loc = { kind: 'truck', truckId: d.truckId };
  else if (d.kind === 'rack') loc = { kind: 'rack', rackId: d.rackId, slot: d.slot };
  else if (d.kind === 'staging') loc = { kind: 'staging', cell: { ...d.cell } };
  else loc = { kind: 'floor', cell: { ...d.cell } };
  attachPallet(w, p, loc);
  const k = reservationKey(d);
  if (k) delete w.reservations[k];
  delete w.jobs[job.id];
  f.jobId = null;
  f.carrying = null;
  f.state = 'idle';
  w.stats.palletsHandled++;
}

export function updateForklifts(w: World): void {
  const occ = new Map<string, string>();
  for (const f of Object.values(w.forklifts)) if (f.state !== 'parked') occ.set(cellKey(cellOf(f.pos)), f.id);
  for (const f of Object.values(w.forklifts)) {
    f.prev = { x: f.pos.x, y: f.pos.y };
    switch (f.state) {
      case 'broken':
        if (w.minute >= f.brokenUntil) f.state = 'idle';
        break;
      case 'toPickup':
      case 'toDrop':
      case 'moving': {
        if (!taskStillValid(w, f)) {
          cancelJob(w, f);
          break;
        }
        if (stepMove(w, f, occ) !== 'arrived') break;
        if (f.state === 'toPickup') {
          f.state = 'lifting';
          f.timer = handleTime(w, f);
        } else if (f.state === 'toDrop') {
          f.state = 'dropping';
          f.timer = handleTime(w, f);
        } else f.state = 'idle';
        break;
      }
      case 'lifting':
        if (!taskStillValid(w, f)) {
          cancelJob(w, f);
          break;
        }
        f.timer -= 1;
        if (f.timer <= 0) pickUp(w, f);
        break;
      case 'dropping':
        if (!taskStillValid(w, f)) {
          cancelJob(w, f);
          break;
        }
        f.timer -= 1;
        if (f.timer <= 0) dropOff(w, f);
        break;
      default:
        break;
    }
  }
}

export function orderForklifts(w: World, ids: string[], target: OrderTarget): CommandResult {
  const fls = ids.map((id) => w.forklifts[id]).filter((f): f is Forklift => !!f && f.state !== 'parked' && f.state !== 'broken');
  if (!fls.length) return { ok: false, reason: 'No available forklift selected' };
  switch (target.kind) {
    case 'truck': {
      if (!w.trucks[target.truckId]) return { ok: false, reason: 'That truck has left' };
      for (const f of fls) {
        cancelJob(w, f);
        f.focusTruckId = target.truckId;
      }
      return { ok: true };
    }
    case 'pallet': {
      const job = w.jobs[jobIdFor(target.palletId)];
      if (!job) return { ok: false, reason: 'This pallet has nothing to do right now' };
      if (job.forkliftId) {
        const owner = w.forklifts[job.forkliftId];
        if (fls.includes(owner)) return { ok: true };
        cancelJob(w, owner);
      }
      const f = fls[0];
      cancelJob(w, f);
      return assignJobTo(w, f, job, true) ? { ok: true } : { ok: false, reason: 'Can’t reach that pallet' };
    }
    case 'cell': {
      const c = target.cell;
      if (!isForkliftWalkable(w, c.x, c.y)) return { ok: false, reason: 'Forklifts can’t drive there' };
      let moved = 0;
      for (const f of fls) {
        cancelJob(w, f);
        f.focusTruckId = null;
        const path = findPath(cellOf(f.pos), [c], walk(w));
        if (!path) continue;
        f.path = path;
        f.goals = [c];
        f.state = 'moving';
        moved++;
      }
      return moved ? { ok: true } : { ok: false, reason: 'No route to that spot' };
    }
  }
}
```

In `src/sim/commands.ts`: add `import { orderForklifts, type OrderTarget } from './forklifts';`, extend the union with `| { type: 'orderForklifts'; forkliftIds: string[]; target: OrderTarget }`, and add:
```ts
    case 'orderForklifts':
      return orderForklifts(w, cmd.forkliftIds, cmd.target);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/sim`
Expected: PASS. In the aisle test the idle forklift is nudged ahead down the aisle until it can step aside at the open end. If the requester waits 3 minutes, it re-plans around through row y = 8. Either way it reaches (22,10).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sim): forklift movement, handling, blocking/nudging and manual orders"
```

---
### Task 10: Midnight economy, random events, scenarios, tick, golden tests

**Files:**
- Modify: `src/sim/economy.ts` (add `runMidnight`)
- Create: `src/sim/events.ts`, `src/sim/scenarios.ts`, `src/sim/tick.ts`, `src/sim/tick.test.ts`, `src/sim/golden.test.ts`

**Interfaces:**
- Consumes: everything in `src/sim`
- Produces:
  - `runMidnight(w)`: adds rent (stored pallets of active storage contracts × `rentPerDay`) and subtracts wages and upkeep
  - `rollEvent(w)`: rolls once per in-game hour; may make a truck arrive early, break down a forklift, or post a hot cross-dock offer
  - `newGame(mode, seed): World` (world plus 3 offers), `checkOutcome(w)`
  - `step(w)`, `runFor(w, minutes)`
- Step order: minute+1 → construction completion → daily offers at 06:00 → hourly event roll → contracts → trucks → jobs → forklifts → contract completion → midnight economy → win/lose.

- [ ] **Step 1: Write the failing tests**

`src/sim/tick.test.ts`:
```ts
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
```

`src/sim/golden.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import { canAcceptContract, makeOffer } from './contracts';
import { newGame } from './scenarios';
import { runFor, step } from './tick';
import type { World } from './world';
import { must } from './testUtils';

function firstLot(seed: number): { w: World; contractId: string } {
  const w = newGame('scenario', seed);
  must(applyCommand(w, { type: 'buildFootprint', rect: { x: 12, y: 6, w: 14, h: 10 } }));
  runFor(w, 121);
  must(applyCommand(w, { type: 'placeDoor', cell: { x: 16, y: 15 }, kind: 'in' }));
  must(applyCommand(w, { type: 'placeDoor', cell: { x: 22, y: 15 }, kind: 'out' }));
  for (const y of [8, 11]) for (const x of [14, 16, 18, 20]) must(applyCommand(w, { type: 'placeRack', cell: { x, y }, orient: 'h' }));
  const c = makeOffer(w, 'storage');
  w.contracts[c.id] = c;
  must(applyCommand(w, { type: 'acceptContract', contractId: c.id }));
  return { w, contractId: c.id };
}

describe('golden scenario', () => {
  it('completes a storage contract end to end', () => {
    const { w, contractId } = firstLot(42);
    const c = w.contracts[contractId];
    while (c.status === 'active') step(w);
    expect(c.status).toBe('done');
    // Unload + load; a breakdown mid-carry can add an extra put-away.
    expect(w.stats.palletsHandled).toBeGreaterThanOrEqual(c.qty * 2);
    expect(w.cash).toBeGreaterThan(0);
  });
  it('is deterministic for the same seed and commands', () => {
    const a = firstLot(7).w;
    const b = firstLot(7).w;
    runFor(a, 2000);
    runFor(b, 2000);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('simulates a busy 7-day sandbox in under 2 seconds', () => {
    const w = newGame('sandbox', 7);
    w.cash = 5_000_000;
    must(applyCommand(w, { type: 'buildFootprint', rect: { x: 5, y: 2, w: 30, h: 18 } }));
    runFor(w, 121);
    for (const x of [10, 14]) must(applyCommand(w, { type: 'placeDoor', cell: { x, y: 19 }, kind: 'in' }));
    for (const x of [24, 28]) must(applyCommand(w, { type: 'placeDoor', cell: { x, y: 19 }, kind: 'out' }));
    for (const y of [5, 8, 11, 14]) for (let x = 7; x <= 31; x += 3) must(applyCommand(w, { type: 'placeRack', cell: { x, y }, orient: 'h' }));
    for (let i = 0; i < 6; i++) must(applyCommand(w, { type: 'buyForklift' }));
    const t0 = performance.now();
    while (w.minute < 7 * 1440) {
      if (w.minute % 60 === 0) {
        for (const c of Object.values(w.contracts)) if (canAcceptContract(w, c).ok) applyCommand(w, { type: 'acceptContract', contractId: c.id });
      }
      step(w);
    }
    const ms = performance.now() - t0;
    expect(w.stats.onTime + w.stats.late).toBeGreaterThan(5);
    expect(ms).toBeLessThan(2000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sim/tick.test.ts src/sim/golden.test.ts`
Expected: FAIL — cannot resolve `./events`, `./scenarios`, `./tick`, and `runMidnight` is not exported.

- [ ] **Step 3: Implement**

Append to `src/sim/economy.ts`:
```ts
import { RUNNING_PER_CELL, WAGE_PER_FORKLIFT } from './balance';
import { readyCellCount } from './grid';
import { isStoredLoc } from './pallets';
import { fmtMoney, pushEvent } from './world';

export function runMidnight(w: World): void {
  let rent = 0;
  for (const p of Object.values(w.pallets)) {
    const c = w.contracts[p.contractId];
    if (c && c.type === 'storage' && c.status === 'active' && isStoredLoc(p.loc)) rent += c.rentPerDay;
  }
  const wages = Object.keys(w.forklifts).length * WAGE_PER_FORKLIFT;
  const upkeep = readyCellCount(w) * RUNNING_PER_CELL;
  if (rent) earn(w, rent);
  spend(w, wages + upkeep);
  pushEvent(w, 'toast', `Midnight: rent +${fmtMoney(rent)} · wages & upkeep −${fmtMoney(wages + upkeep)}`);
}
```
(Move these imports to the top of the file, next to the existing `import type { World } from './world';`.)

`src/sim/events.ts`:
```ts
import { BREAKDOWN_MIN, EVENT_CHANCE_PER_HOUR, HOT_OFFER_TTL } from './balance';
import { makeOffer } from './contracts';
import { breakdown } from './forklifts';
import { cellOf } from './grid';
import { chance, int, pick } from './rng';
import { fmtMoney, pushEvent, type World } from './world';

const forkliftName = (id: string) => `FL-${id.split('-')[1].padStart(2, '0')}`;

export function rollEvent(w: World): void {
  if (!chance(w.rng, EVENT_CHANCE_PER_HOUR)) return;
  const kind = int(w.rng, 0, 2);
  if (kind === 0) {
    const soon = Object.values(w.trucks).filter((t) => t.state === 'scheduled' && t.arriveAt > w.minute && t.arriveAt <= w.minute + 180);
    if (!soon.length) return;
    const t = pick(w.rng, soon);
    const early = int(w.rng, 30, 60);
    t.arriveAt = Math.max(w.minute + 1, t.arriveAt - early);
    pushEvent(w, 'alert', `${t.id} (${t.client}) is arriving ${early} min early`);
  } else if (kind === 1) {
    const working = Object.values(w.forklifts).filter((f) => f.state !== 'parked' && f.state !== 'broken');
    if (!working.length) return;
    const f = pick(w.rng, working);
    breakdown(w, f, BREAKDOWN_MIN);
    pushEvent(w, 'alert', `${forkliftName(f.id)} broke down — repair for $500 or wait 2h`, { at: cellOf(f.pos) });
  } else {
    const c = makeOffer(w, 'crossdock');
    c.payout *= 2;
    c.hot = true;
    c.offerExpires = w.minute + HOT_OFFER_TTL;
    w.contracts[c.id] = c;
    pushEvent(w, 'alert', `Rush order! ${c.client}: ${c.qty} pallets cross-dock, pays ${fmtMoney(c.payout)}`);
  }
}
```

`src/sim/scenarios.ts`:
```ts
import { LOSE_CASH, LOSE_MINUTES, SCENARIO_END_MINUTE, WIN_NET_WORTH, WIN_REP } from './balance';
import { generateOffers } from './contracts';
import { netWorth } from './economy';
import { createWorld, pushEvent, type Mode, type World } from './world';

export function newGame(mode: Mode, seed: number): World {
  const w = createWorld(seed, mode);
  generateOffers(w, 3);
  pushEvent(w, 'toast', mode === 'scenario' ? 'First Lot: reach $250k net worth and 4★ by the end of Day 7' : 'Sandbox: build freely');
  return w;
}

function end(w: World, outcome: 'won' | 'lost', reason: string): void {
  w.outcome = outcome;
  w.outcomeReason = reason;
  pushEvent(w, outcome === 'won' ? 'payout' : 'alert', reason);
}

export function checkOutcome(w: World): void {
  if (w.outcome || w.mode === 'sandbox') return;
  if (w.cash < LOSE_CASH) {
    w.negativeSince ??= w.minute;
    if (w.minute - w.negativeSince >= LOSE_MINUTES) return end(w, 'lost', 'Bankrupt — cash stayed below −$20,000 for a full day');
  } else w.negativeSince = null;
  if (netWorth(w) >= WIN_NET_WORTH && w.reputation >= WIN_REP) return end(w, 'won', 'You built a warehouse empire in a week!');
  if (w.minute >= SCENARIO_END_MINUTE) end(w, 'lost', 'Day 7 is over — the goal was not reached');
}
```

`src/sim/tick.ts`:
```ts
import { MIN_PER_DAY, START_MINUTE } from './balance';
import { checkContractComplete, generateOffers, updateContracts } from './contracts';
import { runMidnight } from './economy';
import { rollEvent } from './events';
import { activateParked, updateForklifts } from './forklifts';
import { rebuildGrid } from './grid';
import { updateJobs } from './jobs';
import { int } from './rng';
import { checkOutcome } from './scenarios';
import { updateTrucks } from './trucks';
import { pushEvent, type World } from './world';

export function step(w: World): void {
  if (w.outcome) return;
  w.minute += 1;
  if (w.parts.some((p) => p.readyAt === w.minute)) {
    rebuildGrid(w);
    activateParked(w);
    pushEvent(w, 'toast', 'Construction complete');
  }
  if (w.minute % MIN_PER_DAY === START_MINUTE) generateOffers(w, int(w.rng, 3, 5));
  if (w.minute % 60 === 0) rollEvent(w);
  updateContracts(w);
  updateTrucks(w);
  updateJobs(w);
  updateForklifts(w);
  for (const c of Object.values(w.contracts)) if (c.status === 'active') checkContractComplete(w, c);
  if (w.minute % MIN_PER_DAY === 0) runMidnight(w);
  checkOutcome(w);
}

export function runFor(w: World, minutes: number): void {
  for (let i = 0; i < minutes && !w.outcome; i++) step(w);
}
```

- [ ] **Step 4: Run all sim tests**

Run: `npx vitest run src/sim`
Expected: PASS. If the performance test exceeds 2 s, profile with `npx vitest run src/sim/golden.test.ts --reporter verbose`. The usual culprit is `stagingOrFloor` scanning the whole lot for every candidate. Cache the free-floor list once per `assignJobs` call: compute it lazily on first use and store it in a `Map<number, Vec2[]>` keyed by `w.minute`. Re-run.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sim): midnight economy, random events, scenario rules and tick; golden tests"
```

---

### Task 11: Game loop, HUD snapshot and store

**Files:**
- Create: `src/game/loop.ts`, `src/game/hud.ts`, `src/game/store.ts`, `src/ui/format.ts`, `src/game/loop.test.ts`, `src/game/hud.test.ts`

**Interfaces:**
- Consumes: `sim/tick.step`, `sim/scenarios.newGame`, `sim/commands.applyCommand`, `sim/contracts` (`canAcceptContract`, `stockByProduct`), `sim/economy.netWorth`
- Produces:
  - `loop.ts`: `STEP_SECONDS = 0.1`, `loop = { acc, alpha }`, `advance(world, deltaSeconds, speed): number` (steps taken; at most 40 per frame; `delta` is clamped to 0.25 s)
  - `format.ts`: `money`, `pad2`, `timeOfDay`, `when(minute, now)`, `inDuration(min)`, `forkliftLabel(id)`, `TYPE_LABEL`
  - `hud.ts`: `Hud`, `DockRow`, `ForkliftRow`, `TruckRow`, `ContractRow`, `InventoryRow`, `makeHud(world): Hud`
  - `store.ts`: `useGame` (Zustand) with `screen, world, hud, speed, selection, tool, buildOpen, contractsOpen, checklistOpen, roofCut, hoverCell, dragRect, cameraNonce, toasts, floaters` and actions `startGame, quitToMenu, continueSandbox, dispatch, publish, setSpeed, togglePause, select, setTool, toggleBuild, toggleContracts, toggleChecklist, toggleRoof, setHoverCell, setDragRect, resetCamera`; types `Speed`, `Selection`, `BuildTool`, `Toast`, `Floater`

- [ ] **Step 1: Write the failing tests**

`src/game/loop.test.ts`:
```ts
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
```

`src/game/hud.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game`
Expected: FAIL — cannot resolve `./loop` / `./hud`.

- [ ] **Step 3: Implement**

`src/game/loop.ts`:
```ts
import { step } from '../sim/tick';
import type { World } from '../sim/world';

/** Real seconds per sim step at 1× (1 real second = 10 in-game minutes). */
export const STEP_SECONDS = 0.1;
const MAX_STEPS_PER_FRAME = 40;
const MAX_DELTA = 0.25;

export const loop = { acc: 0, alpha: 1 };

export function advance(w: World, deltaSeconds: number, speed: number): number {
  if (speed === 0 || w.outcome) {
    loop.alpha = 1;
    return 0;
  }
  loop.acc += Math.min(deltaSeconds, MAX_DELTA) * speed;
  let steps = 0;
  while (loop.acc >= STEP_SECONDS - 1e-9 && steps < MAX_STEPS_PER_FRAME) {
    step(w);
    loop.acc -= STEP_SECONDS;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) loop.acc = Math.min(loop.acc, STEP_SECONDS);
  loop.alpha = Math.min(1, Math.max(0, loop.acc / STEP_SECONDS));
  return steps;
}
```

`src/ui/format.ts`:
```ts
import { dayOf, fmtMoney } from '../sim/world';
import type { ContractType } from '../sim/world';

export const money = fmtMoney;
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const timeOfDay = (m: number) => `${pad2(Math.floor((m % 1440) / 60))}:${pad2(m % 60)}`;
export const when = (m: number, now: number) => (dayOf(m) === dayOf(now) ? timeOfDay(m) : `Day ${dayOf(m)} ${timeOfDay(m)}`);
export function inDuration(min: number): string {
  if (min <= 0) return 'now';
  const h = Math.floor(min / 60);
  const mm = Math.round(min % 60);
  return h ? `${h}h ${pad2(mm)}m` : `${mm}m`;
}
export const forkliftLabel = (id: string) => `FL-${pad2(Number(id.split('-')[1]))}`;
export const TYPE_LABEL: Record<ContractType, string> = { storage: 'Storage', crossdock: 'Cross-dock', outbound: 'Outbound' };
```

`src/game/hud.ts`:
```ts
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
```
`src/game/store.ts`:
```ts
import { create } from 'zustand';
import { applyCommand, type Command, type CommandResult } from '../sim/commands';
import { newGame } from '../sim/scenarios';
import { fmtMoney, type GameEventKind, type Mode, type Vec2, type World } from '../sim/world';
import { makeHud, type Hud } from './hud';
import { loop } from './loop';

export type Speed = 0 | 1 | 2 | 4;
export type Selection =
  | null
  | { kind: 'forklifts'; ids: string[] }
  | { kind: 'truck' | 'door' | 'rack' | 'pallet' | 'contract'; id: string };
export type BuildTool =
  | null
  | { kind: 'footprint' }
  | { kind: 'door'; doorKind: 'in' | 'out' }
  | { kind: 'rack'; orient: 'h' | 'v' }
  | { kind: 'staging' }
  | { kind: 'demolish' };
export interface Toast { id: number; kind: GameEventKind; text: string; born: number }
export interface Floater { id: number; at: Vec2; text: string; born: number }
export interface DragRect { x0: number; y0: number; x1: number; y1: number }

const TOAST_MS = 4500;
const FLOAT_MS = 2200;

interface GameState {
  screen: 'menu' | 'game';
  world: World | null;
  hud: Hud | null;
  speed: Speed;
  lastSpeed: Exclude<Speed, 0>;
  selection: Selection;
  tool: BuildTool;
  buildOpen: boolean;
  contractsOpen: boolean;
  checklistOpen: boolean;
  roofCut: boolean;
  hoverCell: Vec2 | null;
  dragRect: DragRect | null;
  cameraNonce: number;
  toasts: Toast[];
  floaters: Floater[];
  seenEventId: number;
  startGame(mode: Mode, seed: number): void;
  quitToMenu(): void;
  continueSandbox(): void;
  dispatch(cmd: Command): CommandResult;
  publish(): void;
  setSpeed(s: Speed): void;
  togglePause(): void;
  select(s: Selection): void;
  setTool(t: BuildTool): void;
  toggleBuild(): void;
  toggleContracts(): void;
  toggleChecklist(): void;
  toggleRoof(): void;
  setHoverCell(c: Vec2 | null): void;
  setDragRect(r: DragRect | null): void;
  resetCamera(): void;
}

export const useGame = create<GameState>((set, get) => ({
  screen: 'menu', world: null, hud: null, speed: 1, lastSpeed: 1, selection: null, tool: null, buildOpen: false,
  contractsOpen: false, checklistOpen: true, roofCut: false, hoverCell: null, dragRect: null, cameraNonce: 0,
  toasts: [], floaters: [], seenEventId: 0,

  startGame(mode, seed) {
    const world = newGame(mode, seed);
    loop.acc = 0;
    set({ screen: 'game', world, speed: 1, lastSpeed: 1, selection: null, tool: null, buildOpen: true, contractsOpen: false, toasts: [], floaters: [], seenEventId: 0 });
    get().publish();
  },
  quitToMenu() {
    set({ screen: 'menu', world: null, hud: null, selection: null, tool: null });
  },
  continueSandbox() {
    const w = get().world;
    if (!w) return;
    w.mode = 'sandbox';
    w.outcome = null;
    w.outcomeReason = '';
    set({ speed: 1 });
    get().publish();
  },
  dispatch(cmd) {
    const w = get().world;
    if (!w) return { ok: false, reason: 'No game running' };
    const r = applyCommand(w, cmd);
    get().publish();
    return r;
  },
  publish() {
    const { world, seenEventId, toasts, floaters, speed } = get();
    if (!world) return;
    const now = performance.now();
    const fresh = world.events.filter((e) => e.id > seenEventId);
    const nextToasts = [...toasts.filter((t) => now - t.born < TOAST_MS), ...fresh.map((e) => ({ id: e.id, kind: e.kind, text: e.text, born: now }))].slice(-5);
    const nextFloaters = [
      ...floaters.filter((f) => now - f.born < FLOAT_MS),
      ...fresh.filter((e) => e.kind === 'payout' && e.at).map((e) => ({ id: e.id, at: e.at!, text: `+${fmtMoney(e.amount ?? 0)}`, born: now })),
    ];
    set({
      hud: makeHud(world), toasts: nextToasts, floaters: nextFloaters,
      seenEventId: fresh.length ? fresh[fresh.length - 1].id : seenEventId, speed: world.outcome ? 0 : speed,
    });
  },
  setSpeed(s) {
    set(s === 0 ? { speed: 0 } : { speed: s, lastSpeed: s });
  },
  togglePause() {
    const { speed, lastSpeed } = get();
    set({ speed: speed === 0 ? lastSpeed : 0 });
  },
  select(selection) {
    set({ selection });
  },
  setTool(tool) {
    set({ tool, selection: tool ? null : get().selection, buildOpen: tool ? true : get().buildOpen });
  },
  toggleBuild() {
    const open = !get().buildOpen;
    set({ buildOpen: open, tool: open ? get().tool : null });
  },
  toggleContracts() {
    set({ contractsOpen: !get().contractsOpen });
  },
  toggleChecklist() {
    set({ checklistOpen: !get().checklistOpen });
  },
  toggleRoof() {
    set({ roofCut: !get().roofCut });
  },
  setHoverCell(c) {
    const h = get().hoverCell;
    if (h && c && h.x === c.x && h.y === c.y) return;
    set({ hoverCell: c });
  },
  setDragRect(dragRect) {
    set({ dragRect });
  },
  resetCamera() {
    set({ cameraNonce: get().cameraNonce + 1 });
  },
}));
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: PASS (all sim and game tests).
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(game): fixed-step loop, HUD snapshot and Zustand store"
```

---
### Task 12: 3D scene foundation — palette, models, camera, ground, sim driver

**Files:**
- Create: `src/render/palette.ts`, `src/render/models.tsx`, `src/render/anim.ts`, `src/render/Scene.tsx`, `src/render/CameraRig.tsx`, `src/render/SimDriver.tsx`, `src/render/Ground.tsx`, `src/render/SelectionRing.tsx`, `src/input/inputState.ts`, `src/render/anim.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useGame`, `advance`, `loop`, `sim/balance`, `sim/rng`
- Produces:
  - `palette.ts`: `C` (colour tokens), `CLIENT_LOOK`, `mat(color, opts?)` (cached `MeshStandardMaterial`)
  - `models.tsx`: `Block`, `ForkliftModel({ forksRef })` (faces +X; forks group at x=0.48), `TruckModel({ client })` (rear at x=0, body extends to +X ≈ 4.7), `RackModel()` (2 cells along X, centred), `TreeModel({ s })`
  - `anim.ts`: `lerp`, `lerpAngle`, `interp(prev, pos, alpha)`, `renderState(id)` → `{ heading, forkY }`, `popScale(age)`
  - `inputState.ts`: `inputState`, `installInputTracking()`, `isTyping(e)`
  - `Scene` (Canvas), `CameraRig`, `SimDriver`, `Ground`, `SelectionRing({ radius })`

- [ ] **Step 1: Write the failing test**

`src/render/anim.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/render/anim.test.ts`
Expected: FAIL — cannot resolve `./anim`.

- [ ] **Step 3: Implement**

`src/render/anim.ts`:
```ts
import type { Vec2 } from '../sim/world';

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function lerpAngle(a: number, b: number, t: number): number {
  const d = ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return a + d * t;
}

export const interp = (prev: Vec2, pos: Vec2, alpha: number): Vec2 => ({ x: lerp(prev.x, pos.x, alpha), y: lerp(prev.y, pos.y, alpha) });

const states = new Map<string, { heading: number; forkY: number }>();
/** Smoothed per-entity render values shared between Forklift and PalletInstances. */
export function renderState(id: string): { heading: number; forkY: number } {
  let s = states.get(id);
  if (!s) {
    s = { heading: 0, forkY: 0.06 };
    states.set(id, s);
  }
  return s;
}

/** Scale for a pallet that appeared `age` in-game minutes ago: eases from ~0 to 1 with overshoot. */
export function popScale(age: number): number {
  if (age >= 1.5) return 1;
  const t = Math.max(0, age) / 1.5;
  const c = 1.70158 * 1.4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}
```

`src/input/inputState.ts`:
```ts
export const inputState = { downX: 0, downY: 0, dragDist: 0, mouseX: -1, mouseY: -1, inside: false, entityHit: false };

let installed = false;
export function installInputTracking(): void {
  if (installed) return;
  installed = true;
  window.addEventListener(
    'pointerdown',
    (e) => {
      inputState.downX = e.clientX;
      inputState.downY = e.clientY;
      inputState.dragDist = 0;
      inputState.entityHit = false;
    },
    true,
  );
  window.addEventListener(
    'pointermove',
    (e) => {
      inputState.mouseX = e.clientX;
      inputState.mouseY = e.clientY;
      if (e.buttons) inputState.dragDist = Math.max(inputState.dragDist, Math.hypot(e.clientX - inputState.downX, e.clientY - inputState.downY));
    },
    true,
  );
}

export const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
```

`src/render/palette.ts`:
```ts
import * as THREE from 'three';
import type { ClientId } from '../sim/world';

export const C = {
  sky: '#DCE6F2',
  ground: '#E2E8F0',
  lot: '#EEF2F7',
  road: '#A9B6C8',
  roadLine: '#FFFFFF',
  bay: '#F5B83D',
  blue: '#2563EB',
  blueDark: '#1D4ED8',
  navy: '#1E293B',
  wall: '#F1F5F9',
  floor: '#E7ECF3',
  yellow: '#FACC15',
  yellowDark: '#EAB308',
  tire: '#334155',
  steel: '#64748B',
  steelLight: '#CBD5E1',
  skin: '#F2C7A5',
  trailer: '#F8FAFC',
  chassis: '#475569',
  glass: '#1E3A5F',
  rackBeam: '#F97316',
  wood: '#B7814A',
  shutter: '#E2E8F0',
  tree: '#6CC08B',
  treeDark: '#4FA872',
  trunk: '#8B6B4A',
  ok: '#16A34A',
  bad: '#EF4444',
  outDoor: '#0D9488',
} as const;

export const CLIENT_LOOK: Record<ClientId, { cab: string; stripe: string }> = {
  WareTrack: { cab: '#2563EB', stripe: '#2563EB' },
  Nordline: { cab: '#F8FAFC', stripe: '#14B8A6' },
  Cargoviva: { cab: '#F8FAFC', stripe: '#F97316' },
  Bluepeak: { cab: '#F8FAFC', stripe: '#1E3A8A' },
};

const cache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, opts: { opacity?: number; emissive?: string; roughness?: number } = {}): THREE.MeshStandardMaterial {
  const opacity = opts.opacity ?? 1;
  const key = `${color}|${opacity}|${opts.emissive ?? ''}|${opts.roughness ?? 0.7}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: opts.roughness ?? 0.7, metalness: 0.05, transparent: opacity < 1, opacity,
      depthWrite: opacity >= 1, emissive: opts.emissive ?? '#000000', emissiveIntensity: opts.emissive ? 0.6 : 0,
    });
    cache.set(key, m);
  }
  return m;
}
```

`src/render/models.tsx`:
```tsx
import { RoundedBox, Text } from '@react-three/drei';
import type { Ref } from 'react';
import type * as THREE from 'three';
import type { ClientId } from '../sim/world';
import { C, CLIENT_LOOK, mat } from './palette';

type V3 = [number, number, number];

export function Block({ p, s, c, opacity, cast = true }: { p: V3; s: V3; c: string; opacity?: number; cast?: boolean }) {
  return (
    <mesh position={p} castShadow={cast} receiveShadow material={mat(c, { opacity })}>
      <boxGeometry args={s} />
    </mesh>
  );
}

function Wheel({ p, r = 0.18, w = 0.14 }: { p: V3; r?: number; w?: number }) {
  return (
    <mesh position={p} rotation={[Math.PI / 2, 0, 0]} castShadow material={mat(C.tire)}>
      <cylinderGeometry args={[r, r, w, 14]} />
    </mesh>
  );
}

/** ~1.3 long forklift facing +X. `forksRef` is the carriage group; the caller sets its y. */
export function ForkliftModel({ forksRef }: { forksRef: Ref<THREE.Group> }) {
  return (
    <group>
      <Block p={[-0.1, 0.38, 0]} s={[0.9, 0.42, 0.7]} c={C.yellow} />
      <Block p={[-0.48, 0.52, 0]} s={[0.22, 0.52, 0.66]} c={C.yellowDark} />
      {([[-0.4, 0.28], [-0.4, -0.28], [0.2, 0.28], [0.2, -0.28]] as const).map(([x, z], i) => (
        <Block key={i} p={[x, 1.0, z]} s={[0.05, 0.8, 0.05]} c={C.navy} />
      ))}
      <Block p={[-0.1, 1.42, 0]} s={[0.72, 0.05, 0.66]} c={C.navy} />
      <mesh position={[-0.15, 0.86, 0]} castShadow material={mat(C.blue)}>
        <capsuleGeometry args={[0.14, 0.22, 4, 8]} />
      </mesh>
      <mesh position={[-0.15, 1.2, 0]} castShadow material={mat(C.skin)}>
        <sphereGeometry args={[0.11, 12, 10]} />
      </mesh>
      <Block p={[0.42, 0.95, 0.22]} s={[0.07, 1.7, 0.07]} c={C.navy} />
      <Block p={[0.42, 0.95, -0.22]} s={[0.07, 1.7, 0.07]} c={C.navy} />
      <group ref={forksRef} position={[0.48, 0.06, 0]}>
        <Block p={[0, 0.2, 0]} s={[0.05, 0.4, 0.55]} c={C.navy} />
        <Block p={[0.35, 0.02, 0.15]} s={[0.7, 0.04, 0.09]} c={C.steel} />
        <Block p={[0.35, 0.02, -0.15]} s={[0.7, 0.04, 0.09]} c={C.steel} />
      </group>
      <Wheel p={[0.22, 0.18, 0.33]} />
      <Wheel p={[0.22, 0.18, -0.33]} />
      <Wheel p={[-0.38, 0.18, 0.33]} />
      <Wheel p={[-0.38, 0.18, -0.33]} />
    </group>
  );
}

/** Truck with its rear at x=0 and cab towards +X. */
export function TruckModel({ client }: { client: ClientId }) {
  const look = CLIENT_LOOK[client];
  return (
    <group>
      <Block p={[1.8, 1.05, 0]} s={[3.6, 1.5, 1.05]} c={C.trailer} />
      <Block p={[1.8, 0.6, 0.53]} s={[3.5, 0.22, 0.02]} c={look.stripe} cast={false} />
      <Block p={[1.8, 0.6, -0.53]} s={[3.5, 0.22, 0.02]} c={look.stripe} cast={false} />
      <Block p={[2.1, 0.26, 0]} s={[4.2, 0.12, 0.9]} c={C.chassis} />
      <RoundedBox args={[0.95, 1.25, 1.05]} radius={0.12} position={[4.2, 0.92, 0]} castShadow material={mat(look.cab)} />
      <Block p={[4.66, 1.18, 0]} s={[0.06, 0.45, 0.88]} c={C.glass} cast={false} />
      <Block p={[4.25, 1.18, 0.53]} s={[0.45, 0.32, 0.02]} c={C.glass} cast={false} />
      <Block p={[4.25, 1.18, -0.53]} s={[0.45, 0.32, 0.02]} c={C.glass} cast={false} />
      <Text position={[1.8, 1.22, 0.54]} fontSize={0.4} color={look.stripe} anchorX="center" anchorY="middle">
        {client}
      </Text>
      <Text position={[1.8, 1.22, -0.54]} rotation={[0, Math.PI, 0]} fontSize={0.4} color={look.stripe} anchorX="center" anchorY="middle">
        {client}
      </Text>
      {[0.5, 1.05, 3.1, 4.3].map((x) => (
        <group key={x}>
          <Wheel p={[x, 0.24, 0.46]} r={0.24} w={0.16} />
          <Wheel p={[x, 0.24, -0.46]} r={0.24} w={0.16} />
        </group>
      ))}
    </group>
  );
}

/** Two-cell pallet rack along X, centred on the origin. Level 0 at y≈0, level 1 shelf at y≈1.15. */
export function RackModel() {
  return (
    <group>
      {[-1, 0, 1].flatMap((x) =>
        [0.45, -0.45].map((z) => <Block key={`u${x}${z}`} p={[x * 0.98, 1.2, z]} s={[0.07, 2.4, 0.07]} c={C.blue} />),
      )}
      {[1.12, 2.3].flatMap((y) => [0.45, -0.45].map((z) => <Block key={`b${y}${z}`} p={[0, y, z]} s={[2.0, 0.1, 0.06]} c={C.rackBeam} />))}
      <Block p={[0, 1.14, 0]} s={[1.96, 0.04, 0.9]} c={C.steelLight} />
    </group>
  );
}

export function TreeModel({ s = 1 }: { s?: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 0.5, 0]} castShadow material={mat(C.trunk)}>
        <cylinderGeometry args={[0.08, 0.1, 1, 8]} />
      </mesh>
      <mesh position={[0, 1.45, 0]} castShadow material={mat(C.tree)}>
        <sphereGeometry args={[0.65, 16, 12]} />
      </mesh>
      <mesh position={[0.25, 1.15, 0.2]} castShadow material={mat(C.treeDark)}>
        <sphereGeometry args={[0.35, 12, 10]} />
      </mesh>
    </group>
  );
}
```

`src/render/SelectionRing.tsx`:
```tsx
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { C, mat } from './palette';

export function SelectionRing({ radius }: { radius: number }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.05;
    ref.current.scale.set(s, s, s);
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, 0.04, 0]} material={mat(C.blue, { emissive: C.blue, opacity: 0.85 })}>
      <ringGeometry args={[radius * 0.84, radius, 40]} />
    </mesh>
  );
}
```

`src/render/CameraRig.tsx`:
```tsx
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { LOT_H, LOT_W } from '../sim/balance';
import { useGame } from '../game/store';
import { inputState, installInputTracking, isTyping } from '../input/inputState';

const DIST = 60;
const HEIGHT = 55;
const ELEV_K = Math.hypot(DIST, HEIGHT) / HEIGHT;
const HOME = { x: LOT_W / 2, z: LOT_H / 2 + 2, yaw: Math.PI / 4, zoom: 20 };
const KEY_PAN_PX_PER_S = 700;
const EDGE = 14;

type RigState = { tx: number; tz: number; yaw: number; yawGoal: number; zoom: number; zoomGoal: number };

function panBy(s: RigState, rightPx: number, upPx: number): void {
  const k = 1 / s.zoom;
  const rx = Math.cos(s.yaw);
  const rz = -Math.sin(s.yaw);
  const fx = -Math.sin(s.yaw);
  const fz = -Math.cos(s.yaw);
  s.tx = THREE.MathUtils.clamp(s.tx + (rx * rightPx + fx * upPx * ELEV_K) * k, -8, LOT_W + 8);
  s.tz = THREE.MathUtils.clamp(s.tz + (rz * rightPx + fz * upPx * ELEV_K) * k, -8, LOT_H + 10);
}

export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const gl = useThree((s) => s.gl);
  const st = useRef<RigState>({ tx: HOME.x, tz: HOME.z, yaw: HOME.yaw, yawGoal: HOME.yaw, zoom: HOME.zoom, zoomGoal: HOME.zoom });
  const keys = useRef(new Set<string>());
  const nonce = useGame((s) => s.cameraNonce);

  useEffect(() => {
    Object.assign(st.current, { tx: HOME.x, tz: HOME.z, yawGoal: HOME.yaw, zoomGoal: HOME.zoom });
  }, [nonce]);

  useEffect(() => {
    installInputTracking();
    const el = gl.domElement;
    let panning = false;
    let lx = 0;
    let ly = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const k = e.key.toLowerCase();
      keys.current.add(k);
      if (k === 'q') st.current.yawGoal += Math.PI / 2;
      if (k === 'e') st.current.yawGoal -= Math.PI / 2;
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const onBlur = () => keys.current.clear();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = st.current;
      s.zoomGoal = THREE.MathUtils.clamp(s.zoomGoal * (e.deltaY > 0 ? 0.88 : 1.12), 8, 70);
    };
    const onDown = (e: PointerEvent) => {
      const sel = useGame.getState().selection;
      const rightCommands = sel?.kind === 'forklifts' || sel?.kind === 'truck';
      if (e.button === 1 || (e.button === 2 && !rightCommands)) {
        panning = true;
        lx = e.clientX;
        ly = e.clientY;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!panning) return;
      panBy(st.current, -(e.clientX - lx), e.clientY - ly);
      lx = e.clientX;
      ly = e.clientY;
    };
    const onUp = () => {
      panning = false;
    };
    const onEnter = () => {
      inputState.inside = true;
    };
    const onLeave = () => {
      inputState.inside = false;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [gl]);

  useFrame((_, dt) => {
    const s = st.current;
    const k = keys.current;
    const step = KEY_PAN_PX_PER_S * dt;
    let r = 0;
    let u = 0;
    if (k.has('a') || k.has('arrowleft')) r -= step;
    if (k.has('d') || k.has('arrowright')) r += step;
    if (k.has('w') || k.has('arrowup')) u += step;
    if (k.has('s') || k.has('arrowdown')) u -= step;
    if (inputState.inside && document.hasFocus()) {
      const rect = gl.domElement.getBoundingClientRect();
      const mx = inputState.mouseX - rect.left;
      const my = inputState.mouseY - rect.top;
      if (mx < EDGE) r -= step;
      else if (mx > rect.width - EDGE) r += step;
      if (my < EDGE) u += step;
      else if (my > rect.height - EDGE) u -= step;
    }
    if (r || u) panBy(s, r, u);
    const t = 1 - Math.exp(-dt * 10);
    s.yaw += (s.yawGoal - s.yaw) * t;
    s.zoom += (s.zoomGoal - s.zoom) * t;
    camera.position.set(s.tx + Math.sin(s.yaw) * DIST, HEIGHT, s.tz + Math.cos(s.yaw) * DIST);
    camera.lookAt(s.tx, 0, s.tz);
    if (Math.abs(camera.zoom - s.zoom) > 1e-3) {
      camera.zoom = s.zoom;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}
```

`src/render/SimDriver.tsx`:
```tsx
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { advance } from '../game/loop';
import { useGame } from '../game/store';

const PUBLISH_EVERY_S = 0.2;

export function SimDriver() {
  const since = useRef(0);
  useFrame((_, dt) => {
    const s = useGame.getState();
    if (!s.world) return;
    advance(s.world, dt, s.speed);
    since.current += dt;
    if (since.current >= PUBLISH_EVERY_S) {
      since.current = 0;
      s.publish();
    }
  });
  return null;
}
```

`src/render/Ground.tsx`:
```tsx
import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { LOT_H, LOT_W, ROAD_ROWS } from '../sim/balance';
import { createRng, next } from '../sim/rng';
import { TreeModel } from './models';
import { C, mat } from './palette';

export function Ground() {
  const trees = useMemo(() => {
    const r = createRng(99);
    const out: { x: number; z: number; s: number }[] = [];
    while (out.length < 48) {
      const x = -16 + next(r) * (LOT_W + 32);
      const z = -16 + next(r) * (LOT_H + 30);
      const inLot = x > -2 && x < LOT_W + 1 && z > -2 && z < LOT_H + ROAD_ROWS + 1.5;
      if (!inLot) out.push({ x, z, s: 0.8 + next(r) * 0.6 });
    }
    return out;
  }, []);
  const dashes = useMemo(() => Array.from({ length: 70 }, (_, i) => -100 + i * 3.5), []);
  const roadZ = LOT_H + ROAD_ROWS / 2 - 0.5;
  const border: [number, number, number][] = [
    [-0.5, 0.02, -0.5],
    [LOT_W - 0.5, 0.02, -0.5],
    [LOT_W - 0.5, 0.02, LOT_H - 0.5],
    [-0.5, 0.02, LOT_H - 0.5],
    [-0.5, 0.02, -0.5],
  ];
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[LOT_W / 2, -0.03, LOT_H / 2]} receiveShadow material={mat(C.ground)}>
        <planeGeometry args={[260, 260]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[LOT_W / 2 - 0.5, -0.015, LOT_H / 2 - 0.5]} receiveShadow material={mat(C.lot)}>
        <planeGeometry args={[LOT_W, LOT_H]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[LOT_W / 2, -0.01, roadZ]} receiveShadow material={mat(C.road)}>
        <planeGeometry args={[260, ROAD_ROWS]} />
      </mesh>
      {dashes.map((x) => (
        <mesh key={x} rotation-x={-Math.PI / 2} position={[x, 0, roadZ]} material={mat(C.roadLine)}>
          <planeGeometry args={[1.6, 0.12]} />
        </mesh>
      ))}
      <Line points={border} color={C.bay} lineWidth={2} />
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]}>
          <TreeModel s={t.s} />
        </group>
      ))}
    </group>
  );
}
```

`src/render/Scene.tsx`:
```tsx
import { Canvas } from '@react-three/fiber';
import { useEffect, useRef, type ReactNode } from 'react';
import type * as THREE from 'three';
import { LOT_H, LOT_W } from '../sim/balance';
import { CameraRig } from './CameraRig';
import { Ground } from './Ground';
import { C } from './palette';
import { SimDriver } from './SimDriver';

function Lights() {
  const light = useRef<THREE.DirectionalLight>(null!);
  useEffect(() => {
    light.current.target.position.set(LOT_W / 2, 0, LOT_H / 2);
    light.current.target.updateMatrixWorld();
  }, []);
  return (
    <>
      <hemisphereLight args={['#ffffff', '#b7c4d6', 0.9]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        ref={light}
        castShadow
        position={[LOT_W / 2 + 25, 45, LOT_H / 2 + 18]}
        intensity={1.7}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-bias={-0.0004}
      />
    </>
  );
}

export function Scene({ children }: { children?: ReactNode }) {
  return (
    <Canvas
      shadows
      orthographic
      camera={{ zoom: 20, position: [60, 55, 60], near: 0.1, far: 600 }}
      dpr={[1, 2]}
      onContextMenu={(e) => e.preventDefault()}
    >
      <color attach="background" args={[C.sky]} />
      <Lights />
      <CameraRig />
      <SimDriver />
      <Ground />
      {children}
    </Canvas>
  );
}
```

`src/App.tsx` (temporary until Task 16):
```tsx
import { useEffect } from 'react';
import { useGame } from './game/store';
import { Scene } from './render/Scene';

export default function App() {
  const world = useGame((s) => s.world);
  useEffect(() => {
    if (!useGame.getState().world) useGame.getState().startGame('scenario', 42);
  }, []);
  const clock = useGame((s) => s.hud?.clock);
  return (
    <div className="relative h-full w-full">
      {world && <Scene />}
      <div className="pointer-events-none absolute left-4 top-4 rounded-xl bg-white/85 px-4 py-2 font-bold shadow">{clock}</div>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run` → Expected: PASS.
Run: `npm run build` → Expected: exits 0.
Run `npm run dev`, open http://localhost:5173. Expected: a pale lot with a yellow outline, a road with white dashes along its south edge, trees around it, soft shadows, and the clock label advancing about 10 in-game minutes per second. WASD and edge-scrolling pan the view, the mouse wheel zooms, and Q/E rotate in 90° steps. The browser console shows no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(render): iso camera rig, ground, lights, palette and procedural models"
```

---

### Task 13: Render the world — building, doors, racks, pallets, forklifts, trucks

**Files:**
- Create: `src/render/Building.tsx`, `src/render/DockDoor.tsx`, `src/render/Rack.tsx`, `src/render/PalletInstances.tsx`, `src/render/Forklift.tsx`, `src/render/Truck.tsx`, `src/render/Entities.tsx`, `src/input/selection.ts`
- Modify: `src/App.tsx` (render `<Scene><Entities /></Scene>`)

**Interfaces:**
- Consumes: `useGame`, `loop`, sim grid flags, `handlingTarget` from `sim/forklifts`, models/palette/anim
- Produces:
  - `selection.ts`: `type EntityRef = { kind: 'forklift' | 'truck' | 'door' | 'rack' | 'pallet'; id: string }`, `selectEntity(ref, additive)`, `commandEntity(ref)`, `entityHandlers(ref | (e) => ref | null)` (returns `onPointerDown`/`onPointerUp` props; does nothing while a build tool is active, so clicks fall through to the ground)
  - `forkHeight(w, f)` exported from `Forklift.tsx`
  - `Entities` component

- [ ] **Step 1: Implement selection helpers**

`src/input/selection.ts`:
```ts
import type { ThreeEvent } from '@react-three/fiber';
import { useGame } from '../game/store';
import { inputState } from './inputState';

export type EntityRef = { kind: 'forklift' | 'truck' | 'door' | 'rack' | 'pallet'; id: string };
type RefSource = EntityRef | ((e: ThreeEvent<PointerEvent>) => EntityRef | null);

function isLive(ref: EntityRef): boolean {
  const w = useGame.getState().world;
  if (!w) return false;
  if (ref.kind === 'truck') return !!w.trucks[ref.id] && w.trucks[ref.id].state !== 'scheduled';
  if (ref.kind === 'forklift') return !!w.forklifts[ref.id];
  return true;
}

export function selectEntity(ref: EntityRef, additive: boolean): void {
  const { selection, select } = useGame.getState();
  if (ref.kind === 'forklift') {
    if (additive && selection?.kind === 'forklifts') {
      const ids = selection.ids.includes(ref.id) ? selection.ids.filter((i) => i !== ref.id) : [...selection.ids, ref.id];
      select(ids.length ? { kind: 'forklifts', ids } : null);
    } else select({ kind: 'forklifts', ids: [ref.id] });
  } else select({ kind: ref.kind, id: ref.id });
}

export function commandEntity(ref: EntityRef): void {
  const { selection, dispatch } = useGame.getState();
  if (selection?.kind === 'forklifts') {
    if (ref.kind === 'truck') dispatch({ type: 'orderForklifts', forkliftIds: selection.ids, target: { kind: 'truck', truckId: ref.id } });
    else if (ref.kind === 'pallet') dispatch({ type: 'orderForklifts', forkliftIds: selection.ids, target: { kind: 'pallet', palletId: ref.id } });
  } else if (selection?.kind === 'truck' && ref.kind === 'door') {
    dispatch({ type: 'reassignTruck', truckId: selection.id, doorId: ref.id });
  }
}

export function entityHandlers(src: RefSource) {
  const resolve = (e: ThreeEvent<PointerEvent>) => (typeof src === 'function' ? src(e) : src);
  return {
    onPointerDown(e: ThreeEvent<PointerEvent>) {
      const r = resolve(e);
      if (!r || useGame.getState().tool || !isLive(r)) return;
      e.stopPropagation();
      inputState.entityHit = true;
      if (e.button === 0) selectEntity(r, e.nativeEvent.shiftKey);
    },
    onPointerUp(e: ThreeEvent<PointerEvent>) {
      const r = resolve(e);
      if (!r || useGame.getState().tool || !isLive(r)) return;
      e.stopPropagation();
      if (e.button === 2 && inputState.dragDist < 6) commandEntity(r);
    },
  };
}
```

- [ ] **Step 2: Implement the building**

`src/render/Building.tsx`:
```tsx
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { loop } from '../game/loop';
import { useGame } from '../game/store';
import { BUILD_MINUTES, LOT_H, LOT_W } from '../sim/balance';
import { F_DOOR, F_WALL, flagsAt } from '../sim/grid';
import type { BuildingPart, Rect, Vec2 } from '../sim/world';
import { Block } from './models';
import { C, mat } from './palette';

const MAX_WALLS = 500;

function WallInstances({ cells, height }: { cells: Vec2[]; height: number }) {
  const body = useRef<THREE.InstancedMesh>(null!);
  const base = useRef<THREE.InstancedMesh>(null!);
  const cap = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    cells.forEach((c, i) => {
      m.makeScale(1, height, 1).setPosition(c.x, height / 2, c.y);
      body.current.setMatrixAt(i, m);
      m.makeScale(1.02, 1, 1.02).setPosition(c.x, 0.2, c.y);
      base.current.setMatrixAt(i, m);
      m.makeScale(1.04, 1, 1.04).setPosition(c.x, height + 0.05, c.y);
      cap.current.setMatrixAt(i, m);
    });
    for (const r of [body, base, cap]) {
      r.current.count = cells.length;
      r.current.instanceMatrix.needsUpdate = true;
    }
  }, [cells, height]);
  return (
    <>
      <instancedMesh ref={body} args={[undefined, undefined, MAX_WALLS]} castShadow receiveShadow frustumCulled={false} material={mat(C.wall)}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={base} args={[undefined, undefined, MAX_WALLS]} frustumCulled={false} material={mat(C.blue)}>
        <boxGeometry args={[1, 0.4, 1]} />
      </instancedMesh>
      <instancedMesh ref={cap} args={[undefined, undefined, MAX_WALLS]} frustumCulled={false} material={mat(C.blue)}>
        <boxGeometry args={[1, 0.1, 1]} />
      </instancedMesh>
    </>
  );
}

function ReadyPart({ rect, roof }: { rect: Rect; roof: boolean }) {
  const cx = rect.x + rect.w / 2 - 0.5;
  const cz = rect.y + rect.h / 2 - 0.5;
  const ribs = Math.floor(rect.w / 2);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[cx, 0.01, cz]} receiveShadow material={mat(C.floor)}>
        <planeGeometry args={[rect.w, rect.h]} />
      </mesh>
      {roof && (
        <group position={[cx, 3.1, cz]}>
          <Block p={[0, 0, 0]} s={[rect.w + 0.1, 0.15, rect.h + 0.1]} c={C.blue} />
          {Array.from({ length: ribs }, (_, i) => (
            <Block key={i} p={[-rect.w / 2 + 1 + i * 2, 0.12, 0]} s={[0.12, 0.1, rect.h]} c={C.blueDark} cast={false} />
          ))}
          <Text rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]} fontSize={Math.max(0.8, Math.min(rect.w, rect.h) * 0.16)} color="white">
            WareTrack
          </Text>
        </group>
      )}
    </group>
  );
}

function Scaffold({ part }: { part: BuildingPart }) {
  const fill = useRef<THREE.Mesh>(null!);
  const { rect } = part;
  const cx = rect.x + rect.w / 2 - 0.5;
  const cz = rect.y + rect.h / 2 - 0.5;
  useFrame(() => {
    const w = useGame.getState().world;
    if (!w) return;
    const k = Math.min(1, Math.max(0.02, (w.minute + loop.alpha - (part.readyAt - BUILD_MINUTES)) / BUILD_MINUTES));
    fill.current.scale.y = k;
    fill.current.position.y = 1.5 * k;
  });
  const corners: [number, number][] = [
    [rect.x - 0.5, rect.y - 0.5],
    [rect.x + rect.w - 0.5, rect.y - 0.5],
    [rect.x - 0.5, rect.y + rect.h - 0.5],
    [rect.x + rect.w - 0.5, rect.y + rect.h - 0.5],
  ];
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[cx, 0.02, cz]} material={mat(C.bay, { opacity: 0.35 })}>
        <planeGeometry args={[rect.w, rect.h]} />
      </mesh>
      <mesh ref={fill} position={[cx, 0, cz]} material={mat(C.wall, { opacity: 0.6 })}>
        <boxGeometry args={[rect.w, 3, rect.h]} />
      </mesh>
      {corners.map(([x, z]) => (
        <Block key={`${x},${z}`} p={[x, 1.7, z]} s={[0.12, 3.4, 0.12]} c={C.yellow} />
      ))}
    </group>
  );
}

export function Building() {
  const gridVersion = useGame((s) => s.hud?.gridVersion ?? 0);
  const low = useGame((s) => s.roofCut || s.tool !== null);
  const world = useGame((s) => s.world);
  const { walls, parts, minute } = useMemo(() => {
    const walls: Vec2[] = [];
    if (!world) return { walls, parts: [] as BuildingPart[], minute: 0 };
    for (let y = 0; y < LOT_H; y++) {
      for (let x = 0; x < LOT_W; x++) {
        const f = flagsAt(world, x, y);
        if (f & F_WALL && !(f & F_DOOR)) walls.push({ x, y });
      }
    }
    return { walls, parts: world.parts.map((p) => ({ rect: { ...p.rect }, readyAt: p.readyAt })), minute: world.minute };
    // gridVersion changes whenever structures or readiness change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, gridVersion]);
  return (
    <group>
      <WallInstances cells={walls} height={low ? 0.9 : 3} />
      {parts.map((p, i) => (p.readyAt <= minute ? <ReadyPart key={i} rect={p.rect} roof={!low} /> : <Scaffold key={i} part={p} />))}
    </group>
  );
}
```

- [ ] **Step 3: Implement doors and racks**

`src/render/DockDoor.tsx`:
```tsx
import { Billboard, Line, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { useGame } from '../game/store';
import { entityHandlers } from '../input/selection';
import { dirAngle } from '../sim/world';
import { Block } from './models';
import { C, mat } from './palette';
import { SelectionRing } from './SelectionRing';

export function DockDoor({ id }: { id: string }) {
  const meta = useGame((s) => {
    const d = s.hud?.docks.find((x) => x.id === id);
    return d ? `${d.label}|${d.kind}` : '';
  });
  const low = useGame((s) => s.roofCut || s.tool !== null);
  const selected = useGame((s) => s.selection?.kind === 'door' && s.selection.id === id);
  const shutter = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const w = useGame.getState().world;
    const d = w?.doors[id];
    if (!w || !d || !shutter.current) return;
    const t = d.truckId ? w.trucks[d.truckId] : undefined;
    const open = t?.state === 'docked' || t?.state === 'docking';
    const target = open ? 2.25 : 1.1;
    shutter.current.position.y += (target - shutter.current.position.y) * 0.12;
  });
  const door = useGame.getState().world?.doors[id];
  if (!door || !meta) return null;
  const [label, kind] = meta.split('|');
  const h = low ? 0.9 : 3;
  const apron: [number, number, number][] = [
    [1, 0.02, -0.7],
    [8.5, 0.02, -0.7],
    [8.5, 0.02, 0.7],
    [1, 0.02, 0.7],
    [1, 0.02, -0.7],
  ];
  return (
    <group position={[door.cell.x, 0, door.cell.y]} rotation-y={-dirAngle(door.facing)} {...entityHandlers({ kind: 'door', id })}>
      <mesh position={[0.5, 1, 0]} material={mat('#ffffff', { opacity: 0.001 })}>
        <boxGeometry args={[1.2, 2.2, 1.1]} />
      </mesh>
      <Block p={[0.45, h / 2, 0.46]} s={[0.12, h, 0.12]} c={C.blue} />
      <Block p={[0.45, h / 2, -0.46]} s={[0.12, h, 0.12]} c={C.blue} />
      {!low && (
        <>
          <Block p={[0.45, 2.45, 0]} s={[0.14, 0.2, 1.04]} c={C.blue} />
          <Block p={[0, 2.8, 0]} s={[1, 0.5, 1]} c={C.wall} />
          <mesh ref={shutter} position={[0.4, 1.1, 0]} castShadow material={mat(C.shutter)}>
            <boxGeometry args={[0.05, 2.2, 0.8]} />
          </mesh>
          <Block p={[0.62, 0.35, 0]} s={[0.25, 0.15, 0.9]} c={C.navy} />
        </>
      )}
      <Line points={apron} color={C.bay} lineWidth={2} />
      <Billboard position={[1.4, h + 0.7, 0]}>
        <Text fontSize={0.5} color={kind === 'in' ? C.blue : C.outDoor} outlineWidth={0.05} outlineColor="#ffffff">
          {label}
        </Text>
      </Billboard>
      {selected && <SelectionRing radius={0.9} />}
    </group>
  );
}
```

`src/render/Rack.tsx`:
```tsx
import { useGame } from '../game/store';
import { entityHandlers } from '../input/selection';
import { RackModel } from './models';
import { SelectionRing } from './SelectionRing';

export function Rack({ id }: { id: string }) {
  const selected = useGame((s) => s.selection?.kind === 'rack' && s.selection.id === id);
  const r = useGame.getState().world?.racks[id];
  if (!r) return null;
  const [a, b] = r.cells;
  const vertical = a.x === b.x;
  return (
    <group position={[(a.x + b.x) / 2, 0, (a.y + b.y) / 2]} rotation-y={vertical ? Math.PI / 2 : 0} {...entityHandlers({ kind: 'rack', id })}>
      <RackModel />
      {selected && <SelectionRing radius={1.4} />}
    </group>
  );
}
```

- [ ] **Step 4: Implement forklifts, trucks and pallets**

`src/render/Forklift.tsx`:
```tsx
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { loop } from '../game/loop';
import { useGame } from '../game/store';
import { entityHandlers } from '../input/selection';
import { handlingTarget } from '../sim/forklifts';
import type { Forklift as ForkliftT, World } from '../sim/world';
import { interp, lerpAngle, renderState } from './anim';
import { ForkliftModel } from './models';
import { C } from './palette';
import { SelectionRing } from './SelectionRing';

export function forkHeight(w: World, f: ForkliftT): number {
  const target = handlingTarget(w, f);
  const high = target?.kind === 'rack' && target.slot >= 2;
  if (f.state === 'lifting' || f.state === 'dropping') return high ? 1.17 : 0.06;
  if (f.carrying) return 0.3;
  return 0.06;
}

export function Forklift({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null!);
  const forks = useRef<THREE.Group>(null!);
  const warn = useRef<THREE.Group>(null!);
  const selected = useGame((s) => s.selection?.kind === 'forklifts' && s.selection.ids.includes(id));
  useFrame((_, dt) => {
    const w = useGame.getState().world;
    const f = w?.forklifts[id];
    if (!w || !f) return;
    const rs = renderState(id);
    const p = interp(f.prev, f.pos, loop.alpha);
    rs.heading = lerpAngle(rs.heading, f.heading, 1 - Math.exp(-dt * 14));
    rs.forkY += (forkHeight(w, f) - rs.forkY) * (1 - Math.exp(-dt * 10));
    group.current.position.set(p.x, 0, p.y);
    group.current.rotation.y = -rs.heading;
    forks.current.position.y = rs.forkY;
    warn.current.visible = f.state === 'broken' || f.blockedUntil > w.minute;
  });
  return (
    <group ref={group} {...entityHandlers({ kind: 'forklift', id })}>
      <ForkliftModel forksRef={forks} />
      {selected && <SelectionRing radius={1} />}
      <group ref={warn} position={[0, 2.4, 0]} visible={false}>
        <Billboard>
          <Text fontSize={0.9} color={C.bad} outlineWidth={0.06} outlineColor="#ffffff">
            !
          </Text>
        </Billboard>
      </group>
    </group>
  );
}
```

`src/render/Truck.tsx`:
```tsx
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { loop } from '../game/loop';
import { useGame } from '../game/store';
import { entityHandlers } from '../input/selection';
import { interp, lerpAngle } from './anim';
import { TruckModel } from './models';
import { SelectionRing } from './SelectionRing';

export function Truck({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null!);
  const heading = useRef<number | null>(null);
  const selected = useGame((s) => s.selection?.kind === 'truck' && s.selection.id === id);
  const client = useGame.getState().world?.trucks[id]?.client;
  useFrame((_, dt) => {
    const t = useGame.getState().world?.trucks[id];
    if (!t || !group.current) return;
    const p = interp(t.prev, t.pos, loop.alpha);
    heading.current = heading.current === null ? t.heading : lerpAngle(heading.current, t.heading, 1 - Math.exp(-dt * 8));
    group.current.position.set(p.x, 0, p.y);
    group.current.rotation.y = -heading.current;
    group.current.visible = t.state !== 'scheduled';
  });
  if (!client) return null;
  return (
    <group ref={group} visible={false} {...entityHandlers({ kind: 'truck', id })}>
      <TruckModel client={client} />
      {selected && (
        <group position={[2.3, 0, 0]}>
          <SelectionRing radius={2.7} />
        </group>
      )}
    </group>
  );
}
```

`src/render/PalletInstances.tsx`:
```tsx
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { loop } from '../game/loop';
import { useGame } from '../game/store';
import { entityHandlers } from '../input/selection';
import { PRODUCTS } from '../sim/products';
import type { Pallet, World } from '../sim/world';
import { interp, popScale, renderState } from './anim';
import { C, mat } from './palette';

const MAX = 1500;

function palletPose(w: World, p: Pallet): { x: number; y: number; z: number; rot: number } | null {
  const l = p.loc;
  switch (l.kind) {
    case 'rack': {
      const r = w.racks[l.rackId];
      if (!r) return null;
      const c = r.cells[l.slot % 2];
      return { x: c.x, y: l.slot < 2 ? 0.02 : 1.17, z: c.y, rot: 0 };
    }
    case 'staging':
    case 'floor':
      return { x: l.cell.x, y: 0.02, z: l.cell.y, rot: 0 };
    case 'forklift': {
      const f = w.forklifts[l.forkliftId];
      if (!f) return null;
      const rs = renderState(f.id);
      const pos = interp(f.prev, f.pos, loop.alpha);
      return { x: pos.x + Math.cos(rs.heading) * 0.85, y: rs.forkY + 0.04, z: pos.y + Math.sin(rs.heading) * 0.85, rot: -rs.heading };
    }
    case 'truck':
      return null;
  }
}

export function PalletInstances() {
  const base = useRef<THREE.InstancedMesh>(null!);
  const load = useRef<THREE.InstancedMesh>(null!);
  const ids = useRef<string[]>([]);
  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3(), e: new THREE.Euler(), c: new THREE.Color() }),
    [],
  );
  useLayoutEffect(() => {
    const white = new THREE.Color('#ffffff');
    for (let i = 0; i < MAX; i++) load.current.setColorAt(i, white);
    base.current.count = 0;
    load.current.count = 0;
  }, []);
  useFrame(() => {
    const w = useGame.getState().world;
    if (!w) return;
    let i = 0;
    for (const p of Object.values(w.pallets)) {
      if (i >= MAX) break;
      const pose = palletPose(w, p);
      if (!pose) continue;
      const pop = popScale(w.minute + loop.alpha - p.placedAt);
      tmp.e.set(0, pose.rot, 0);
      tmp.q.setFromEuler(tmp.e);
      tmp.p.set(pose.x, pose.y + 0.06, pose.z);
      tmp.s.set(pop, 1, pop);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      base.current.setMatrixAt(i, tmp.m);
      tmp.p.set(pose.x, pose.y + 0.12 + 0.36 * pop, pose.z);
      tmp.s.set(pop, pop, pop);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      load.current.setMatrixAt(i, tmp.m);
      load.current.setColorAt(i, tmp.c.set(PRODUCTS[p.product].color));
      ids.current[i] = p.id;
      i++;
    }
    base.current.count = i;
    load.current.count = i;
    base.current.instanceMatrix.needsUpdate = true;
    load.current.instanceMatrix.needsUpdate = true;
    if (load.current.instanceColor) load.current.instanceColor.needsUpdate = true;
  });
  const handlers = entityHandlers((e: ThreeEvent<PointerEvent>) => {
    const id = e.instanceId !== undefined ? ids.current[e.instanceId] : undefined;
    return id ? { kind: 'pallet', id } : null;
  });
  return (
    <>
      <instancedMesh ref={base} args={[undefined, undefined, MAX]} castShadow receiveShadow frustumCulled={false} material={mat(C.wood)} {...handlers}>
        <boxGeometry args={[0.9, 0.12, 0.9]} />
      </instancedMesh>
      <instancedMesh ref={load} args={[undefined, undefined, MAX]} castShadow frustumCulled={false} {...handlers}>
        <boxGeometry args={[0.82, 0.72, 0.82]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
    </>
  );
}
```

`src/render/Entities.tsx`:
```tsx
import { useGame } from '../game/store';
import { Building } from './Building';
import { DockDoor } from './DockDoor';
import { Forklift } from './Forklift';
import { PalletInstances } from './PalletInstances';
import { Rack } from './Rack';
import { Truck } from './Truck';

const split = (s?: string) => (s ? s.split(',').filter(Boolean) : []);

export function Entities() {
  const forkliftIds = useGame((s) => s.hud?.forkliftIds);
  const truckIds = useGame((s) => s.hud?.truckIds);
  const doorIds = useGame((s) => s.hud?.doorIds);
  const rackIds = useGame((s) => s.hud?.rackIds);
  return (
    <>
      <Building />
      {split(doorIds).map((id) => (
        <DockDoor key={id} id={id} />
      ))}
      {split(rackIds).map((id) => (
        <Rack key={id} id={id} />
      ))}
      <PalletInstances />
      {split(forkliftIds).map((id) => (
        <Forklift key={id} id={id} />
      ))}
      {split(truckIds).map((id) => (
        <Truck key={id} id={id} />
      ))}
    </>
  );
}
```

In `src/App.tsx` change `{world && <Scene />}` to:
```tsx
      {world && (
        <Scene>
          <Entities />
        </Scene>
      )}
```
and add `import { Entities } from './render/Entities';`. For a quick visual check, temporarily paste this into `startGame`'s caller in `App.tsx`'s `useEffect`, right after `startGame` (remove it again before committing):
```ts
const s = useGame.getState();
s.dispatch({ type: 'buildFootprint', rect: { x: 12, y: 6, w: 14, h: 10 } });
```

- [ ] **Step 5: Verify**

Run: `npx vitest run && npm run build` → Expected: PASS and exit 0.
Run `npm run dev` with the temporary snippet. Expected: a scaffold rises over about 12 seconds and becomes a white-walled warehouse with blue trim and a ribbed blue roof labelled "WareTrack". The yellow starter forklift appears inside once construction completes. No console errors. Remove the snippet.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(render): building, docks, racks, instanced pallets, forklifts and trucks"
```

---

### Task 14: Input — build tools, ghost preview, box select, right-click orders, hotkeys

**Files:**
- Create: `src/input/buildMode.ts`, `src/input/buildMode.test.ts`, `src/input/hotkeys.ts`, `src/render/GroundInteraction.tsx`, `src/render/BuildGhost.tsx`
- Modify: `src/game/store.ts` (add `buildDragStart` + `setBuildDragStart`), `src/App.tsx` (mount `GroundInteraction`, `BuildGhost`, `useHotkeys`)

**Interfaces:**
- Consumes: grid validators, `COST`, `useGame`, `inputState`, `selection.ts`
- Produces:
  - `buildMode.ts`: `rectFrom(a, b): Rect`, `type Ghost = { cells: Vec2[]; ok: boolean; cost: number; label: string }`, `previewTool(w, tool, hover, dragStart): Ghost`, `toolCommand(tool, cell): Command | null`
  - `useHotkeys()`
  - store: `buildDragStart: Vec2 | null`, `setBuildDragStart(c)`

- [ ] **Step 1: Write the failing test**

`src/input/buildMode.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createWorld } from '../sim/world';
import { readyWorld } from '../sim/testUtils';
import { previewTool, rectFrom, toolCommand } from './buildMode';

describe('buildMode', () => {
  it('normalises drag rectangles in any direction', () => {
    expect(rectFrom({ x: 5, y: 9 }, { x: 2, y: 3 })).toEqual({ x: 2, y: 3, w: 4, h: 7 });
  });
  it('previews a footprint drag with size and cost', () => {
    const w = createWorld(1, 'scenario');
    const g = previewTool(w, { kind: 'footprint' }, { x: 21, y: 13 }, { x: 10, y: 6 });
    expect(g.ok).toBe(true);
    expect(g.cells).toHaveLength(12 * 8);
    expect(g.label).toBe('12×8 · $24,000');
    const bad = previewTool(w, { kind: 'footprint' }, { x: 12, y: 8 }, { x: 10, y: 6 });
    expect(bad).toMatchObject({ ok: false, label: 'Minimum size is 8×6' });
  });
  it('previews racks (two cells) and doors with the validator verdict', () => {
    const w = readyWorld();
    const rack = previewTool(w, { kind: 'rack', orient: 'v' }, { x: 12, y: 9 }, null);
    expect(rack.cells).toEqual([{ x: 12, y: 9 }, { x: 12, y: 10 }]);
    expect(rack).toMatchObject({ ok: true, label: '$1,500' });
    expect(previewTool(w, { kind: 'door', doorKind: 'in' }, { x: 10, y: 6 }, null)).toMatchObject({ ok: false, label: 'Doors can’t go on corners' });
  });
  it('maps tools to commands', () => {
    expect(toolCommand({ kind: 'door', doorKind: 'out' }, { x: 1, y: 2 })).toEqual({ type: 'placeDoor', cell: { x: 1, y: 2 }, kind: 'out' });
    expect(toolCommand({ kind: 'demolish' }, { x: 1, y: 2 })).toEqual({ type: 'demolish', cell: { x: 1, y: 2 } });
    expect(toolCommand({ kind: 'footprint' }, { x: 1, y: 2 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/input/buildMode.test.ts`
Expected: FAIL — cannot resolve `./buildMode`.

- [ ] **Step 3: Implement**

`src/input/buildMode.ts`:
```ts
import type { BuildTool } from '../game/store';
import { COST } from '../sim/balance';
import type { Command } from '../sim/commands';
import { forEachCell, rackCells, validateDemolish, validateDoor, validateFootprint, validateRack, validateStaging } from '../sim/grid';
import { fmtMoney, type Rect, type Vec2, type World } from '../sim/world';

export type Ghost = { cells: Vec2[]; ok: boolean; cost: number; label: string };
type Tool = NonNullable<BuildTool>;

export function rectFrom(a: Vec2, b: Vec2): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
}

const verdict = (cells: Vec2[], r: { ok: true; cost: number } | { ok: false; reason: string }): Ghost =>
  r.ok ? { cells, ok: true, cost: r.cost, label: fmtMoney(r.cost) } : { cells, ok: false, cost: 0, label: r.reason };

export function previewTool(w: World, tool: Tool, hover: Vec2, dragStart: Vec2 | null): Ghost {
  switch (tool.kind) {
    case 'footprint': {
      if (!dragStart) return { cells: [hover], ok: true, cost: 0, label: 'Drag to draw a warehouse' };
      const r = rectFrom(dragStart, hover);
      const cells: Vec2[] = [];
      forEachCell(r, (x, y) => cells.push({ x, y }));
      const c = validateFootprint(w, r);
      return c.ok ? { cells, ok: true, cost: c.cost, label: `${r.w}×${r.h} · ${fmtMoney(c.cost)}` } : { cells, ok: false, cost: 0, label: c.reason };
    }
    case 'door':
      return verdict([hover], validateDoor(w, hover));
    case 'rack':
      return verdict(rackCells(hover, tool.orient), validateRack(w, hover, tool.orient));
    case 'staging':
      return verdict([hover], validateStaging(w, hover));
    case 'demolish': {
      const c = validateDemolish(w, hover);
      return c.ok ? { cells: [hover], ok: true, cost: -c.refund, label: `Refund ${fmtMoney(c.refund)}` } : { cells: [hover], ok: false, cost: 0, label: c.reason };
    }
  }
}

export function toolCommand(tool: Tool, cell: Vec2): Command | null {
  switch (tool.kind) {
    case 'door':
      return { type: 'placeDoor', cell, kind: tool.doorKind };
    case 'rack':
      return { type: 'placeRack', cell, orient: tool.orient };
    case 'staging':
      return { type: 'placeStaging', cell };
    case 'demolish':
      return { type: 'demolish', cell };
    case 'footprint':
      return null;
  }
}

export const TOOL_COST: Record<Tool['kind'], number> = { footprint: COST.cell, door: COST.door, rack: COST.rack, staging: COST.staging, demolish: 0 };
```

In `src/game/store.ts` add to `GameState`:
```ts
  buildDragStart: Vec2 | null;
  setBuildDragStart(c: Vec2 | null): void;
```
initial value `buildDragStart: null,` and the action:
```ts
  setBuildDragStart(buildDragStart) {
    set({ buildDragStart });
  },
```
Also make `setTool` clear it: in `setTool` add `buildDragStart: null` to the `set({...})` call.

`src/input/hotkeys.ts`:
```ts
import { useEffect } from 'react';
import { useGame } from '../game/store';
import { isTyping } from './inputState';

export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useGame.getState();
      if (s.screen !== 'game') return;
      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          s.togglePause();
          break;
        case '1':
          s.setSpeed(1);
          break;
        case '2':
          s.setSpeed(2);
          break;
        case '3':
          s.setSpeed(4);
          break;
        case 'b':
          s.toggleBuild();
          break;
        case 'c':
          s.toggleContracts();
          break;
        case 'r':
          s.toggleRoof();
          break;
        case 't':
          if (s.tool?.kind === 'rack') s.setTool({ kind: 'rack', orient: s.tool.orient === 'h' ? 'v' : 'h' });
          break;
        case 'h':
        case 'home':
          s.resetCamera();
          break;
        case 'escape':
          if (s.buildDragStart) s.setBuildDragStart(null);
          else if (s.tool) s.setTool(null);
          else if (s.contractsOpen) s.toggleContracts();
          else s.select(null);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
```

`src/render/GroundInteraction.tsx`:
```tsx
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGame } from '../game/store';
import { rectFrom, toolCommand } from '../input/buildMode';
import { inputState } from '../input/inputState';
import { LOT_H, LOT_W, ROAD_ROWS } from '../sim/balance';
import { cellKey, type Vec2 } from '../sim/world';

const toCell = (p: THREE.Vector3): Vec2 => ({ x: Math.floor(p.x + 0.5), y: Math.floor(p.z + 0.5) });

export function GroundInteraction() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const boxStart = useRef<{ x: number; y: number } | null>(null);
  const painting = useRef<string | null>(null);

  useEffect(() => {
    const v = new THREE.Vector3();
    const onMove = (e: PointerEvent) => {
      if (!boxStart.current) return;
      useGame.getState().setDragRect({ x0: boxStart.current.x, y0: boxStart.current.y, x1: e.clientX, y1: e.clientY });
    };
    const onUp = (e: PointerEvent) => {
      painting.current = null;
      const start = boxStart.current;
      boxStart.current = null;
      const s = useGame.getState();
      s.setDragRect(null);
      if (!start || e.button !== 0 || inputState.dragDist <= 6 || !s.world) return;
      const b = gl.domElement.getBoundingClientRect();
      const [x0, x1] = [Math.min(start.x, e.clientX), Math.max(start.x, e.clientX)];
      const [y0, y1] = [Math.min(start.y, e.clientY), Math.max(start.y, e.clientY)];
      const ids = Object.values(s.world.forklifts)
        .filter((f) => f.state !== 'parked')
        .filter((f) => {
          v.set(f.pos.x, 0.5, f.pos.y).project(camera);
          const sx = b.left + ((v.x + 1) / 2) * b.width;
          const sy = b.top + ((1 - v.y) / 2) * b.height;
          return sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1;
        })
        .map((f) => f.id);
      s.select(ids.length ? { kind: 'forklifts', ids } : null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [camera, gl]);

  const paint = (c: Vec2) => {
    const s = useGame.getState();
    const k = cellKey(c);
    if (painting.current === k || s.world?.staging[k]) return;
    painting.current = k;
    s.dispatch({ type: 'placeStaging', cell: c });
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const s = useGame.getState();
    const c = toCell(e.point);
    s.setHoverCell(c);
    if (s.tool?.kind === 'staging' && painting.current !== null && e.buttons === 1) paint(c);
  };
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (inputState.entityHit || e.button !== 0) return;
    const s = useGame.getState();
    const c = toCell(e.point);
    const t = s.tool;
    if (!t) {
      boxStart.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
      return;
    }
    if (t.kind === 'footprint') s.setBuildDragStart(c);
    else if (t.kind === 'staging') {
      painting.current = '';
      paint(c);
    } else {
      const cmd = toolCommand(t, c);
      if (cmd) s.dispatch(cmd);
    }
  };
  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (inputState.entityHit) return;
    const s = useGame.getState();
    const c = toCell(e.point);
    if (e.button === 0) {
      if (s.tool?.kind === 'footprint' && s.buildDragStart) {
        s.dispatch({ type: 'buildFootprint', rect: rectFrom(s.buildDragStart, c) });
        s.setBuildDragStart(null);
      } else if (!s.tool && inputState.dragDist <= 6) s.select(null);
    } else if (e.button === 2 && inputState.dragDist < 6) {
      const sel = s.selection;
      if (sel?.kind === 'forklifts') s.dispatch({ type: 'orderForklifts', forkliftIds: sel.ids, target: { kind: 'cell', cell: c } });
    }
  };

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[LOT_W / 2 - 0.5, 0.005, (LOT_H + ROAD_ROWS) / 2 - 0.5]}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={() => useGame.getState().setHoverCell(null)}
    >
      <planeGeometry args={[LOT_W, LOT_H + ROAD_ROWS]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
```

`src/render/BuildGhost.tsx`:
```tsx
import { Billboard, Text } from '@react-three/drei';
import { useGame } from '../game/store';
import { previewTool } from '../input/buildMode';
import { C, mat } from './palette';

export function BuildGhost() {
  const tool = useGame((s) => s.tool);
  const hover = useGame((s) => s.hoverCell);
  const dragStart = useGame((s) => s.buildDragStart);
  useGame((s) => s.hud?.gridVersion);
  useGame((s) => s.hud?.cash);
  const w = useGame.getState().world;
  if (!tool || !hover || !w) return null;
  const g = previewTool(w, tool, hover, dragStart);
  const color = g.ok ? C.ok : C.bad;
  const xs = g.cells.map((c) => c.x);
  const ys = g.cells.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return (
    <group>
      <mesh position={[(minX + maxX) / 2, 0.08, (minY + maxY) / 2]} material={mat(color, { opacity: 0.4 })}>
        <boxGeometry args={[maxX - minX + 0.96, 0.12, maxY - minY + 0.96]} />
      </mesh>
      <Billboard position={[hover.x, 1.8, hover.y]}>
        <Text fontSize={0.48} color={color} outlineWidth={0.05} outlineColor="#ffffff">
          {g.label}
        </Text>
      </Billboard>
    </group>
  );
}
```

In `src/App.tsx`: import `useHotkeys` and call it at the top of `App`; render inside `<Scene>`: `<Entities /><GroundInteraction /><BuildGhost />`.

- [ ] **Step 4: Verify**

Run: `npx vitest run && npm run build` → Expected: PASS and exit 0.
Manual check (`npm run dev`): from the browser console, call `useGame` through the module, or temporarily add `useGame.getState().setTool({ kind: 'footprint' })` in App's effect. Then:
- Dragging on the ground shows a green or red box with its size and cost, and releasing it builds the warehouse.
- `Esc` clears the tool.
- Left-drag on empty ground draws no visible box yet (that overlay comes in Task 16) but selects forklifts inside the rectangle.
- With a forklift selected, right-clicking an interior cell drives it there.
- Space pauses the game, and 1/2/3 change speed.

Remove the temporary line.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(input): build tools with ghost preview, box select, right-click orders, hotkeys"
```

---

### Task 15: HUD panels — top bar, KPI cards, inspector, ops panel, shipment timeline

**Files:**
- Create: `src/ui/Panel.tsx`, `src/ui/Icon.tsx`, `src/ui/TopBar.tsx`, `src/ui/KpiCards.tsx`, `src/ui/Inspector.tsx`, `src/ui/OpsPanel.tsx`, `src/ui/ShipmentTimeline.tsx`
- Modify: `src/App.tsx` (mount the overlay)

**Interfaces:**
- Consumes: `useGame` (`hud`, `selection`, `speed`, actions), `format.ts`, `COST`, `PRODUCTS`
- Produces: `Panel`, `Badge`, `Progress`, `Button`, `Kicker`, `Row`, `Hint`, `statusTone(status)`, `Icon({ name, className })`, and the five panel components (no props; each reads the store)

- [ ] **Step 1: Implement shared primitives**

`src/ui/Icon.tsx`:
```tsx
const PATHS: Record<string, string> = {
  box: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  truck: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 20a2 2 0 100-4 2 2 0 000 4zM17 20a2 2 0 100-4 2 2 0 000 4z',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  play: 'M7 5l12 7-12 7z',
  pause: 'M8 5v14M16 5v14',
  clipboard: 'M9 3h6v3H9zM6 5h12v16H6zM9 11h6M9 15h4',
  home: 'M3 11l9-7 9 7M5 10v10h14V10',
  hammer: 'M14 4l6 6-3 3-6-6zM11 7l-7 7 3 3 7-7',
  x: 'M6 6l12 12M18 6L6 18',
  forklift: 'M4 17V9h6l3 5v3M16 4v13h5M6 21a2 2 0 100-4 2 2 0 000 4zM12 21a2 2 0 100-4 2 2 0 000 4z',
  rack: 'M5 3v18M19 3v18M5 9h14M5 15h14',
  doorIn: 'M4 21V5l8-2 8 2v16M12 9v8M9 14l3 3 3-3',
  doorOut: 'M4 21V5l8-2 8 2v16M12 17V9M9 12l3-3 3 3',
  grid: 'M4 4h16v16H4zM4 12h16M12 4v16',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  warehouse: 'M3 21V9l9-5 9 5v12M7 21v-7h10v7',
  check: 'M5 12l5 5 9-10',
  chevron: 'M9 6l6 6-6 6',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  wrench: 'M15 5a4 4 0 104 4l-9 9-3-3 9-9',
  alert: 'M12 3l10 18H2zM12 10v4M12 17v.5',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
};

export function Icon({ name, className = 'h-5 w-5' }: { name: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name] ?? PATHS.box} />
    </svg>
  );
}
```

`src/ui/Panel.tsx`:
```tsx
import type { ReactNode } from 'react';

export function Panel({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`pointer-events-auto rounded-2xl border border-white/80 bg-white/85 shadow-[0_8px_30px_rgba(15,23,42,0.12)] backdrop-blur-md ${className}`}>
      {children}
    </div>
  );
}

export type Tone = 'green' | 'amber' | 'blue' | 'red' | 'slate';
const TONES: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-blue-50 text-blue-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-500',
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

export function statusTone(status: string): Tone {
  if (/Unloading|Loading|Working|Operational|In Stock|Done|done/.test(status)) return 'green';
  if (/Waiting|Low|Late|Under construction|Reserved/.test(status)) return 'amber';
  if (/Broken|Failed|failed|Empty/.test(status)) return 'red';
  if (/Docking|En route|Moving|Scheduled|Departing|active/.test(status)) return 'blue';
  return 'slate';
}

export function Progress({ value, total, tone = 'green' }: { value: number; total: number; tone?: 'green' | 'blue' }) {
  const pct = total ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div className={`h-full rounded-full transition-[width] duration-300 ${tone === 'green' ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Button({
  onClick, disabled, children, variant = 'primary', title, className = '',
}: { onClick?: () => void; disabled?: boolean; children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'active'; title?: string; className?: string }) {
  const styles = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    active: 'bg-blue-50 text-blue-700 ring-2 ring-blue-500',
  }[variant];
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600">{children}</div>;
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{children}</span>
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{children}</p>;
}

export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <path d="M20 3l15 8.5v17L20 37 5 28.5v-17z" fill="#2563EB" />
      <path d="M20 3l15 8.5L20 20 5 11.5z" fill="#60A5FA" />
      <path d="M20 20v17l15-8.5v-17z" fill="#1D4ED8" />
    </svg>
  );
}
```

- [ ] **Step 2: Implement the top bar and KPI cards**

`src/ui/TopBar.tsx`:
```tsx
import { useGame, type Speed } from '../game/store';
import { WIN_NET_WORTH, WIN_REP } from '../sim/balance';
import { money } from './format';
import { Icon } from './Icon';
import { LogoMark, Panel, Progress } from './Panel';

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5" title={`${value.toFixed(1)} / 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <div key={i} className="relative h-4 w-4 text-slate-300">
            <Icon name="star" className="absolute inset-0 h-4 w-4" />
            <div className="absolute inset-0 overflow-hidden text-amber-400" style={{ width: `${fill * 100}%` }}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const SPEEDS: Speed[] = [1, 2, 4];

export function TopBar() {
  const hud = useGame((s) => s.hud);
  const speed = useGame((s) => s.speed);
  const offers = useGame((s) => s.hud?.offers.length ?? 0);
  const { setSpeed, togglePause, toggleContracts, quitToMenu, resetCamera, toggleRoof } = useGame.getState();
  if (!hud) return null;
  const pct = hud.capacity ? Math.round((hud.stock / hud.capacity) * 100) : 0;
  const busy = hud.docks.filter((d) => d.truckId).length;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-3 p-4">
      <Panel className="flex items-center gap-2 px-3 py-2">
        <LogoMark />
        <div className="leading-tight">
          <div className="text-xl font-extrabold tracking-tight">WareTrack</div>
          <div className="text-[10px] font-bold tracking-[0.25em] text-slate-400">TYCOON</div>
        </div>
      </Panel>
      <Panel className="flex items-center gap-3 px-3 py-2">
        <span className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-bold text-white">WH-01</span>
        <div className="leading-tight">
          <div className="text-sm font-semibold">First Lot</div>
          <div className="text-xs text-slate-500">
            {pct}% full · {busy}/{hud.docks.length} docked
          </div>
        </div>
      </Panel>
      <div className="flex-1" />
      {hud.mode === 'scenario' && (
        <Panel className="w-56 px-3 py-2">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Goal · Day 7</span>
            <span className="tabular-nums">{money(hud.netWorth)} / $250k</span>
          </div>
          <Progress value={hud.netWorth} total={WIN_NET_WORTH} tone="blue" />
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>Reputation</span>
            <span className={hud.reputation >= WIN_REP ? 'font-semibold text-emerald-600' : ''}>
              {hud.reputation.toFixed(1)} / {WIN_REP}★
            </span>
          </div>
        </Panel>
      )}
      <Panel className="px-4 py-2">
        <div className="text-xs text-slate-500">Cash</div>
        <div className={`text-lg font-bold tabular-nums ${hud.cash < 0 ? 'text-red-600' : 'text-slate-900'}`}>{money(hud.cash)}</div>
      </Panel>
      <Panel className="px-3 py-2">
        <div className="text-xs text-slate-500">Reputation</div>
        <div className="mt-1">
          <Stars value={hud.reputation} />
        </div>
      </Panel>
      <Panel className="flex items-center gap-1 px-2 py-1.5">
        <span
          className={`mr-1 flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold tabular-nums ${speed ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}
        >
          <span className={`h-2 w-2 rounded-full ${speed ? 'animate-pulse bg-emerald-500' : 'bg-slate-400'}`} />
          {hud.clock}
        </span>
        <button type="button" onClick={togglePause} title="Pause (Space)" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
          <Icon name={speed ? 'pause' : 'play'} className="h-4 w-4" />
        </button>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={`rounded-lg px-2 py-1 text-xs font-bold ${speed === s ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            {s}×
          </button>
        ))}
      </Panel>
      <Panel className="flex items-center gap-1 px-1.5 py-1.5">
        <button type="button" onClick={toggleContracts} title="Contracts (C)" className="relative rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
          <Icon name="clipboard" />
          {offers > 0 && <span className="absolute -right-0.5 -top-0.5 h-4 min-w-4 rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">{offers}</span>}
        </button>
        <button type="button" onClick={toggleRoof} title="Roof cutaway (R)" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
          <Icon name="layers" />
        </button>
        <button type="button" onClick={resetCamera} title="Reset view (H)" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
          <Icon name="home" />
        </button>
        <button type="button" onClick={quitToMenu} title="Main menu" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
          <Icon name="menu" />
        </button>
      </Panel>
    </div>
  );
}
```

`src/ui/KpiCards.tsx`:
```tsx
import { useGame } from '../game/store';
import { Icon } from './Icon';
import { Panel } from './Panel';

export function KpiCards() {
  const hud = useGame((s) => s.hud);
  if (!hud) return null;
  const cards = [
    { icon: 'box', label: 'Stock on hand', value: String(hud.stock), sub: `pallets · ${hud.capacity} slots` },
    { icon: 'truck', label: 'Trucks on site', value: String(hud.trucksOnSite), sub: `${hud.inboundArriving} inbound · WH-01` },
    { icon: 'clock', label: 'On-time delivery', value: `${hud.onTimePct}%`, sub: `${hud.stats.onTime + hud.stats.late + hud.stats.failed} contracts · WH-01` },
  ];
  return (
    <div className="pointer-events-none absolute left-4 top-24 flex gap-3">
      {cards.map((c) => (
        <Panel key={c.label} className="flex w-52 items-center gap-3 px-4 py-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Icon name={c.icon} className="h-6 w-6" />
          </div>
          <div className="leading-tight">
            <div className="text-xs font-medium text-slate-500">{c.label}</div>
            <div className="text-2xl font-extrabold tabular-nums">{c.value}</div>
            <div className="text-xs text-slate-400">{c.sub}</div>
          </div>
        </Panel>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Implement the inspector**

`src/ui/Inspector.tsx`:
```tsx
import { useGame } from '../game/store';
import { COST } from '../sim/balance';
import { PRODUCTS } from '../sim/products';
import { inDuration, money, TYPE_LABEL, when } from './format';
import { Icon } from './Icon';
import { Badge, Button, Hint, Kicker, Panel, Progress, Row, statusTone } from './Panel';

function Header({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  const select = useGame((s) => s.select);
  return (
    <div className="flex items-start justify-between">
      <div>
        <Kicker>{kicker}</Kicker>
        <div className="text-xl font-extrabold">{title}</div>
        {sub && <div className="text-sm text-slate-500">{sub}</div>}
      </div>
      <button type="button" onClick={() => select(null)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50">
        <Icon name="x" className="h-4 w-4" />
      </button>
    </div>
  );
}

const Gone = ({ text }: { text: string }) => (
  <>
    <Header kicker="SELECTION" title="Gone" />
    <p className="mt-2 text-sm text-slate-500">{text}</p>
  </>
);

function SiteOverview() {
  const hud = useGame((s) => s.hud)!;
  const status = !hud.buildingReady ? (hud.constructing ? 'Under construction' : 'Empty lot') : 'Operational';
  const working = hud.forklifts.filter((f) => f.status === 'Working').length;
  const busyDocks = hud.docks.filter((d) => d.truckId).length;
  const first = hud.forklifts.find((f) => f.detail);
  return (
    <>
      <Kicker>DEPOT · WH-01</Kicker>
      <div className="text-xl font-extrabold">First Lot</div>
      <div className="text-sm text-slate-500">40 × 30 lot · Linden NJ</div>
      <div className="mt-3 flex items-center gap-2">
        <Badge tone={statusTone(status)}>{status}</Badge>
        <span className="text-sm text-slate-500">
          {busyDocks} docked · {hud.inboundArriving} arriving · {hud.active.length} active
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Stock on hand</div>
          <div className="font-bold tabular-nums">
            {hud.stock} <span className="text-xs font-normal text-slate-400">/ {hud.capacity}</span>
          </div>
          <Progress value={hud.stock} total={hud.capacity} tone="blue" />
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Truck bays</div>
          <div className="font-bold tabular-nums">
            {busyDocks} <span className="text-xs font-normal text-slate-400">/ {hud.docks.length} busy</span>
          </div>
          <Progress value={busyDocks} total={hud.docks.length} />
        </div>
      </div>
      <div className="mt-4 flex justify-between text-sm font-semibold">
        <span>Inventory</span>
        <span className="text-xs font-normal text-slate-400">pallets</span>
      </div>
      <div className="mt-1">
        {hud.inventory.map((r) => (
          <div key={r.product} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm last:border-0">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ background: PRODUCTS[r.product].color }} />
              {r.name}
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{r.count}</span>
              <Badge tone={r.count === 0 ? 'slate' : r.count < 4 ? 'amber' : 'green'}>{r.count === 0 ? 'Empty' : r.count < 4 ? 'Low Stock' : 'In Stock'}</Badge>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between text-sm font-semibold">
        <span>Forklift fleet</span>
        <span className="text-xs font-normal text-slate-500">
          {working}/{hud.forklifts.length} working
        </span>
      </div>
      {first && (
        <div className="mt-1 text-sm text-slate-600">
          <span className="font-semibold">{first.label}</span> {first.detail}
        </div>
      )}
      <Hint>Click anything in the yard to inspect it. Press B to build, C for contracts.</Hint>
    </>
  );
}

function ForkliftCard({ ids }: { ids: string[] }) {
  const hud = useGame((s) => s.hud)!;
  const dispatch = useGame((s) => s.dispatch);
  if (ids.length > 1) {
    return (
      <>
        <Header kicker="FORKLIFTS" title={`${ids.length} selected`} />
        <div className="mt-2">
          {hud.forklifts
            .filter((f) => ids.includes(f.id))
            .map((f) => (
              <Row key={f.id} label={f.label}>
                <Badge tone={statusTone(f.status)}>{f.status}</Badge>
              </Row>
            ))}
        </div>
        <Hint>Right-click a truck to focus them on it, or the floor to move them.</Hint>
      </>
    );
  }
  const row = hud.forklifts.find((f) => f.id === ids[0]);
  if (!row) return <Gone text="This forklift no longer exists." />;
  return (
    <>
      <Header kicker="FORKLIFT" title={row.label} sub={row.fast ? 'Fast mast fitted' : 'Standard mast'} />
      <div className="mt-3 flex items-center gap-2">
        <Badge tone={statusTone(row.status)}>{row.status}</Badge>
        <span className="text-sm text-slate-600">{row.detail || 'Waiting for work'}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button disabled={row.fast} onClick={() => dispatch({ type: 'upgradeForklift', forkliftId: row.id })}>
          <Icon name="bolt" className="h-4 w-4" /> Fast mast {money(COST.fastMast)}
        </Button>
        <Button variant="secondary" disabled={row.state !== 'broken'} onClick={() => dispatch({ type: 'repairForklift', forkliftId: row.id })}>
          <Icon name="wrench" className="h-4 w-4" /> Repair {money(COST.repair)}
        </Button>
      </div>
      <Hint>Right-click a truck, pallet or floor cell to give orders. Shift-click or drag to select several.</Hint>
    </>
  );
}

function TruckCard({ id }: { id: string }) {
  const hud = useGame((s) => s.hud)!;
  const dispatch = useGame((s) => s.dispatch);
  const row = hud.trucks.find((t) => t.id === id);
  if (!row) return <Gone text="This truck has left the site." />;
  const c = [...hud.active, ...hud.history].find((x) => x.id === row.contractId);
  const doors = hud.docks.filter((d) => d.kind === row.kind);
  const canRedirect = row.state === 'scheduled' || row.state === 'queued' || row.state === 'driving';
  return (
    <>
      <Header kicker={`TRUCK · ${row.kind === 'in' ? 'INBOUND' : 'OUTBOUND'}`} title={row.id} sub={row.client} />
      <div className="mt-2">
        <Row label="Status">
          <Badge tone={statusTone(row.status)}>{row.status}</Badge>
        </Row>
        <Row label="Door">{row.door ?? '—'}</Row>
        <Row label={row.kind === 'in' ? 'Unloaded' : 'Loaded'}>
          {row.done}/{row.total}
        </Row>
        {row.state === 'scheduled' && <Row label="Arrives">{when(row.arriveAt, hud.minute)}</Row>}
        {c && <Row label="Contract">{`${TYPE_LABEL[c.type]} · ${c.productName}`}</Row>}
        {c && <Row label="Deadline">{`${when(c.deadline, hud.minute)} (${inDuration(c.deadline - hud.minute)})`}</Row>}
      </div>
      <div className="mt-2">
        <Progress value={row.done} total={row.total} />
      </div>
      {canRedirect && doors.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold text-slate-500">Send to door</div>
          <div className="flex flex-wrap gap-2">
            {doors.map((d) => (
              <Button
                key={d.id}
                variant={d.truckId === id ? 'active' : 'secondary'}
                disabled={!!d.truckId && d.truckId !== id}
                onClick={() => dispatch({ type: 'reassignTruck', truckId: id, doorId: d.id })}
              >
                {d.label}
              </Button>
            ))}
          </div>
        </div>
      )}
      <Hint>Select forklifts and right-click this truck to focus them on it. With this truck selected, right-click a door to redirect it.</Hint>
    </>
  );
}

function DoorCard({ id }: { id: string }) {
  const hud = useGame((s) => s.hud)!;
  const dispatch = useGame((s) => s.dispatch);
  const door = useGame.getState().world?.doors[id];
  const row = hud.docks.find((d) => d.id === id);
  if (!row || !door) return <Gone text="This door was removed." />;
  return (
    <>
      <Header kicker="DOCK DOOR · WH-01" title={row.label} sub={row.kind === 'in' ? 'Inbound dock with leveller' : 'Outbound dock with leveller'} />
      <div className="mt-3 flex items-center gap-2">
        <Badge tone={statusTone(row.status)}>{row.status}</Badge>
        {row.truckId && <span className="text-sm text-slate-600">{`${row.truckId} · ${row.client}`}</span>}
      </div>
      {row.truckId && (
        <div className="mt-2">
          <Progress value={row.done} total={row.total} />
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={!!row.truckId} onClick={() => dispatch({ type: 'toggleDoor', doorId: id })}>
          Switch to {row.kind === 'in' ? 'Out' : 'In'} · {money(COST.doorToggle)}
        </Button>
        <Button variant="secondary" disabled={!!row.truckId} onClick={() => dispatch({ type: 'demolish', cell: door.cell })}>
          <Icon name="trash" className="h-4 w-4" /> Demolish
        </Button>
      </div>
    </>
  );
}

function RackCard({ id }: { id: string }) {
  useGame((s) => s.hud?.minute);
  const dispatch = useGame((s) => s.dispatch);
  const w = useGame.getState().world;
  const rack = w?.racks[id];
  if (!w || !rack) return <Gone text="This rack was removed." />;
  const slotName = (i: number) => {
    const pid = rack.slots[i];
    const p = pid ? w.pallets[pid] : undefined;
    return p ? PRODUCTS[p.product].name : 'Empty';
  };
  return (
    <>
      <Header kicker="PALLET RACK" title={`Rack ${id.split('-')[1]}`} sub="2 bays × 2 levels" />
      <div className="mt-2">
        <Row label="Upper · left">{slotName(2)}</Row>
        <Row label="Upper · right">{slotName(3)}</Row>
        <Row label="Ground · left">{slotName(0)}</Row>
        <Row label="Ground · right">{slotName(1)}</Row>
      </div>
      <div className="mt-3">
        <Button variant="secondary" onClick={() => dispatch({ type: 'demolish', cell: rack.cells[0] })}>
          <Icon name="trash" className="h-4 w-4" /> Demolish · refund {money(COST.rack / 2)}
        </Button>
      </div>
      <Hint>Heavy goods (Spring Water) only go on the ground level.</Hint>
    </>
  );
}

function PalletCard({ id }: { id: string }) {
  useGame((s) => s.hud?.minute);
  const w = useGame.getState().world;
  const p = w?.pallets[id];
  if (!w || !p) return <Gone text="This pallet has left the site." />;
  const c = w.contracts[p.contractId];
  const where = { truck: 'On a truck', rack: 'In a rack', staging: 'On staging', floor: 'On the floor (blocking)', forklift: 'On a forklift' }[p.loc.kind];
  const job = w.jobs[`job-${p.id}`];
  return (
    <>
      <Header kicker="PALLET" title={PRODUCTS[p.product].name} sub={c ? `${c.client} · ${TYPE_LABEL[c.type]}` : undefined} />
      <div className="mt-2">
        <Row label="Location">{where}</Row>
        <Row label="Next move">{job ? `${job.type.toLowerCase()}${job.forkliftId ? ' · assigned' : ' · queued'}` : 'None'}</Row>
        {c && <Row label="Deadline">{when(c.deadline, w.minute)}</Row>}
      </div>
      <Hint>Select a forklift and right-click this pallet to make it handle the pallet now.</Hint>
    </>
  );
}

function ContractCard({ id }: { id: string }) {
  const hud = useGame((s) => s.hud)!;
  const dispatch = useGame((s) => s.dispatch);
  const c = [...hud.active, ...hud.offers, ...hud.history].find((x) => x.id === id);
  if (!c) return <Gone text="This offer expired." />;
  return (
    <>
      <Header kicker={`CONTRACT · ${TYPE_LABEL[c.type].toUpperCase()}`} title={c.client} sub={`${c.qty} × ${c.productName}`} />
      <div className="mt-2">
        <Row label="Status">
          <Badge tone={statusTone(c.status)}>{c.status}</Badge>
        </Row>
        <Row label="Progress">{`${c.done}/${c.qty}`}</Row>
        <Row label="Payout">{money(c.payout)}</Row>
        {c.type === 'storage' && <Row label="Rent">{`${money(c.rentPerDay)}/pallet/day · ${c.storeDays}d`}</Row>}
        <Row label="Deadline">{when(c.deadline, hud.minute)}</Row>
      </div>
      {c.status === 'active' && (
        <div className="mt-3">
          <Button variant={c.rush ? 'active' : 'secondary'} onClick={() => dispatch({ type: 'toggleRush', contractId: c.id })}>
            <Icon name="bolt" className="h-4 w-4" /> {c.rush ? 'Rush on' : 'Mark as rush'}
          </Button>
        </div>
      )}
    </>
  );
}

export function Inspector() {
  const sel = useGame((s) => s.selection);
  const hasHud = useGame((s) => !!s.hud);
  const contractsOpen = useGame((s) => s.contractsOpen);
  if (!hasHud || contractsOpen) return null;
  let body;
  if (!sel) body = <SiteOverview />;
  else if (sel.kind === 'forklifts') body = <ForkliftCard ids={sel.ids} />;
  else if (sel.kind === 'truck') body = <TruckCard id={sel.id} />;
  else if (sel.kind === 'door') body = <DoorCard id={sel.id} />;
  else if (sel.kind === 'rack') body = <RackCard id={sel.id} />;
  else if (sel.kind === 'pallet') body = <PalletCard id={sel.id} />;
  else body = <ContractCard id={sel.id} />;
  return <Panel className="absolute right-4 top-24 max-h-[calc(100vh-380px)] w-[360px] overflow-y-auto p-4">{body}</Panel>;
}
```

- [ ] **Step 4: Implement the ops panel and shipment timeline**

`src/ui/OpsPanel.tsx`:
```tsx
import { useState } from 'react';
import { useGame } from '../game/store';
import { Icon } from './Icon';
import { Badge, Panel, Progress, statusTone } from './Panel';

type Tab = 'docks' | 'forklifts' | 'trucks';

export function OpsPanel() {
  const hud = useGame((s) => s.hud);
  const select = useGame((s) => s.select);
  const [tab, setTab] = useState<Tab>('docks');
  if (!hud) return null;
  const busy = hud.docks.filter((d) => d.truckId).length;
  const working = hud.forklifts.filter((f) => f.status === 'Working').length;
  const visibleTrucks = hud.trucks.filter((t) => t.state !== 'scheduled');
  const tabs: { id: Tab; label: string; count: string }[] = [
    { id: 'docks', label: 'Docks', count: `${busy}/${hud.docks.length}` },
    { id: 'forklifts', label: 'Forklifts', count: `${working}/${hud.forklifts.length}` },
    { id: 'trucks', label: 'Trucks', count: String(visibleTrucks.length) },
  ];
  const rowCls = 'grid w-full grid-cols-[72px_1fr_96px_64px_16px] items-center gap-2 border-b border-slate-100 py-2 text-left text-sm last:border-0 hover:bg-slate-50';
  return (
    <Panel className="absolute bottom-4 right-4 w-[440px] p-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Icon name="warehouse" className="h-4 w-4" />
        </div>
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1 text-sm font-semibold ${tab === t.id ? 'bg-white shadow-sm' : 'text-slate-500'}`}
            >
              {t.label} <span className="text-blue-600">{t.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 max-h-52 overflow-y-auto pr-1">
        {tab === 'docks' &&
          (hud.docks.length ? (
            hud.docks.map((d) => (
              <button key={d.id} type="button" className={rowCls} onClick={() => select({ kind: 'door', id: d.id })}>
                <span className="font-semibold">{d.label}</span>
                <span className="truncate text-slate-600">{d.truckId ? `${d.truckId} · ${d.client}` : 'No truck assigned'}</span>
                <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                <span>{d.truckId ? <Progress value={d.done} total={d.total} /> : null}</span>
                <Icon name="chevron" className="h-4 w-4 text-slate-400" />
              </button>
            ))
          ) : (
            <p className="py-4 text-center text-sm text-slate-400">No dock doors yet — add one from the build bar.</p>
          ))}
        {tab === 'forklifts' &&
          hud.forklifts.map((f) => (
            <button key={f.id} type="button" className={rowCls} onClick={() => select({ kind: 'forklifts', ids: [f.id] })}>
              <span className="font-semibold">{f.label}</span>
              <span className="truncate text-slate-600">{f.detail || '—'}</span>
              <Badge tone={statusTone(f.status)}>{f.status}</Badge>
              <span className="text-xs text-slate-400">{f.fast ? 'Fast' : ''}</span>
              <Icon name="chevron" className="h-4 w-4 text-slate-400" />
            </button>
          ))}
        {tab === 'trucks' &&
          (visibleTrucks.length ? (
            visibleTrucks.map((t) => (
              <button key={t.id} type="button" className={rowCls} onClick={() => select({ kind: 'truck', id: t.id })}>
                <span className="font-semibold">{t.id}</span>
                <span className="truncate text-slate-600">{`${t.client}${t.door ? ` · ${t.door}` : ''}`}</span>
                <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                <span className="text-xs tabular-nums text-slate-500">{`${t.done}/${t.total}`}</span>
                <Icon name="chevron" className="h-4 w-4 text-slate-400" />
              </button>
            ))
          ) : (
            <p className="py-4 text-center text-sm text-slate-400">No trucks on site.</p>
          ))}
      </div>
    </Panel>
  );
}
```

`src/ui/ShipmentTimeline.tsx`:
```tsx
import { useGame } from '../game/store';
import type { TruckRow } from '../game/hud';
import { inDuration, TYPE_LABEL, when } from './format';
import { Icon } from './Icon';
import { Badge, Panel, statusTone } from './Panel';

function stepIndex(t: TruckRow): number {
  switch (t.state) {
    case 'scheduled':
      return 0;
    case 'queued':
    case 'driving':
    case 'docking':
      return 1;
    case 'docked':
      return 3;
    case 'departing':
      return 4;
  }
}

export function ShipmentTimeline() {
  const hud = useGame((s) => s.hud);
  const sel = useGame((s) => s.selection);
  const select = useGame((s) => s.select);
  if (!hud) return null;
  const focus =
    (sel?.kind === 'truck' && hud.trucks.find((t) => t.id === sel.id)) ||
    hud.trucks.find((t) => t.state === 'docked') ||
    hud.trucks.find((t) => t.state !== 'scheduled') ||
    hud.trucks[0];
  if (!focus) {
    return (
      <Panel className="absolute bottom-4 left-4 w-[560px] px-5 py-4">
        <div className="flex items-center gap-2 font-bold">
          <Icon name="truck" className="h-5 w-5 text-blue-600" /> Shipment Tracking
        </div>
        <p className="mt-2 text-sm text-slate-500">Accept a contract (C) to see trucks and shipments here.</p>
      </Panel>
    );
  }
  const c = [...hud.active, ...hud.history].find((x) => x.id === focus.contractId);
  const steps =
    focus.kind === 'in'
      ? ['Scheduled', 'Arrived', 'Docked', `Unloading ${focus.done}/${focus.total}`, 'Empty · leaving']
      : ['Scheduled', 'Arrived', 'Docked', `Loading ${focus.done}/${focus.total}`, 'Departed'];
  const idx = stepIndex(focus);
  return (
    <Panel className="absolute bottom-4 left-4 flex w-[760px] items-stretch gap-4 px-5 py-4">
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold">
            <Icon name="truck" className="h-5 w-5 text-blue-600" /> Shipment Tracking
          </div>
          <span className="text-sm text-slate-500">{`${focus.id} · ${focus.client}`}</span>
        </div>
        <div className="mt-4 flex items-start">
          {steps.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col items-center text-center">
              <div className="flex w-full items-center">
                <div className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : i <= idx ? 'bg-blue-600' : 'bg-slate-200'}`} />
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    i < idx ? 'bg-blue-600 text-white' : i === idx ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <Icon name={i < idx ? 'check' : i === 3 ? 'box' : 'truck'} className="h-4 w-4" />
                </div>
                <div className={`h-0.5 flex-1 ${i === steps.length - 1 ? 'opacity-0' : i < idx ? 'bg-blue-600' : 'bg-slate-200'}`} />
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-700">{label}</div>
              {i === 0 && <div className="text-[11px] text-slate-400">{when(focus.arriveAt, hud.minute)}</div>}
            </div>
          ))}
        </div>
      </div>
      {c && (
        <button
          type="button"
          onClick={() => select({ kind: 'contract', id: c.id })}
          className="flex w-60 items-center gap-3 rounded-xl bg-slate-50 p-3 text-left hover:bg-slate-100"
        >
          <div className="min-w-0 flex-1">
            <div className="font-bold">{`#${c.id.toUpperCase()}`}</div>
            <div className="truncate text-sm text-slate-500">{`${TYPE_LABEL[c.type]} · ${c.qty} × ${c.productName}`}</div>
            <div className="mt-1">
              <Badge tone={statusTone(focus.status)}>{focus.status}</Badge>
            </div>
            <div className="mt-1 text-xs text-slate-500">{`${focus.door ?? 'No door'} · due ${inDuration(c.deadline - hud.minute)}`}</div>
          </div>
          <Icon name="chevron" className="h-4 w-4 text-slate-400" />
        </button>
      )}
    </Panel>
  );
}
```

In `src/App.tsx`, after the `<Scene>` element, add the overlay:
```tsx
      <div className="pointer-events-none absolute inset-0">
        <TopBar />
        <KpiCards />
        <Inspector />
        <OpsPanel />
        <ShipmentTimeline />
      </div>
```
Remove the temporary clock label, and import the five components.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run build` → Expected: exit 0.
Run `npm run dev`. Expected: the top bar shows the WareTrack logo, WH-01 chip, goal progress, cash, stars, a live clock and speed buttons. Three KPI cards sit at the top-left and a site overview card at the right. The ops panel (bottom-right) has Docks, Forklifts and Trucks tabs, and Shipment Tracking (bottom-left) shows its empty-state hint. Clicking the speed and pause buttons works. No console errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): top bar, KPI cards, inspector, ops panel and shipment timeline"
```

---

### Task 16: Build toolbar, contract board, toasts, checklist, end modal, main menu

**Files:**
- Create: `src/ui/BuildToolbar.tsx`, `src/ui/ContractBoard.tsx`, `src/ui/Toasts.tsx`, `src/ui/Checklist.tsx`, `src/ui/ScenarioEndModal.tsx`, `src/ui/MainMenu.tsx`, `src/ui/BoxSelectOverlay.tsx`
- Modify: `src/App.tsx` (final layout with menu screen)

**Interfaces:**
- Consumes: store (`tool`, `buildOpen`, `contractsOpen`, `checklistOpen`, `toasts`, `dragRect`, `hud`, `world`, actions), `TOOL_COST`, `PRODUCTS`, format helpers
- Produces: final `App`

- [ ] **Step 1: Implement**

`src/ui/BuildToolbar.tsx`:
```tsx
import { useGame, type BuildTool } from '../game/store';
import { COST } from '../sim/balance';
import { money } from './format';
import { Icon } from './Icon';
import { Panel } from './Panel';

type Item = { key: string; label: string; icon: string; cost: string; tool: NonNullable<BuildTool> | null; hint: string };

export function BuildToolbar() {
  const open = useGame((s) => s.buildOpen);
  const tool = useGame((s) => s.tool);
  const ready = useGame((s) => s.hud?.buildingReady ?? false);
  const { setTool, toggleBuild, dispatch } = useGame.getState();
  if (!open) {
    return (
      <div className="pointer-events-none absolute bottom-[150px] left-1/2 -translate-x-1/2">
        <Panel className="px-1 py-1">
          <button type="button" onClick={toggleBuild} className="flex items-center gap-2 rounded-xl px-4 py-2 font-semibold text-blue-700 hover:bg-blue-50">
            <Icon name="hammer" /> Build <kbd className="rounded bg-slate-100 px-1.5 text-xs text-slate-500">B</kbd>
          </button>
        </Panel>
      </div>
    );
  }
  const items: Item[] = [
    { key: 'footprint', label: ready ? 'Expand' : 'Warehouse', icon: 'warehouse', cost: `${money(COST.cell)}/cell`, tool: { kind: 'footprint' }, hint: 'Drag a rectangle on the lot. Expansions must share a wall.' },
    { key: 'in', label: 'In door', icon: 'doorIn', cost: money(COST.door), tool: { kind: 'door', doorKind: 'in' }, hint: 'Click a wall with 8 cells of clear yard outside.' },
    { key: 'out', label: 'Out door', icon: 'doorOut', cost: money(COST.door), tool: { kind: 'door', doorKind: 'out' }, hint: 'Outbound trucks load here.' },
    { key: 'rack', label: 'Rack', icon: 'rack', cost: money(COST.rack), tool: { kind: 'rack', orient: tool?.kind === 'rack' ? tool.orient : 'h' }, hint: 'Click inside. Press T to rotate. 4 pallet slots.' },
    { key: 'staging', label: 'Staging', icon: 'grid', cost: `${money(COST.staging)}/cell`, tool: { kind: 'staging' }, hint: 'Click or drag to paint buffer cells near doors.' },
    { key: 'demolish', label: 'Demolish', icon: 'trash', cost: '50% back', tool: { kind: 'demolish' }, hint: 'Click a rack, door or staging cell.' },
  ];
  const activeKey = tool ? (tool.kind === 'door' ? tool.doorKind : tool.kind) : null;
  const active = items.find((i) => i.key === activeKey);
  return (
    <div className="pointer-events-none absolute bottom-[150px] left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
      {active && <div className="rounded-lg bg-slate-900/80 px-3 py-1.5 text-xs text-white">{active.hint} · Esc to cancel</div>}
      <Panel className="flex items-center gap-1 p-1.5">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={() => setTool(activeKey === it.key ? null : it.tool)}
            className={`flex w-[84px] flex-col items-center rounded-xl px-2 py-1.5 text-xs font-semibold transition ${
              activeKey === it.key ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Icon name={it.icon} className="h-5 w-5" />
            <span className="mt-0.5">{it.label}</span>
            <span className={`text-[10px] ${activeKey === it.key ? 'text-blue-100' : 'text-slate-400'}`}>{it.cost}</span>
          </button>
        ))}
        <div className="mx-1 h-10 w-px bg-slate-200" />
        <button
          type="button"
          disabled={!ready}
          onClick={() => dispatch({ type: 'buyForklift' })}
          className="flex w-[84px] flex-col items-center rounded-xl px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
        >
          <Icon name="forklift" className="h-5 w-5" />
          <span className="mt-0.5">Forklift</span>
          <span className="text-[10px] text-slate-400">{money(COST.forklift)}</span>
        </button>
        <button type="button" onClick={toggleBuild} className="ml-1 rounded-lg p-2 text-slate-400 hover:bg-slate-100" title="Close (B)">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </Panel>
    </div>
  );
}
```

`src/ui/ContractBoard.tsx`:
```tsx
import { useGame } from '../game/store';
import type { ContractRow } from '../game/hud';
import { PRODUCTS } from '../sim/products';
import { inDuration, money, TYPE_LABEL, when } from './format';
import { Icon } from './Icon';
import { Badge, Button, Panel, Progress, type Tone } from './Panel';

const TYPE_TONE: Record<ContractRow['type'], Tone> = { storage: 'blue', crossdock: 'amber', outbound: 'green' };

function Offer({ c, now }: { c: ContractRow; now: number }) {
  const dispatch = useGame((s) => s.dispatch);
  return (
    <div className={`rounded-xl border bg-white p-3 ${c.hot ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200'}`}>
      <div className="flex items-center gap-2">
        <Badge tone={TYPE_TONE[c.type]}>{TYPE_LABEL[c.type]}</Badge>
        {c.hot && <Badge tone="red">RUSH ×2</Badge>}
        <span className="ml-auto text-xs text-slate-400">{`expires in ${inDuration(c.offerExpires - now)}`}</span>
      </div>
      <div className="mt-2 font-bold">{c.client}</div>
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <span className="h-3 w-3 rounded-sm" style={{ background: PRODUCTS[c.product].color }} />
        {`${c.qty} × ${c.productName}`}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-slate-500">
        <span>{`Arrives ${when(c.arriveAt, now)}`}</span>
        <span>{`Due ${when(c.deadline, now)}`}</span>
        {c.type === 'storage' && <span className="col-span-2">{`Store ${c.storeDays}d · rent ${money(c.rentPerDay)}/pallet/day`}</span>}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="text-lg font-extrabold text-emerald-600">{money(c.payout)}</div>
        <Button disabled={!!c.blocker} title={c.blocker ?? ''} onClick={() => dispatch({ type: 'acceptContract', contractId: c.id })}>
          Accept
        </Button>
      </div>
      {c.blocker && <div className="mt-1 text-xs font-medium text-amber-600">{c.blocker}</div>}
    </div>
  );
}

function Active({ c, now }: { c: ContractRow; now: number }) {
  const { dispatch, select } = useGame.getState();
  const left = c.deadline - now;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <Badge tone={TYPE_TONE[c.type]}>{TYPE_LABEL[c.type]}</Badge>
        <button type="button" className="font-bold hover:underline" onClick={() => select({ kind: 'contract', id: c.id })}>
          {c.client}
        </button>
        <span className={`ml-auto text-xs font-semibold ${left < 0 ? 'text-red-600' : left < 120 ? 'text-amber-600' : 'text-slate-500'}`}>
          {left < 0 ? `${inDuration(-left)} late` : `due in ${inDuration(left)}`}
        </span>
      </div>
      <div className="mt-1 text-sm text-slate-600">{`${c.done}/${c.qty} × ${c.productName}`}</div>
      <div className="mt-2">
        <Progress value={c.done} total={c.qty} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-emerald-600">{money(c.payout)}</span>
        <Button variant={c.rush ? 'active' : 'ghost'} onClick={() => dispatch({ type: 'toggleRush', contractId: c.id })}>
          <Icon name="bolt" className="h-4 w-4" /> {c.rush ? 'Rush' : 'Rush?'}
        </Button>
      </div>
    </div>
  );
}

export function ContractBoard() {
  const open = useGame((s) => s.contractsOpen);
  const hud = useGame((s) => s.hud);
  const toggle = useGame((s) => s.toggleContracts);
  if (!open || !hud) return null;
  return (
    <Panel className="absolute bottom-4 right-4 top-24 flex w-[400px] flex-col p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-extrabold">
          <Icon name="clipboard" className="h-5 w-5 text-blue-600" /> Contracts
        </div>
        <button type="button" onClick={toggle} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex-1 space-y-4 overflow-y-auto pr-1">
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{`Offers · ${hud.offers.length}`}</h3>
          <div className="space-y-2">
            {hud.offers.length ? hud.offers.map((c) => <Offer key={c.id} c={c} now={hud.minute} />) : <p className="text-sm text-slate-400">New offers arrive every day at 06:00.</p>}
          </div>
        </section>
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{`Active · ${hud.active.length}`}</h3>
          <div className="space-y-2">
            {hud.active.length ? hud.active.map((c) => <Active key={c.id} c={c} now={hud.minute} />) : <p className="text-sm text-slate-400">No active contracts.</p>}
          </div>
        </section>
        {hud.history.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Recent</h3>
            {hud.history.map((c) => (
              <div key={c.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm last:border-0">
                <span>{`${c.client} · ${TYPE_LABEL[c.type]}`}</span>
                <span className={c.status === 'done' ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>
                  {c.status === 'done' ? money(c.earned) : 'Failed'}
                </span>
              </div>
            ))}
          </section>
        )}
      </div>
    </Panel>
  );
}
```

`src/ui/Toasts.tsx`:
```tsx
import { useGame } from '../game/store';
import { Icon } from './Icon';

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="pointer-events-none absolute left-1/2 top-24 flex w-[420px] -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium shadow-lg backdrop-blur ${
            t.kind === 'alert' ? 'bg-amber-50/95 text-amber-800' : t.kind === 'payout' ? 'bg-emerald-50/95 text-emerald-800' : 'bg-white/95 text-slate-700'
          }`}
        >
          <Icon name={t.kind === 'alert' ? 'alert' : t.kind === 'payout' ? 'check' : 'truck'} className="h-4 w-4 shrink-0" />
          {t.text}
        </div>
      ))}
    </div>
  );
}
```

`src/ui/Checklist.tsx`:
```tsx
import { useGame } from '../game/store';
import { Icon } from './Icon';
import { Panel } from './Panel';

export function Checklist() {
  const items = useGame((s) => s.hud?.checklist);
  const open = useGame((s) => s.checklistOpen);
  const toggle = useGame((s) => s.toggleChecklist);
  if (!items || items.every((i) => i.done)) return null;
  const done = items.filter((i) => i.done).length;
  return (
    <Panel className="absolute left-4 top-[200px] w-72 p-3">
      <button type="button" onClick={toggle} className="flex w-full items-center justify-between text-sm font-bold">
        <span>{`Getting started · ${done}/${items.length}`}</span>
        <Icon name="chevron" className={`h-4 w-4 transition ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {items.map((i) => (
            <li key={i.label} className={`flex items-center gap-2 text-sm ${i.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full ${i.done ? 'bg-emerald-500 text-white' : 'border border-slate-300'}`}>
                {i.done && <Icon name="check" className="h-3 w-3" />}
              </span>
              {i.label}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
```

`src/ui/BoxSelectOverlay.tsx`:
```tsx
import { useGame } from '../game/store';

export function BoxSelectOverlay() {
  const r = useGame((s) => s.dragRect);
  if (!r) return null;
  const left = Math.min(r.x0, r.x1);
  const top = Math.min(r.y0, r.y1);
  return (
    <div
      className="pointer-events-none fixed rounded border-2 border-blue-500 bg-blue-500/10"
      style={{ left, top, width: Math.abs(r.x1 - r.x0), height: Math.abs(r.y1 - r.y0) }}
    />
  );
}
```

`src/ui/ScenarioEndModal.tsx`:
```tsx
import { useGame } from '../game/store';
import { money } from './format';
import { Button, Panel } from './Panel';

export function ScenarioEndModal() {
  const hud = useGame((s) => s.hud);
  const { startGame, continueSandbox, quitToMenu } = useGame.getState();
  if (!hud?.outcome) return null;
  const won = hud.outcome === 'won';
  const seed = useGame.getState().world?.seed ?? 42;
  const s = hud.stats;
  const stats: [string, string][] = [
    ['Net worth', money(hud.netWorth)],
    ['Reputation', `${hud.reputation.toFixed(1)}★`],
    ['Contracts on time', String(s.onTime)],
    ['Late / failed', `${s.late} / ${s.failed}`],
    ['Pallets handled', String(s.palletsHandled)],
    ['Revenue', money(s.revenue)],
  ];
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
      <Panel className="w-[460px] p-6 text-center">
        <div className={`text-sm font-bold uppercase tracking-widest ${won ? 'text-emerald-600' : 'text-red-600'}`}>{won ? 'Scenario won' : 'Scenario lost'}</div>
        <h2 className="mt-1 text-2xl font-extrabold">{hud.outcomeReason}</h2>
        <div className="mt-5 grid grid-cols-2 gap-2 text-left">
          {stats.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">{k}</div>
              <div className="font-bold">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => startGame('scenario', seed)}>Retry same seed</Button>
          <Button variant="secondary" onClick={continueSandbox}>
            Continue in sandbox
          </Button>
          <Button variant="ghost" onClick={quitToMenu}>
            Main menu
          </Button>
        </div>
      </Panel>
    </div>
  );
}
```

`src/ui/MainMenu.tsx`:
```tsx
import { useState } from 'react';
import { useGame } from '../game/store';
import { Icon } from './Icon';
import { LogoMark } from './Panel';

const randomSeed = () => Math.floor(1000 + Math.random() * 9000);

export function MainMenu() {
  const startGame = useGame((s) => s.startGame);
  const [seedText, setSeedText] = useState(String(randomSeed()));
  const seed = () => {
    const n = Number.parseInt(seedText, 10);
    return Number.isFinite(n) ? Math.abs(n) : randomSeed();
  };
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 via-slate-100 to-blue-100">
      <div className="w-[720px]">
        <div className="flex items-center gap-3">
          <LogoMark className="h-14 w-14" />
          <div>
            <h1 className="text-5xl font-extrabold tracking-tight">WareTrack</h1>
            <div className="text-sm font-bold tracking-[0.4em] text-blue-600">TYCOON</div>
          </div>
        </div>
        <p className="mt-4 max-w-lg text-lg text-slate-600">Build a warehouse, win contracts, and keep trucks and forklifts moving.</p>
        <div className="mt-8 grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => startGame('scenario', seed())}
            className="group rounded-2xl bg-blue-600 p-6 text-left text-white shadow-xl transition hover:-translate-y-0.5 hover:bg-blue-700"
          >
            <Icon name="star" className="h-7 w-7" />
            <div className="mt-3 text-2xl font-extrabold">First Lot</div>
            <div className="mt-1 text-sm text-blue-100">Scenario · Reach $250k net worth and 4★ by the end of Day 7.</div>
          </button>
          <button
            type="button"
            onClick={() => startGame('sandbox', seed())}
            className="rounded-2xl bg-white p-6 text-left shadow-xl transition hover:-translate-y-0.5"
          >
            <Icon name="warehouse" className="h-7 w-7 text-blue-600" />
            <div className="mt-3 text-2xl font-extrabold">Sandbox</div>
            <div className="mt-1 text-sm text-slate-500">No goal, no clock pressure. Build and optimise at your own pace.</div>
          </button>
        </div>
        <label className="mt-6 flex items-center gap-3 text-sm text-slate-500">
          Seed
          <input
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            className="w-28 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs">Same seed = same contracts and events.</span>
        </label>
        <div className="mt-8 grid grid-cols-4 gap-2 text-xs text-slate-500">
          <div><b className="text-slate-700">WASD / edges</b> pan</div>
          <div><b className="text-slate-700">Wheel</b> zoom · <b className="text-slate-700">Q/E</b> rotate</div>
          <div><b className="text-slate-700">Left</b> select · <b className="text-slate-700">Right</b> order</div>
          <div><b className="text-slate-700">Space</b> pause · <b className="text-slate-700">1/2/3</b> speed</div>
        </div>
      </div>
    </div>
  );
}
```

Final `src/App.tsx`:
```tsx
import { useGame } from './game/store';
import { useHotkeys } from './input/hotkeys';
import { BuildGhost } from './render/BuildGhost';
import { Entities } from './render/Entities';
import { GroundInteraction } from './render/GroundInteraction';
import { Scene } from './render/Scene';
import { BoxSelectOverlay } from './ui/BoxSelectOverlay';
import { BuildToolbar } from './ui/BuildToolbar';
import { Checklist } from './ui/Checklist';
import { ContractBoard } from './ui/ContractBoard';
import { Inspector } from './ui/Inspector';
import { KpiCards } from './ui/KpiCards';
import { MainMenu } from './ui/MainMenu';
import { OpsPanel } from './ui/OpsPanel';
import { ScenarioEndModal } from './ui/ScenarioEndModal';
import { ShipmentTimeline } from './ui/ShipmentTimeline';
import { Toasts } from './ui/Toasts';
import { TopBar } from './ui/TopBar';

export default function App() {
  const screen = useGame((s) => s.screen);
  const seed = useGame((s) => s.world?.seed);
  useHotkeys();
  if (screen === 'menu') return <MainMenu />;
  return (
    <div className="relative h-full w-full">
      <Scene key={seed}>
        <Entities />
        <GroundInteraction />
        <BuildGhost />
      </Scene>
      <div className="pointer-events-none absolute inset-0">
        <TopBar />
        <KpiCards />
        <Checklist />
        <Inspector />
        <ContractBoard />
        <OpsPanel />
        <ShipmentTimeline />
        <BuildToolbar />
        <Toasts />
        <BoxSelectOverlay />
        <ScenarioEndModal />
      </div>
    </div>
  );
}
```
(`key={seed}` remounts the scene on Retry, so per-entity render state starts fresh.) `ScenarioEndModal` calls `useGame.getState()` after an early return. That's fine because it isn't a hook, but keep `useGame((s) => s.hud)` as its only hook.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx vitest run && npm run build` → Expected: all pass.
Run `npm run dev`. Expected:
- The main menu shows logo, two mode cards and the seed input.
- Starting **First Lot** opens the game with the build toolbar visible and the checklist on the left.
- The Warehouse tool's drag builds a warehouse.
- Doors and racks place, and their ghosts show costs or reasons.
- The contract board (C) lists 3 offers with Accept buttons. A storage offer is disabled with "Build an inbound dock door first" until you place an in door.
- Accepting works: a truck arrives on the road, docks, and the forklift moves pallets into racks.
- Toasts appear at top-centre.
- Box-drag shows a blue rectangle.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): build toolbar, contract board, toasts, checklist, end modal and main menu"
```

---

### Task 17: Juice and final QA — payout floaters, map pins, playtest pass

**Files:**
- Create: `src/render/Effects.tsx`, `.claude/launch.json`
- Modify: `src/App.tsx` (mount `<Effects />` inside `<Scene>`)

**Interfaces:**
- Consumes: store `floaters`, `hud.forklifts[].warn`, `hud.trucks[].state`, world positions
- Produces: `Effects` component

- [ ] **Step 1: Implement effects**

`src/render/Effects.tsx`:
```tsx
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { loop } from '../game/loop';
import { useGame, type Floater } from '../game/store';
import { interp } from './anim';
import { C, mat } from './palette';

const FLOAT_MS = 2200;

function FloatText({ f }: { f: Floater }) {
  const ref = useRef<THREE.Group>(null!);
  useFrame(() => {
    const k = (performance.now() - f.born) / FLOAT_MS;
    ref.current.position.y = 2.2 + k * 2.5;
    ref.current.visible = k < 1;
    const s = k < 0.15 ? 0.6 + (k / 0.15) * 0.4 : 1;
    ref.current.scale.setScalar(s);
  });
  return (
    <group ref={ref} position={[f.at.x, 2.2, f.at.y]}>
      <Billboard>
        <Text fontSize={0.9} color={C.ok} outlineWidth={0.07} outlineColor="#ffffff">
          {f.text}
        </Text>
      </Billboard>
    </group>
  );
}

function Pin({ kind, id, color }: { kind: 'forklift' | 'truck'; id: string; color: string }) {
  const ref = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    const w = useGame.getState().world;
    const e = kind === 'forklift' ? w?.forklifts[id] : w?.trucks[id];
    if (!e) {
      ref.current.visible = false;
      return;
    }
    const p = interp(e.prev, e.pos, loop.alpha);
    const ox = kind === 'truck' ? Math.cos(e.heading) * 2.3 : 0;
    const oz = kind === 'truck' ? Math.sin(e.heading) * 2.3 : 0;
    ref.current.visible = true;
    ref.current.position.set(p.x + ox, (kind === 'truck' ? 3.2 : 2.6) + Math.sin(clock.elapsedTime * 3) * 0.15, p.y + oz);
  });
  return (
    <group ref={ref}>
      <mesh position={[0, 0.5, 0]} castShadow material={mat(color)}>
        <sphereGeometry args={[0.34, 18, 14]} />
      </mesh>
      <mesh position={[0, 0.5, 0]} material={mat('#ffffff')}>
        <sphereGeometry args={[0.14, 12, 10]} />
      </mesh>
      <mesh rotation-x={Math.PI} position={[0, 0.05, 0]} castShadow material={mat(color)}>
        <coneGeometry args={[0.28, 0.65, 18]} />
      </mesh>
    </group>
  );
}

export function Effects() {
  const floaters = useGame((s) => s.floaters);
  const pinKey = useGame((s) =>
    s.hud
      ? `${s.hud.forklifts.filter((f) => f.warn).map((f) => f.id).join(',')}|${s.hud.trucks.filter((t) => t.state === 'queued').map((t) => t.id).join(',')}`
      : '|',
  );
  const [fl, tr] = pinKey.split('|').map((x) => x.split(',').filter(Boolean));
  return (
    <>
      {floaters.map((f) => (
        <FloatText key={f.id} f={f} />
      ))}
      {fl.map((id) => (
        <Pin key={`f-${id}`} kind="forklift" id={id} color={C.bad} />
      ))}
      {tr.map((id) => (
        <Pin key={`t-${id}`} kind="truck" id={id} color={C.blue} />
      ))}
    </>
  );
}
```

In `src/App.tsx` add `import { Effects } from './render/Effects';` and render `<Effects />` inside `<Scene>` after `<BuildGhost />`.

`.claude/launch.json`:
```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "waretrack-dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 }
  ]
}
```

- [ ] **Step 2: Automated checks**

Run: `npx vitest run` → Expected: all tests pass (sim, game, input, render helpers).
Run: `npm run build` → Expected: exit 0, no TypeScript errors.

- [ ] **Step 3: Playtest pass (manual, in the browser)**

Start the dev server (`npm run dev`, or the preview tool with `waretrack-dev`), then work through this list and fix anything that fails before moving on:
1. Menu → **First Lot** with seed `42`.
2. Build a 14×10 warehouse. The scaffold rises and completes in about 12 s at 1×, and the "Build a warehouse" checklist item ticks.
3. Place an **In door** and an **Out door** on the yard-facing wall, 4+ racks and a few staging cells. Ghosts turn red on invalid spots and show the reason.
4. Accept a storage offer. The truck arrives along the road, reverses onto the apron, and the shutter opens. Forklifts unload; pallets pop into racks (water only on the ground level). The truck leaves.
5. Accept a cross-dock offer. Pallets go straight from the in truck to the out truck (or via staging). When the out truck departs, a green "+$X" floats up and cash increases.
6. Select a forklift and right-click a docked truck: the forklift focuses on it. Right-click the floor: it drives there. Box-select two forklifts.
7. With a queued truck selected, use **Send to door** in the inspector. A blue pin floats over queued trucks.
8. Pause (Space), change speeds (1/2/3), rotate (Q/E), zoom, pan (WASD and screen edges), toggle the roof (R), reset the camera (H).
9. Wait for or trigger a breakdown (run at 4×). A red "!" and a red pin appear, the inspector offers Repair for $500, and repairing works.
10. Fill all racks and staging, then accept a big storage offer. The "Warehouse full" alert appears and the truck waits.
11. Check the browser console: no errors or React warnings during steps 1–10.
12. With ~10 forklifts and several trucks in sandbox at 4×, the frame rate stays smooth (Chrome DevTools → Performance, about 60 fps on a mid-range laptop).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(render): payout floaters and map pins; dev launch config"
```

---

## Spec coverage map

| Spec section | Tasks |
|---|---|
| 2.1 Modes, win/lose | 10 (`checkOutcome`), 16 (end modal, sandbox) |
| 2.2 Starting state, time scale | 2, 10, 11 (`STEP_SECONDS`) |
| 2.3 Construction, prices, expansion, demolish | 3, 5, 14, 16 |
| 2.4 Products and rules | 2, 8 (heavy), 9 (fragile) |
| 2.5 Contracts, penalties, reputation, sizing | 7, 10 |
| 2.6 Operations (trucks, jobs, assignment, overflow) | 6, 8, 9 |
| 2.7 Overrides (RTS layer) | 6 (`reassignTruck`), 7 (`toggleRush`), 9 (`orderForklifts`), 13–14 (input) |
| 2.8 Random events | 10 |
| 2.9 Net worth | 5 |
| 2.10 Onboarding checklist | 11 (`hud.checklist`), 16 |
| 3 Architecture and invariants | 1–11 (sim isolated; renderer read-only) |
| 4 Visuals, camera, controls, HUD | 12–17 |
| 5 Error handling | 3, 5, 6, 8, 9 (Review Focus tests) |
| 6 Testing (unit, golden, perf, manual) | every sim task, 10, 17 |
