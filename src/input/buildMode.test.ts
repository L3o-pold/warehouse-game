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
