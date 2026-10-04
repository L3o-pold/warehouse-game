# Truck movement smoothing — design

Date: 2026-10-04
Status: approved (pending implementation)

## Problem

Trucks follow grid-cell A* paths with 4-directional movement. `moveAlong`
(src/sim/trucks.ts) advances the truck cell by cell and snaps the heading 90°
at every corner. The renderer smooths rotation (`lerpAngle`) but not the
trajectory, so trucks visibly drive in right-angle staircases, which looks
unrealistic for a road vehicle.

## Goals

- Trucks drive in long straight lines with wide, rounded 90° corners.
- Trucks arrive at the stage point aligned with the door axis (no visual snap
  when docking starts).
- The simulation stays grid-based and deterministic; forklift movement is
  untouched.
- Existing gameplay logic (door reservation, docking, queueing, departure) is
  unchanged.

## Non-goals

- No physics model (turning radius dynamics, acceleration, reversing).
- No changes to forklift pathing (forklifts can pivot; right angles fit them).
- No lane graph or road network refactor.

## Approach (chosen: post-A* smoothing)

Rejected alternatives: pure-pursuit steering (trajectory no longer guaranteed
inside walkable cells), lane graph (large refactor, breaks free door
placement).

### 1. Turn-penalty A* (`src/sim/pathfinding.ts`)

- `findPath` gains an optional `turnPenalty` parameter (default 0, so forklift
  callers are unaffected). Search state becomes (cell, arrival direction).
- Step cost: 1 per move + `turnPenalty` when the move direction differs from
  the previous one. Manhattan heuristic stays admissible for any
  `turnPenalty >= 0`.
- `MAX_EXPANDED` raised 6000 → 12000 (state space is cells × 4 directions).
- Tie-breaking: the penalty itself makes straight runs cheaper.

### 2. New pure module `src/sim/truckPath.ts`

- `compressPath(start, cellPath): Vec2[]` — merges collinear runs, keeping
  only corner points plus both endpoints.
- `roundCorners(points, walkable): Vec2[]` — replaces each 90° corner with a
  circular arc, trying radii from largest to smallest, starting at
  `TRUCK_ARC_RADIUS` and halving (2 → 1 → 0.5 cells).
  Each arc is sampled (~every 0.2 cells); a sample is valid only if the cell
  at the sample point is truck-walkable (centerline check only). Rationale:
  the truck body is ~1.05 cells wide (half-width 0.53 ≈ half a cell), and
  straight segments are never laterally validated today — trucks already
  overhang cell borders on roads. Requiring extra clearance on arcs only
  would reject arcs near buildings while keeping identical straights.
  If no radius fits, the corner is kept sharp (current behaviour). Output is
  a dense list of fractional waypoints that `moveAlong` consumes unchanged.
- Dock alignment helper: given a door, returns an approach point
  `stagePoint + doorAxis × 2` and appends the straight final segment
  `approach → stagePoint`, so the last leg always runs along the door axis.
  The 8-cell door apron (DOOR_APRON) guarantees the approach cell is clear.

### 3. Call sites (`src/sim/trucks.ts`)

- `tryAssignDoor`: A* goal becomes the approach point on the door axis; the
  smoothed path ends exactly at `stagePoint`. Door assignment, reservation
  and fallback logic unchanged.
- `startDeparture`: same pipeline toward `ROAD_EXIT`, no alignment
  constraint.
- `moveAlong`: unchanged — it already handles arbitrary waypoints; with short
  segments the heading updates continuously and the renderer's `lerpAngle`
  smooths the rest.
- `t.path` changes representation (fractional waypoints instead of cells). It
  is read nowhere else (verified: only `moveAlong` and resets in
  `reassignTruck`/state transitions).

### 4. Constants (`src/sim/balance.ts`)

- `TRUCK_TURN_PENALTY = 2` (cost in cells of one 90° turn).
- `TRUCK_ARC_RADIUS = 2` (max radius; fallbacks 1 then 0.5).
- `TRUCK_APPROACH_DIST = 2` (cells out on the door axis where A* aims).
- Arc sample step ~0.2; arc validity = centerline cell walkable.

## Data flow

```
tryAssignDoor / startDeparture
  → findPath(turnPenalty)        grid-cell path (simulation-safe)
  → compressPath → roundCorners  (+ door alignment for docking approach)
  → t.path = dense waypoints
driving → moveAlong (unchanged) → arrival at stagePoint → docking (unchanged)
```

Smoothing runs once per assignment/departure, never per tick.

## Error handling and fallbacks

- A* fails → unchanged behaviour: truck stays queued, alert pushed.
- If the approach point on the door axis is unreachable but the stage point
  is, fall back to planning directly to the stage point (sharp arrival).
- Arc invalid → smaller radius, then sharp corner; a waypoint can never land
  in a non-walkable cell.
- Queued trucks are teleported into the queue row as today; leaving the queue
  re-plans from `cellOf(pos)`.

## Accepted side effects

- Shorter trajectories (staircases collapse into straight lines, corners are
  cut) make trucks arrive slightly earlier. No test depends on that timing.
- Docked position, docking interpolation and door occupancy are untouched, so
  `trucks.test.ts` position assertions still hold.

## Testing

New `src/sim/truckPath.test.ts`:

1. Compression: a staircase of cells collapses to one straight segment.
2. Turn-penalty A*: prefers a long straight over an equal-length staircase.
3. Arcs: wide corridor → corner is rounded; diagonal obstacle at the corner →
   smaller radius or sharp corner; no waypoint ever in a non-walkable cell.
4. Door alignment: final segment is parallel to the door axis and ends at the
   stage point.

Regression: `trucks.test.ts`, `pathfinding.test.ts`, `golden.test.ts`
(including determinism) stay green.
