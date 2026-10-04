import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { loop } from '../game/loop';
import { useGame } from '../game/store';
import { entityHandlers } from '../input/selection';
import { PRODUCTS } from '../sim/products';
import type { Pallet, World } from '../sim/world';
import { interp, popScale, renderState } from './anim';
import { C, mat } from './palette';

const MAX = 1500;

function palletPose(w: World, p: Pallet): { x: number; y: number; z: number; rot: number } | null {
  const l = p.loc;
  switch (l.kind) {
    case 'rack': {
      const r = w.racks[l.rackId];
      if (!r) return null;
      const c = r.cells[l.slot % 2];
      return { x: c.x, y: l.slot < 2 ? 0.02 : 1.17, z: c.y, rot: 0 };
    }
    case 'staging':
    case 'floor':
      return { x: l.cell.x, y: 0.02, z: l.cell.y, rot: 0 };
    case 'forklift': {
      const f = w.forklifts[l.forkliftId];
      if (!f) return null;
      const rs = renderState(f.id);
      const pos = interp(f.prev, f.pos, loop.alpha);
      return { x: pos.x + Math.cos(rs.heading) * 0.85, y: rs.forkY + 0.04, z: pos.y + Math.sin(rs.heading) * 0.85, rot: -rs.heading };
    }
    case 'truck':
      return null;
  }
}

export function PalletInstances() {
  const base = useRef<THREE.InstancedMesh>(null!);
  const load = useRef<THREE.InstancedMesh>(null!);
  const ids = useRef<string[]>([]);
  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3(), e: new THREE.Euler(), c: new THREE.Color() }),
    [],
  );
  useLayoutEffect(() => {
    const white = new THREE.Color('#ffffff');
    for (let i = 0; i < MAX; i++) load.current.setColorAt(i, white);
    base.current.count = 0;
    load.current.count = 0;
  }, []);
  useFrame(() => {
    const w = useGame.getState().world;
    if (!w) return;
    let i = 0;
    for (const p of Object.values(w.pallets)) {
      if (i >= MAX) break;
      const pose = palletPose(w, p);
      if (!pose) continue;
      const pop = popScale(w.minute + loop.alpha - p.placedAt);
      tmp.e.set(0, pose.rot, 0);
      tmp.q.setFromEuler(tmp.e);
      tmp.p.set(pose.x, pose.y + 0.06, pose.z);
      tmp.s.set(pop, 1, pop);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      base.current.setMatrixAt(i, tmp.m);
      tmp.p.set(pose.x, pose.y + 0.12 + 0.36 * pop, pose.z);
      tmp.s.set(pop, pop, pop);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      load.current.setMatrixAt(i, tmp.m);
      load.current.setColorAt(i, tmp.c.set(PRODUCTS[p.product].color));
      ids.current[i] = p.id;
      i++;
    }
    base.current.count = i;
    load.current.count = i;
    base.current.instanceMatrix.needsUpdate = true;
    load.current.instanceMatrix.needsUpdate = true;
    if (load.current.instanceColor) load.current.instanceColor.needsUpdate = true;
  });
  const handlers = entityHandlers((e: ThreeEvent<PointerEvent>) => {
    const id = e.instanceId !== undefined ? ids.current[e.instanceId] : undefined;
    return id ? { kind: 'pallet', id } : null;
  });
  return (
    <>
      <instancedMesh ref={base} args={[undefined, undefined, MAX]} castShadow receiveShadow frustumCulled={false} material={mat(C.wood)} {...handlers}>
        <boxGeometry args={[0.9, 0.12, 0.9]} />
      </instancedMesh>
      <instancedMesh ref={load} args={[undefined, undefined, MAX]} castShadow frustumCulled={false} {...handlers}>
        <boxGeometry args={[0.82, 0.72, 0.82]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
    </>
  );
}
