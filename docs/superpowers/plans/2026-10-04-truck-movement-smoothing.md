# Truck Movement Smoothing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make trucks drive in long straight lines with wide rounded corners and arrive aligned with the dock axis, instead of zigzagging with 90° turns.

**Architecture:** Turn-penalty A* produces straight-preferring grid paths; a new pure module `truckPath.ts` compresses them to corner points, replaces each 90° corner with a validated circular arc, and appends a straight final approach along the door axis. `trucks.ts` feeds the dense waypoint list into the unchanged `moveAlong`.

**Tech Stack:** TypeScript, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-04-truck-movement-smoothing-design.md`

**Verification commands:** `npm test` (vitest), `npx tsc --noEmit` (typecheck).

---

### Task 1: Turn-penalty A*

**Files:**
- Modify: `src/sim/pathfinding.ts`
- Test: `src/sim/pathfinding.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('findPath', ...)` block in `src/sim/pathfinding.test.ts` (after the last `it(...)`), plus a `Vec2` type import at the top:

```ts
import { findPath } from './pathfinding';
import type { Vec2 } from './world';
```

```ts
  const turns = (start: Vec2, p: Vec2[]) => {
    const pts = [start, ...p];
    let n = 0;
    for (let i = 2; i < pts.length; i++) {
      if (pts[i - 1].x - pts[i - 2].x !== pts[i].x - pts[i - 1].x || pts[i - 1].y - pts[i - 2].y !== pts[i].y - pts[i - 1].y) n++;
    }
    return n;
  };
  it('prefers few turns when turnPenalty is set', () => {
    const p = findPath({ x: 0, y: 0 }, [{ x: 4, y: 4 }], open(5, 5), undefined, 2)!;
    expect(p.at(-1)).toEqual({ x: 4, y: 4 });
    expect(turns({ x: 0, y: 0 }, p)).toBe(1); // all east, then all south
  });
  it('returns null when unreachable with a turn penalty', () => {
    const walk = (x: number, y: number) => open(5, 5)(x, y) && x !== 2;
    expect(findPath({ x: 0, y: 0 }, [{ x: 4, y: 0 }], walk, undefined, 2)).toBeNull();
  });
```

Note: `open` already exists at the top of the file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sim/pathfinding.test.ts`
Expected: FAIL — the "prefers few turns" assertion fails (without the feature, A* returns a staircase path with more than 1 turn; the extra 5th argument is simply ignored at runtime since vitest does not typecheck).

- [ ] **Step 3: Implement the direction-aware search**

In `src/sim/pathfinding.ts`, change `MAX_EXPANDED` from 6000 to 12000:

```ts
const MAX_EXPANDED = 12000;
```

Change the `findPath` signature and add the delegation at the top of the function body (existing body stays exactly as is below the early return):

```ts
export function findPath(start: Vec2, goals: Vec2[], walkable: Walkable, blocked?: Set<string>, turnPenalty = 0): Vec2[] | null {
  if (goals.length === 0) return null;
  if (turnPenalty > 0) return findPathTurns(start, goals, walkable, blocked, turnPenalty);
  const key = (x: number, y: number) => y * STRIDE + x;
```

(The rest of the existing body — from `const goalSet` to the final `return null;` — is unchanged.)

Add the private function at the end of the file:

