import { describe, expect, it } from 'vitest';
import { createWorld } from '../sim/world';
import { readyWorld } from '../sim/testUtils';
import { previewTool, rectFrom, snapCell, toolCommand } from './buildMode';

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
    expect(previewTool(w, { kind: 'door', doorKind: 'in' }, { x: 16, y: 10 }, null)).toMatchObject({ ok: false, label: 'Doors go on a finished warehouse wall' });
  });
  it('snaps the door tool to the nearest valid wall cell', () => {
    const w = readyWorld();
    // (17,16) is just outside the south wall; (17,14) just inside.
    expect(snapCell(w, { kind: 'door', doorKind: 'in' }, { x: 17, y: 16 })).toEqual({ x: 17, y: 15 });
    expect(snapCell(w, { kind: 'door', doorKind: 'in' }, { x: 17, y: 14 })).toEqual({ x: 17, y: 15 });
    expect(snapCell(w, { kind: 'rack', orient: 'h' }, { x: 17, y: 16 })).toEqual({ x: 17, y: 16 });
    expect(snapCell(w, { kind: 'door', doorKind: 'in' }, { x: 2, y: 2 })).toEqual({ x: 2, y: 2 });
  });
  it('maps tools to commands', () => {
    expect(toolCommand({ kind: 'door', doorKind: 'out' }, { x: 1, y: 2 })).toEqual({ type: 'placeDoor', cell: { x: 1, y: 2 }, kind: 'out' });
    expect(toolCommand({ kind: 'demolish' }, { x: 1, y: 2 })).toEqual({ type: 'demolish', cell: { x: 1, y: 2 } });
    expect(toolCommand({ kind: 'footprint' }, { x: 1, y: 2 })).toBeNull();
  });
});
