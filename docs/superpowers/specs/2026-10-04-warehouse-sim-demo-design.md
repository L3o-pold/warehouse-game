# WareTrack Tycoon — Warehouse Sim Demo (v1) Design

**Date:** 2026-10-04
**Status:** Approved in brainstorming, pending spec review

## 1. Vision & context

A browser strategy/tycoon game about building a warehouse empire, inspired by Age of Empires, Total War (layered map ↔ battle), Big Ambitions, Transport Fever and Euro Truck Simulator. The visual target is the clean, bright, isometric low-poly style of the WareTrack reference screenshots (blue/white palette, glassy HUD panels).

The full game is layered: a **regional empire map** (buy lots, build sites, network of trucks) and a **site view** where you build and run a single warehouse hands-on. It is decomposed into sub-projects:

1. **Warehouse sim (this spec)**: one site, construction, operations, light contracts & economy.
2. Economy & contracts depth (market, upgrades, reputation tiers).
3. Regional empire map (multiple sites, drill-down into layer 1).
4. Meta & polish (save/load, tutorial/campaign, events, audio).

This spec covers **sub-project 1 only**, a playable, fun demo.

### Success criteria
- A new player can, without instructions beyond the in-game checklist, build a warehouse, accept a contract and see trucks unloaded by forklifts within ~3 minutes.
- The "First Lot" scenario is winnable in ~15–20 real minutes at mixed speeds, and losable through poor decisions.
- Steady 60 fps on a mid-range laptop with ~10 forklifts, ~6 trucks and ~300 pallets on screen.
- The sim core is fully unit-testable in Node with deterministic results.

## 2. Gameplay

### 2.1 Modes
- **Scenario "First Lot":** win with **net worth ≥ $250,000 and reputation ≥ 4★ by end of Day 7**. You lose if cash stays below **–$20,000 for 24 consecutive in-game hours**.
- **Sandbox:** same start, no win/lose checks.

### 2.2 Starting state
- Empty **40×30 cell** lot (1 cell = 1 m) beside a road along the south edge; the yard is the open lot area.
- **$60,000** cash, **1 forklift** (parked at the lot entrance; it becomes usable once a building exists), reputation **3★**.
- Clock starts on **Day 1 at 06:00**. **1 real second = 10 in-game minutes at 1×** (one in-game day ≈ 2.4 real minutes, 7 days ≈ 17 real minutes at 1×). Speeds are 1×, 2× and 4×, plus pause.
- **Movement tuning** (in-game units): forklift drives 0.3 cells/min (≈ 3 cells per real second at 1×), handling 1 min per pallet; trucks move 2 cells/min in the yard and take 5 min to dock.
- The contract board starts with 3 offers.

### 2.3 Construction
| Item | Rule | Cost |
|---|---|---|
| Building footprint | Drag a rectangle; min 8×6, max 36×24; must not overlap; built over 2 in-game hours (scaffolding). One building in v1; can be **expanded** by dragging an adjacent rectangle that shares a full wall segment. | $250 per cell |
| Dock door | Placed on a building wall cell that faces open yard with ≥ 8 free cells outward (truck apron). Each door is set to **Inbound** or **Outbound** (toggle later for $500). | $6,000 |
| Rack | 1×2 cells inside a building; 2 levels × 2 positions = 4 pallet slots; level 0 = ground. Must keep a walkable path between all doors and racks. | $1,500 |
| Staging zone | Painted 1×1 cells inside the building next to doors; holds 1 pallet per cell, no cost per pallet. | $100 per cell |
| Forklift | Spawns at the nearest door inside. | $8,000 + $300/day wages |
| Forklift upgrade "Fast mast" | +30% lift speed, +15% drive speed for one forklift. | $5,000 |
| Demolish | Refunds 50%. You can't demolish something that holds pallets, or a door with a truck docked. | n/a |

Daily running cost: **$15 per building cell per day**, charged at midnight together with wages.

### 2.4 Products
| Product | Value per pallet | Rule |
|---|---|---|
| Cardboard Boxes | $400 | none |
| Spring Water 24-pack | $350 | **Heavy**: rack level 0 only |
| LED Panel 60×60 | $2,200 | **Fragile**: handling time ×1.5 |
| Safety Helmets | $900 | none |
| Packing Tape | $300 | none |
| Frozen Goods | n/a | **Locked in v1** (shown greyed out, "Cold zone: coming later") |

### 2.5 Contracts
Generated daily at 06:00 by a seeded RNG: 3–5 offers, each expiring if not accepted within 12 in-game hours. Clients: WareTrack, Nordline, Cargoviva, Bluepeak.

