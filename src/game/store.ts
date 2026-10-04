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