```ts
/**
 * Direction-aware A*: state is (cell, arrival direction) so a direction
 * change can be charged `turnPenalty`. Used for trucks, which prefer long
 * straights over staircases. The Manhattan heuristic stays admissible for
 * any turnPenalty >= 0 (cost per step is >= 1).
 */
function findPathTurns(start: Vec2, goals: Vec2[], walkable: Walkable, blocked: Set<string> | undefined, turnPenalty: number): Vec2[] | null {
  const key = (x: number, y: number) => y * STRIDE + x;
  const goalSet = new Set(goals.map((g) => key(g.x, g.y)));
  const startK = key(start.x, start.y);
  if (goalSet.has(startK)) return [];
  const h = (x: number, y: number) => {
    let m = Infinity;
    for (const g of goals) m = Math.min(m, Math.abs(g.x - x) + Math.abs(g.y - y));
    return m;
  };
  // State = cellKey * 5 + dir, with dir 0..3 = arrival move (index into STEPS) and 4 = start (no direction).
  const st = (ck: number, dir: number) => ck * 5 + dir;
  const startState = st(startK, 4);
  const open = new MinHeap();
  const gScore = new Map<number, number>([[startState, 0]]);
  const came = new Map<number, number>();
  const closed = new Set<number>();
  open.push(startState, h(start.x, start.y));
  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (++expanded > MAX_EXPANDED) return null;
    const ck = Math.floor(cur / 5);
    if (goalSet.has(ck)) {
      const path: Vec2[] = [];
      let k = cur;
      while (k !== startState) {
        const c = Math.floor(k / 5);
        path.push({ x: c % STRIDE, y: Math.floor(c / STRIDE) });
        k = came.get(k)!;
      }
      return path.reverse();
    }
    const dir = cur % 5;
    const cx = ck % STRIDE;
    const cy = Math.floor(ck / STRIDE);
    const g = gScore.get(cur)!;
    for (let nd = 0; nd < STEPS.length; nd++) {
      const [dx, dy] = STEPS[nd];
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0) continue;
      const nk = key(nx, ny);
      const ns = st(nk, nd);
      if (closed.has(ns)) continue;
      const isGoal = goalSet.has(nk);
      if (!isGoal && (!walkable(nx, ny) || blocked?.has(`${nx},${ny}`))) continue;
      const ng = g + 1 + (dir < 4 && dir !== nd ? turnPenalty : 0);
      if (ng < (gScore.get(ns) ?? Infinity)) {
        gScore.set(ns, ng);
        came.set(ns, cur);
        open.push(ns, ng + h(nx, ny));
      }
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sim/pathfinding.test.ts`
Expected: PASS (all pre-existing tests + 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/sim/pathfinding.ts src/sim/pathfinding.test.ts
git commit -m "feat(sim): turn-penalty A* for straight-preferring truck paths"
```

---

### Task 2: compressPath in new module `truckPath.ts`

**Files:**
- Create: `src/sim/truckPath.ts`
- Create: `src/sim/truckPath.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/sim/truckPath.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compressPath } from './truckPath';