- **Inbound storage:** N pallets of a product arrive on truck(s) at time T. You store them for D days and earn **rent per pallet per day** (paid at midnight) plus a receiving fee. At the end of D days an outbound truck collects them.
- **Outbound:** ship N pallets of a product that's already stored (from your own storage contracts, which pay a transfer fee) by a deadline. Payout on departure.
- **Cross-dock:** N pallets in at an inbound door, out on an outbound truck within a window of 3–4 in-game hours. High payout, tight timing.

Each contract has a payout, a deadline and a **late penalty of 10% of the payout per started late hour, capped at 100%**.
- **On time:** reputation +0.1★.
- **Late:** reputation –0.2★.
- **Failed or cancelled:** reputation –0.5★ plus a fixed $2,000 fee.

Reputation is clamped to 0–5★. Higher reputation unlocks bigger offers: contract size scales with reputation.

Contract sizing ramps over the 7 days: Day 1 offers are 6–12 pallets; Day 7 offers are 30–60 pallets.

### 2.6 Operations (automatic)
- **Trucks** spawn on the road at their scheduled time, drive to a free door of the right type, and reverse onto the apron. If no door is free they queue in the yard. They leave when they're full or empty.
- **Jobs** are generated by the sim:
  - `UNLOAD`: truck to staging
  - `PUTAWAY`: staging to rack slot
  - `PICK`: rack to staging
  - `LOAD`: staging to truck
  - `CROSSDOCK`: inbound truck or staging straight to an outbound truck or staging

  Each job carries a priority: Rush contracts first, then earliest deadline.
- **Assignment:** an idle forklift takes the highest-priority job, using the nearest job as a tie-breaker. Slot choice respects product rules and prefers the free slot nearest the door.
- **Overflow:** when staging is full, pallets go to the nearest free walkable floor cell, which blocks it until cleared. When no space is left at all, the truck waits and contract clocks keep running. An alert is raised.

### 2.7 Overrides (RTS layer)
- Select forklifts by click or box-drag, then right-click:
  - **On a truck:** force unload or load.
  - **On a pallet:** move it (then pick a destination cell or slot).
  - **On an empty cell:** move there.
- Select a waiting truck, then pick a door: reassign the door.
- Contract board: toggle **Rush** on an accepted contract.
- A manual order cancels the forklift's current job: the job is re-queued, and a carried pallet is dropped at the nearest valid cell. Manually assigned jobs are locked against auto-reassignment.

### 2.8 Random events (light)
Seeded and roughly once every 6 in-game hours.
- A truck arrives 30–60 minutes early.
- A forklift breaks down for 2 hours; $500 fixes it instantly.
- A rush order lands: a cross-dock offer that expires in 3 hours if not accepted and pays ×2.

### 2.9 Net worth
Cash + 50% of build value of all structures + 50% of forklift purchase prices. Stored client goods are not counted.

### 2.10 Onboarding
A checklist panel:
1. Build a warehouse of at least 12×8.
2. Add an inbound door.
3. Place 4 racks.
4. Accept a contract.
5. Add an outbound door.
6. Complete your first contract.

The panel can be dismissed.

## 3. Architecture

**Stack:** Vite, React 18+, TypeScript (strict), `@react-three/fiber`, `@react-three/drei`, `three`, Zustand, Tailwind CSS, Vitest.

### 3.1 Module layout
```
src/
  sim/            pure TS: no React, no three.js imports
    world.ts        World type & factory
    tick.ts         step(world, dtMinutes): fixed order: commands → clock → events → contracts → trucks → jobs → forklifts → economy → win/lose
    commands.ts     Command union, applyCommand(world, cmd): Result
    grid.ts         occupancy, walkability, footprint/door/rack validation
    pathfinding.ts  A* on 4-connected grid, path cache invalidated on grid change, cell reservations
    jobs.ts         job generation & assignment
    trucks.ts       schedule, door queue, docking states
    contracts.ts    offer generation, acceptance, progress, deadline evaluation
    economy.ts      costs, wages, rent, penalties, reputation, net worth
    events.ts       random events
    scenarios.ts    setup + win/lose
    rng.ts          seeded PRNG (mulberry32)
    products.ts     product table
  game/
    GameLoop.ts     rAF + accumulator; fixed sim step of 1 in-game minute; speed multiplier; pause
    store.ts        Zustand: world ref, dispatch(cmd), throttled HUD snapshot (~5 Hz), selection, build tool
  render/         R3F; reads world in useFrame; never mutates
    Scene, CameraRig, Ground, Road, Building, DockDoor, Rack, PalletInstances,
    Forklift, Truck, BuildGhost, SelectionRing, FloatingText, MapPin
    models/         procedural part builders + palette.ts
  ui/             DOM overlay, Tailwind
    TopBar, KpiCards, Inspector, BuildToolbar, ContractBoard, OpsPanel,
    ShipmentTimeline, Toasts, Checklist, ScenarioEndModal, MainMenu
  input/
    selection.ts, buildMode.ts, hotkeys.ts
```

