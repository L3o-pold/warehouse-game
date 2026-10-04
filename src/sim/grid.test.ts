import { describe, expect, it } from 'vitest';
import {
  safeToBlock,
  isTruckWalkable,
  F_DOCK,
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

describe('safeToBlock', () => {
  it('agrees with isConnected for every free interior cell', () => {
    const w = built();
    addDoor(w, 'd1', 14, 15);
    addDoor(w, 'd2', 20, 15, 'out');
    for (const [id, x, y] of [['a', 12, 8], ['b', 16, 10], ['c', 19, 12], ['d', 13, 12]] as const) {
      w.racks[id] = { id, cells: [{ x, y }, { x: x + 1, y }], slots: [null, null, null, null] };
    }
    w.racks.v = { id: 'v', cells: [{ x: 17, y: 7 }, { x: 17, y: 8 }], slots: [null, null, null, null] };
    rebuildGrid(w);
    const safe = safeToBlock(w);
    for (let y = 7; y <= 14; y++) {
      for (let x = 11; x <= 22; x++) {
        if (!isForkliftWalkable(w, x, y)) continue;
        expect([x, y, safe.has(`${x},${y}`)]).toEqual([x, y, isConnected(w, [{ x, y }])]);
      }
    }
  });
});

describe('loading docks', () => {
  it('lays a 3-wide, 2-deep dock in front of each door that forklifts use and trucks avoid', () => {
    const w = built();
    addDoor(w, 'd1', 14, 15);
    for (const y of [16, 17]) {
      for (const x of [13, 14, 15]) {
        expect(flagsAt(w, x, y) & F_DOCK).toBeTruthy();
        expect(isForkliftWalkable(w, x, y)).toBe(true);
        expect(isTruckWalkable(w, x, y)).toBe(false);
      }
    }
    expect(flagsAt(w, 14, 18) & F_DOCK).toBeFalsy();
    expect(isTruckWalkable(w, 14, 18)).toBe(true);
  });
  it('needs the dock plus 8 cells of yard in front of a door', () => {
    const w = built({ x: 10, y: 10, w: 14, h: 10 });
    // South wall at y=19: dock 20-21, apron 22-29 fits exactly; one row higher does not.
    expect(validateDoor(w, { x: 14, y: 19 }).ok).toBe(true);
    const tight = built({ x: 10, y: 11, w: 14, h: 10 });
    expect(validateDoor(tight, { x: 14, y: 20 })).toEqual({ ok: false, reason: 'Needs 10 clear cells outside (dock + truck bay)' });
  });
  it('rejects an expansion that covers a dock', () => {
    const w = built();
    addDoor(w, 'd1', 20, 15);
    expect(validateFootprint(w, { x: 21, y: 16, w: 4, h: 4 })).toEqual({ ok: false, reason: 'Blocks a loading dock' });
  });
});
