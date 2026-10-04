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