### 3.2 Data flow
1. **Commands in.** UI and 3D input create `Command`s and call `store.dispatch`, which queues them in `world.pendingCommands`.
2. **The sim advances.** `GameLoop` calls `step(world, 1)` repeatedly, according to elapsed time × speed. Each step applies queued commands first. Rejected commands produce `world.events` entries, which become toasts.
3. **Rendering.** Components hold refs to sim entities by id. In `useFrame` they read the current and previous positions and interpolate by the loop's alpha. Instanced pallets update their matrices from `world.pallets`.
4. **The HUD.** The store publishes `HudSnapshot` (cash, clock, reputation, KPIs, selected entity view, contract list, alerts) at about 5 Hz. HUD components subscribe with selectors.

### 3.3 Invariants
- `sim/` has no imports from React, three.js or the DOM.
- The renderer and UI never mutate `world`; all changes go through commands.
- All randomness comes from `world.rng`, so the same seed and command log always give the same state.
- Entity ids are stable strings with prefixes: `fl-1`, `trk-2481`, `ctr-12`, `plt-305`.

## 4. Visuals, camera and controls

- **Style:** procedural low-poly built from primitives (RoundedBox, Box, Cylinder), shared materials, and `palette.ts`:
  - **Blue:** `#2563EB` for roofs, cabs and door frames.
  - **Off-white:** `#F1F5F9` for walls.
  - **Cardboard:** `#D9A066` for pallets.
  - **Yellow:** `#FACC15` for forklifts.
  - **Ground:** blue-grey `#E2E8F0`, with white lane markings and yellow `#F5B83D` bay outlines.
- **Lighting:** directional light with soft shadows, plus hemisphere and ambient light, plus contact shadows. Light bloom on selection.
- **Buildings** are generated from the footprint. The roof can be cut away with the R key or when zoomed in, so the interior is visible.
- **Feel:** trucks reverse into docks, forks animate, pallets scale-pop into place, floating "+$X" text on payouts, and hovering map pins on alerts.
- **Camera:** iso angle with 90° orbit steps on Q/E. Pan with WASD, edge-scroll or right-drag (only when nothing is selected; with forklifts selected, right-click is a command and panning uses middle-drag or WASD). Clamped wheel zoom. Home resets the view.
- **Hotkeys:** Space pauses, 1/2/3 set speed, B opens build, C opens contracts, Esc cancels or deselects.
- **HUD layout** follows the reference screenshots:
  - **Top bar:** logo, site, cash, stars, clock and speed, alerts.
  - **KPI cards:** stock on hand, trucks on site, on-time %.
  - **Right:** inspector.
  - **Bottom right:** ops tabs (Docks, Forklifts, Trucks).
  - **Bottom left:** shipment timeline.
  - **Contract board:** slide-in drawer.
  - **Build toolbar:** bottom centre in build mode.
- A **main menu** offers New Scenario, Sandbox and a seed field.

## 5. Error handling and edge cases
- `applyCommand` validates everything (placement, path connectivity, funds, entity state) and returns `{ok:false, reason}`, which appears as a toast. The UI ghost preview uses the same validators, so it shows green or red accurately.
- Path connectivity is checked on every rack or zone placement. A placement that would disconnect any door from any rack slot is rejected.
- **Forklift blocking:** a forklift waits up to 3 in-game minutes, then re-plans. If there's still no path, its job goes back to the queue and the forklift shows a ⚠ marker.
- Demolishing anything that's occupied is rejected.
- The win/lose check pauses the game and opens the end modal, with options to retry the same seed or continue in sandbox.

## 6. Testing
- **Unit tests (Vitest)** covering:
  - grid validation
  - A* (including blocked and no-path cases)
  - job priority and assignment
  - slot selection with product rules
  - contract payout, penalty and reputation maths
  - midnight economy
  - net worth
  - win/lose
- **Golden scenario tests:** a fixed seed plus a scripted command log, run headless for N in-game hours. They assert cash, completed contracts and reputation within exact values, which works because the sim is deterministic.
- **Performance check:** a headless sim of 7 in-game days must run in under 2 s in Node.
- **Manual checks:** browser QA against the success criteria; the app boots without console errors.

## 7. Out of scope (v1)
Empire map, multiple sites or buildings, save/load, audio, a full tutorial, the cold zone and Frozen Goods, staff beyond forklift wages, a loans market, multiplayer, mobile layout.
