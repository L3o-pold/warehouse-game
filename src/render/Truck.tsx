import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { loop } from '../game/loop';
import { useGame } from '../game/store';
import { entityHandlers } from '../input/selection';
import { interp, lerpAngle } from './anim';
import { TruckModel } from './models';
import { SelectionRing } from './SelectionRing';

export function Truck({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null!);
  const heading = useRef<number | null>(null);
  const selected = useGame((s) => s.selection?.kind === 'truck' && s.selection.id === id);
  const client = useGame.getState().world?.trucks[id]?.client;
  useFrame((_, dt) => {
    const t = useGame.getState().world?.trucks[id];
    if (!t || !group.current) return;
    const p = interp(t.prev, t.pos, loop.alpha);
    heading.current = heading.current === null ? t.heading : lerpAngle(heading.current, t.heading, 1 - Math.exp(-dt * 8));
    group.current.position.set(p.x, 0, p.y);
    group.current.rotation.y = -heading.current;
    group.current.visible = t.state !== 'scheduled';
  });
  if (!client) return null;
  return (
    <group ref={group} visible={false} {...entityHandlers({ kind: 'truck', id })}>
      <TruckModel client={client} />
      {selected && (
        <group position={[2.3, 0, 0]}>
          <SelectionRing radius={2.7} />
        </group>
      )}
    </group>
  );
}
