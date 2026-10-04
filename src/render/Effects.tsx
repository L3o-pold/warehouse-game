import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { loop } from '../game/loop';
import { useGame, type Floater } from '../game/store';
import { interp } from './anim';
import { Label } from './models';
import { C, mat } from './palette';

const FLOAT_MS = 2200;

function FloatText({ f }: { f: Floater }) {
  const ref = useRef<THREE.Group>(null!);
  useFrame(() => {
    const k = (performance.now() - f.born) / FLOAT_MS;
    ref.current.position.y = 2.2 + k * 2.5;
    ref.current.visible = k < 1;
    const s = k < 0.15 ? 0.6 + (k / 0.15) * 0.4 : 1;
    ref.current.scale.setScalar(s);
  });
  return (
    <group ref={ref} position={[f.at.x, 2.2, f.at.y]}>
      <Billboard>
        <Label fontSize={0.9} color={C.ok} outlineWidth={0.07} outlineColor="#ffffff">
          {f.text}
        </Label>
      </Billboard>
    </group>
  );
}

function Pin({ kind, id, color }: { kind: 'forklift' | 'truck'; id: string; color: string }) {
  const ref = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    const w = useGame.getState().world;
    const e = kind === 'forklift' ? w?.forklifts[id] : w?.trucks[id];
    if (!e) {
      ref.current.visible = false;
      return;
    }
    const p = interp(e.prev, e.pos, loop.alpha);
    const ox = kind === 'truck' ? Math.cos(e.heading) * 2.3 : 0;
    const oz = kind === 'truck' ? Math.sin(e.heading) * 2.3 : 0;
    ref.current.visible = true;
    ref.current.position.set(p.x + ox, (kind === 'truck' ? 3.2 : 2.6) + Math.sin(clock.elapsedTime * 3) * 0.15, p.y + oz);
  });
  return (
    <group ref={ref}>
      <mesh position={[0, 0.5, 0]} castShadow material={mat(color)}>
        <sphereGeometry args={[0.34, 18, 14]} />
      </mesh>
      <mesh position={[0, 0.5, 0]} material={mat('#ffffff')}>
        <sphereGeometry args={[0.14, 12, 10]} />
      </mesh>
      <mesh rotation-x={Math.PI} position={[0, 0.05, 0]} castShadow material={mat(color)}>
        <coneGeometry args={[0.28, 0.65, 18]} />
      </mesh>
    </group>
  );
}

export function Effects() {
  const floaters = useGame((s) => s.floaters);
  const pinKey = useGame((s) =>
    s.hud
      ? `${s.hud.forklifts.filter((f) => f.warn).map((f) => f.id).join(',')}|${s.hud.trucks.filter((t) => t.state === 'queued').map((t) => t.id).join(',')}`
      : '|',
  );
  const [fl, tr] = pinKey.split('|').map((x) => x.split(',').filter(Boolean));
  return (
    <>
      {floaters.map((f) => (
        <FloatText key={f.id} f={f} />
      ))}
      {fl.map((id) => (
        <Pin key={`f-${id}`} kind="forklift" id={id} color={C.bad} />
      ))}
      {tr.map((id) => (
        <Pin key={`t-${id}`} kind="truck" id={id} color={C.blue} />
      ))}
    </>
  );
}
