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
