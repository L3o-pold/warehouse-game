import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { loop } from '../game/loop';
import { useGame } from '../game/store';
import { entityHandlers } from '../input/selection';
import { handlingTarget } from '../sim/forklifts';
import { F_DOCK, flagsAt } from '../sim/grid';
import type { Forklift as ForkliftT, World } from '../sim/world';
import { interp, lerpAngle, renderState } from './anim';
import { ForkliftModel } from './models';
import { C, DOCK_H } from './palette';
import { Label } from './models';
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
    // Drive up onto the loading dock when on a dock cell.
    const onDock = flagsAt(w, Math.round(p.x), Math.round(p.y)) & F_DOCK;
    rs.y += ((onDock ? DOCK_H : 0) - rs.y) * (1 - Math.exp(-dt * 12));
    group.current.position.set(p.x, rs.y, p.y);
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
          <Label fontSize={0.9} color={C.bad} outlineWidth={0.06} outlineColor="#ffffff">
            !
          </Label>
        </Billboard>
      </group>
    </group>
  );
}