describe('compressPath', () => {
  it('keeps only corner points plus both endpoints', () => {
    const cells = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 2 }];
    expect(compressPath({ x: 0, y: 0 }, cells)).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ]);
  });
  it('returns just the start for an empty path', () => {
    expect(compressPath({ x: 3, y: 3 }, [])).toEqual([{ x: 3, y: 3 }]);
  });
  it('keeps a single-step path as-is', () => {
    expect(compressPath({ x: 0, y: 0 }, [{ x: 1, y: 0 }])).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sim/truckPath.test.ts`
Expected: FAIL — "Cannot find module './truckPath'".

- [ ] **Step 3: Implement compressPath**

Create `src/sim/truckPath.ts`:

```ts
import type { Vec2 } from './world';

/** Collapse a grid path into corner points only: [start, ...corners, end]. */
export function compressPath(start: Vec2, cellPath: Vec2[]): Vec2[] {
  if (cellPath.length === 0) return [start];
  const pts = [start, ...cellPath];
  const out: Vec2[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    // Unit steps: keep b only when the move direction changes there.
    if (b.x - a.x !== c.x - b.x || b.y - a.y !== c.y - b.y) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sim/truckPath.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sim/truckPath.ts src/sim/truckPath.test.ts
git commit -m "feat(sim): compressPath collapses grid runs into corner points"
```

---

### Task 3: Constants for arcs + roundCorners with validated arcs

**Files:**
- Modify: `src/sim/balance.ts`
- Modify: `src/sim/truckPath.ts`
- Modify: `src/sim/truckPath.test.ts`

- [ ] **Step 1: Add the arc constants**

In `src/sim/balance.ts`, directly under `export const TRUCK_SPEED = 1.2;` add:

```ts
export const TRUCK_ARC_RADIUS = 2;
export const TRUCK_ARC_STEP = 0.2;
```

- [ ] **Step 2: Write the failing tests**

Add to the imports in `src/sim/truckPath.test.ts`:

```ts
import { compressPath, roundCorners } from './truckPath';
```

```ts
const open = (w: number, h: number) => (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

describe('roundCorners', () => {
  const L = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }];
  it('rounds a corner in a wide corridor (off-axis samples appear)', () => {
    const out = roundCorners(L, open(10, 10));
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out.at(-1)).toEqual({ x: 5, y: 5 });
    // The arc cuts inside the corner: some waypoint is off both legs.
    expect(out.some((p) => p.x < 4.99 && p.y > 0.01)).toBe(true);
  });
  it('never places a waypoint in a non-walkable cell', () => {
    const walk = (x: number, y: number) => open(10, 10)(x, y) && !(x === 4 && y === 1);
    const out = roundCorners(L, walk);
    for (const p of out) expect(walk(Math.round(p.x), Math.round(p.y))).toBe(true);
    expect(out.some((p) => p.x < 4.99 && p.y > 0.01)).toBe(true); // still rounded, smaller radius
  });
  it('keeps the corner sharp when no arc fits', () => {
    const out = roundCorners(L, () => false);
    expect(out).toEqual(L);
  });
  it('passes through short polylines untouched', () => {
    expect(roundCorners([{ x: 1, y: 1 }, { x: 3, y: 1 }], open(5, 5))).toEqual([{ x: 1, y: 1 }, { x: 3, y: 1 }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sim/truckPath.test.ts`
Expected: FAIL — "roundCorners is not exported".

- [ ] **Step 3: Implement roundCorners**

In `src/sim/truckPath.ts`, add below the existing `import type { Vec2 }` line:

```ts
import { TRUCK_ARC_RADIUS, TRUCK_ARC_STEP } from './balance';

const ARC_RADII = [TRUCK_ARC_RADIUS, TRUCK_ARC_RADIUS / 2, TRUCK_ARC_RADIUS / 4];

const dirOf = (a: Vec2, b: Vec2): Vec2 => ({ x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) });
```

Add the two functions at the end of the file:

```ts
/**
 * Waypoints of the arc replacing the corner `corner` (between straights
 * prev→corner and corner→next), or null when no radius fits. An arc is
 * tangent to both straights at distance r from the corner, centred on
 * corner + (d2 - d1) * r. Validity: every sample's centreline cell must be
 * walkable (truck half-width ~0.53 ≈ half a cell, and straight legs are
 * never laterally validated, so centerline-only keeps arcs and straights
 * consistent).
 */
function cornerArc(prev: Vec2, corner: Vec2, next: Vec2, walkable: (x: number, y: number) => boolean): Vec2[] | null {
  const d1 = dirOf(prev, corner);
  const d2 = dirOf(corner, next);
  // Only exact 90° turns are rounded (not collinear, not U-turns).
  if ((d1.x !== 0 && d2.x !== 0) || (d1.y !== 0 && d2.y !== 0) || (d1.x === -d2.x && d1.y === -d2.y)) return null;
  const prevLen = Math.hypot(corner.x - prev.x, corner.y - prev.y);
  const nextLen = Math.hypot(next.x - corner.x, next.y - corner.y);
  for (const r0 of ARC_RADII) {
    const r = Math.min(r0, prevLen / 2, nextLen / 2);
    if (r < 0.25) continue;
    const o = { x: corner.x + (d2.x - d1.x) * r, y: corner.y + (d2.y - d1.y) * r };
    const a1 = Math.atan2(-d1.y * r - (d2.y - d1.y) * r, -d1.x * r - (d2.x - d1.x) * r); // angle of t1 around o
    let da = Math.atan2(d1.y * r, d1.x * r) - a1; // angle of t2 around o minus a1
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    const n = Math.max(2, Math.ceil((Math.abs(da) * r) / TRUCK_ARC_STEP));
    const samples: Vec2[] = [];
    let ok = true;
    for (let i = 0; i <= n && ok; i++) {
      const a = a1 + (da * i) / n;
      const p = { x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r };
      if (!walkable(Math.round(p.x), Math.round(p.y))) ok = false;
      else samples.push(p);
    }
    if (ok) return samples;
  }
  return null;
}

/** Replace each 90° corner with a validated arc; dedupe consecutive points. */
export function roundCorners(points: Vec2[], walkable: (x: number, y: number) => boolean): Vec2[] {
  if (points.length < 3) return points;
  const out: Vec2[] = [points[0]];
  const push = (p: Vec2) => {
    const l = out[out.length - 1];
    if (Math.abs(p.x - l.x) > 1e-9 || Math.abs(p.y - l.y) > 1e-9) out.push(p);
  };
  for (let i = 1; i < points.length - 1; i++) {
    const arc = cornerArc(points[i - 1], points[i], points[i + 1], walkable);
    if (arc) for (const p of arc) push(p);
    else push(points[i]);
  }
  push(points[points.length - 1]);
  return out;
}
```

Geometry check for `a1`/`da` (r=1 corner at (5,0), d1=E=(1,0), d2=S=(0,1)): o = (4,1). t1 = (4,0), t2 = (5,1).
- `a1 = atan2(-d1.y*r - (d2.y-d1.y)*r, -d1.x*r - (d2.x-d1.x)*r)` = `atan2(0 - 1, -1 - (-1))` = `atan2(-1, 0)` = −π/2 → direction of t1−o = (0,−1) ✓.
- `da = atan2(d1.y, d1.x) − a1` = `atan2(0, 1) − (−π/2)` = 0 + π/2 = π/2 ✓ (t2−o = (1,0), angle 0; 0 − (−π/2) = π/2).
- Sweep from −π/2 to 0 passes −π/4 → (4+cos(−π/4), 1+sin(−π/4)) = (4.71, 0.29) — inside the turn ✓.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sim/truckPath.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sim/truckPath.ts src/sim/truckPath.test.ts
git commit -m "feat(sim): roundCorners replaces 90° corners with validated arcs"
```

---

### Task 4: Door-approach constants + buildTruckPath

**Files:**
- Modify: `src/sim/balance.ts`
- Modify: `src/sim/truckPath.ts`
- Modify: `src/sim/truckPath.test.ts`

- [ ] **Step 1: Add the constants**

In `src/sim/balance.ts`, directly under `export const TRUCK_SPEED = 1.2;` add:

```ts
export const TRUCK_TURN_PENALTY = 2;
export const TRUCK_APPROACH_DIST = 2;
```

- [ ] **Step 2: Write the failing tests**

Add to the imports in `src/sim/truckPath.test.ts`:

```ts
import { buildTruckPath, compressPath, roundCorners } from './truckPath';
```

```ts
describe('buildTruckPath', () => {
  it('ends exactly at the tail, approached along a straight axis', () => {
    const start = { x: 0, y: 0 };
    const cells = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }];
    const tail = { x: 2, y: 5 };
    const out = buildTruckPath(start, cells, open(10, 10), tail);
    expect(out.at(-1)).toEqual(tail);
    expect(out.at(-2)!.x).toBe(2); // second-to-last waypoint on the axis x=2
    expect(out.length).toBeGreaterThan(2);
  });
  it('returns start only for an empty path with no tail', () => {
    expect(buildTruckPath({ x: 1, y: 1 }, [], open(3, 3))).toEqual([{ x: 1, y: 1 }]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/sim/truckPath.test.ts`
Expected: FAIL — "buildTruckPath is not exported".

- [ ] **Step 4: Implement buildTruckPath**

In `src/sim/truckPath.ts`, add at the end:

```ts
/** Grid path → dense drivable waypoints: compress, append `tail`, round corners. */
export function buildTruckPath(start: Vec2, cellPath: Vec2[], walkable: (x: number, y: number) => boolean, tail?: Vec2): Vec2[] {
  const pts = compressPath(start, cellPath);
  if (tail) pts.push(tail);
  return roundCorners(pts, walkable);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/sim/truckPath.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add src/sim/balance.ts src/sim/truckPath.ts src/sim/truckPath.test.ts
git commit -m "feat(sim): buildTruckPath composes compress+tail+round for trucks"
```

---

### Task 5: Wire trucks.ts to the smoothed pipeline

**Files:**
- Modify: `src/sim/trucks.ts`

- [ ] **Step 1: Update the imports**

In `src/sim/trucks.ts`, change the balance import (line 1) to:

```ts
import { DOCK_MIN, DOCK_OFFSET, LOT_H, LOT_W, TRUCK_APPROACH_DIST, TRUCK_SPEED, TRUCK_STAGE_DIST, TRUCK_TURN_PENALTY } from './balance';
```

Add below the pathfinding import (line 5):

```ts
import { buildTruckPath } from './truckPath';
```

- [ ] **Step 2: Add planToDoor and use it in tryAssignDoor**

Add after the `truckWalk` definition (line 21):

```ts
/** A* to a point on the door axis, then a straight final leg to the stage point so the truck arrives aligned. */
function planToDoor(w: World, t: Truck, door: Door): Vec2[] | null {
  const from = cellOf(t.pos);
  const walk = truckWalk(w);
  const stage = stagePoint(door);
  const axis = DIRS[door.facing];
  const approach = { x: stage.x + axis.x * TRUCK_APPROACH_DIST, y: stage.y + axis.y * TRUCK_APPROACH_DIST };
  const cells = findPath(from, [approach], walk, undefined, TRUCK_TURN_PENALTY);
  if (cells) return buildTruckPath(from, cells, walk, stage);
  const direct = findPath(from, [stage], walk, undefined, TRUCK_TURN_PENALTY);
  return direct ? buildTruckPath(from, direct, walk) : null;
}
```

In `tryAssignDoor`, replace:

```ts
  for (const door of candidates) {
    const path = findPath(cellOf(t.pos), [stagePoint(door)], truckWalk(w));
    if (!path) continue;
```

with:

```ts
  for (const door of candidates) {
    const path = planToDoor(w, t, door);
    if (!path) continue;
```

- [ ] **Step 3: Use the pipeline in startDeparture**

Replace in `startDeparture`:

```ts
  t.state = 'departing';
  t.doorId = null;
  t.path = findPath(cellOf(t.pos), [ROAD_EXIT], truckWalk(w)) ?? [];
```

with:

```ts
  t.state = 'departing';
  t.doorId = null;
  const from = cellOf(t.pos);
  const walk = truckWalk(w);
  const cells = findPath(from, [ROAD_EXIT], walk, undefined, TRUCK_TURN_PENALTY);
  t.path = cells ? buildTruckPath(from, cells, walk) : [];
```

- [ ] **Step 4: Run the sim test suites**

Run: `npx vitest run src/sim`
Expected: PASS — in particular `trucks.test.ts` (docked position (14, 15.6) unchanged: the final waypoint is still exactly the stage point), `golden.test.ts` (determinism), `jam.debug.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/sim/trucks.ts
git commit -m "feat(sim): trucks drive smoothed paths with dock-aligned approach"
```

---

### Task 6: Full verification and visual check

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (success).

- [ ] **Step 2: Run the whole test suite**

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 3: Visual check in the browser**

Run: `npm run dev`, open the printed local URL, start the sandbox scenario, and watch arriving/departing trucks.

Expected: trucks drive long straight runs, sweep wide arcs around corners, and back up to doors already parallel to the door axis. No truck drives through a building. If a truck clips a building corner on an arc, that is a bug in the arc validation — re-check `cornerArc` sample cells against the lot.

- [ ] **Step 4: Commit (only if anything was touched during verification)**

```bash
git status   # should be clean; commit fixes if the visual check found any
```

---

## Self-review notes

- Spec coverage: turn-penalty A* (Task 1), compress (Task 2), arcs + validation (Task 3), constants + tail/approach composition (Task 4), dock-aligned approach + departure + unchanged moveAlong (Task 5), fallbacks: planToDoor falls back to direct stage path (Task 5 Step 2), sharp-corner fallback (Task 3), A*-failure → queued+alert untouched (existing code path). Testing matrix of the spec covered by Tasks 1–4 tests + regression via Task 5 Step 4 and Task 6.
- Types: `buildTruckPath(start, cellPath, walkable, tail?)` used identically in Tasks 4 and 5. `turnPenalty` is the 5th parameter of `findPath` everywhere.
- `t.path` consumers verified: only `moveAlong`, `tryAssignDoor`, `startDeparture`, `reassignTruck`, and the driving-state reset in `updateTrucks` (all in `src/sim/trucks.ts`).
