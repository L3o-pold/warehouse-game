import { Billboard, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { useGame } from '../game/store';
import { entityHandlers } from '../input/selection';
import { dirAngle } from '../sim/world';
import { Block, Label } from './models';
import { C, mat } from './palette';
import { SelectionRing } from './SelectionRing';

export function DockDoor({ id }: { id: string }) {
  const meta = useGame((s) => {
    const d = s.hud?.docks.find((x) => x.id === id);
    return d ? `${d.label}|${d.kind}` : '';
  });
  const low = useGame((s) => s.roofCut || s.tool !== null);
  const selected = useGame((s) => s.selection?.kind === 'door' && s.selection.id === id);
  const shutter = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const w = useGame.getState().world;
    const d = w?.doors[id];
    if (!w || !d || !shutter.current) return;
    const t = d.truckId ? w.trucks[d.truckId] : undefined;
    const open = t?.state === 'docked' || t?.state === 'docking';
    const target = open ? 2.25 : 1.1;
    shutter.current.position.y += (target - shutter.current.position.y) * 0.12;
  });
  const door = useGame.getState().world?.doors[id];
  if (!door || !meta) return null;
  const [label, kind] = meta.split('|');
  const h = low ? 0.9 : 3;
  const apron: [number, number, number][] = [
    [1, 0.02, -0.7],
    [8.5, 0.02, -0.7],
    [8.5, 0.02, 0.7],
    [1, 0.02, 0.7],
    [1, 0.02, -0.7],
  ];
  return (
    <group position={[door.cell.x, 0, door.cell.y]} rotation-y={-dirAngle(door.facing)} {...entityHandlers({ kind: 'door', id })}>
      <mesh position={[0.5, 1, 0]} material={mat('#ffffff', { opacity: 0.001 })}>
        <boxGeometry args={[1.2, 2.2, 1.1]} />
      </mesh>
      <Block p={[0.45, h / 2, 0.46]} s={[0.12, h, 0.12]} c={C.blue} />
      <Block p={[0.45, h / 2, -0.46]} s={[0.12, h, 0.12]} c={C.blue} />
      {!low && (
        <>
          <Block p={[0.45, 2.45, 0]} s={[0.14, 0.2, 1.04]} c={C.blue} />
          <Block p={[0, 2.8, 0]} s={[1, 0.5, 1]} c={C.wall} />
          <mesh ref={shutter} position={[0.4, 1.1, 0]} castShadow material={mat(C.shutter)}>
            <boxGeometry args={[0.05, 2.2, 0.8]} />
          </mesh>
          <Block p={[0.62, 0.35, 0]} s={[0.25, 0.15, 0.9]} c={C.navy} />
        </>
      )}
      <Line points={apron} color={C.bay} lineWidth={2} />
      <Billboard position={[1.4, h + 0.7, 0]}>
        <Label fontSize={0.5} color={kind === 'in' ? C.blue : C.outDoor} outlineWidth={0.05} outlineColor="#ffffff">
          {label}
        </Label>
      </Billboard>
      {selected && <SelectionRing radius={0.9} />}
    </group>
  );
}
