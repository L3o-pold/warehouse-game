import { RoundedBox, Text } from '@react-three/drei';
import { Suspense, type ComponentProps, type Ref } from 'react';
import type * as THREE from 'three';
import type { ClientId } from '../sim/world';
import { C, CLIENT_LOOK, mat } from './palette';

type V3 = [number, number, number];

/** drei Text suspends while its font loads; isolate that so the scene and sim never wait on fonts. */
export function Label(props: ComponentProps<typeof Text>) {
  return (
    <Suspense fallback={null}>
      <Text {...props} />
    </Suspense>
  );
}

export function Block({ p, s, c, opacity, cast = true }: { p: V3; s: V3; c: string; opacity?: number; cast?: boolean }) {
  return (
    <mesh position={p} castShadow={cast} receiveShadow material={mat(c, { opacity })}>
      <boxGeometry args={s} />
    </mesh>
  );
}

function Wheel({ p, r = 0.18, w = 0.14 }: { p: V3; r?: number; w?: number }) {
  return (
    <mesh position={p} rotation={[Math.PI / 2, 0, 0]} castShadow material={mat(C.tire)}>
      <cylinderGeometry args={[r, r, w, 14]} />
    </mesh>
  );
}

/** ~1.3 long forklift facing +X. `forksRef` is the carriage group; the caller sets its y. */
export function ForkliftModel({ forksRef }: { forksRef: Ref<THREE.Group> }) {
  return (
    <group>
      <Block p={[-0.1, 0.38, 0]} s={[0.9, 0.42, 0.7]} c={C.yellow} />
      <Block p={[-0.48, 0.52, 0]} s={[0.22, 0.52, 0.66]} c={C.yellowDark} />
      {([[-0.4, 0.28], [-0.4, -0.28], [0.2, 0.28], [0.2, -0.28]] as const).map(([x, z], i) => (
        <Block key={i} p={[x, 1.0, z]} s={[0.05, 0.8, 0.05]} c={C.navy} />
      ))}
      <Block p={[-0.1, 1.42, 0]} s={[0.72, 0.05, 0.66]} c={C.navy} />
      <mesh position={[-0.15, 0.86, 0]} castShadow material={mat(C.blue)}>
        <capsuleGeometry args={[0.14, 0.22, 4, 8]} />
      </mesh>
      <mesh position={[-0.15, 1.2, 0]} castShadow material={mat(C.skin)}>
        <sphereGeometry args={[0.11, 12, 10]} />
      </mesh>
      <Block p={[0.42, 0.95, 0.22]} s={[0.07, 1.7, 0.07]} c={C.navy} />
      <Block p={[0.42, 0.95, -0.22]} s={[0.07, 1.7, 0.07]} c={C.navy} />
      <group ref={forksRef} position={[0.48, 0.06, 0]}>
        <Block p={[0, 0.2, 0]} s={[0.05, 0.4, 0.55]} c={C.navy} />
        <Block p={[0.35, 0.02, 0.15]} s={[0.7, 0.04, 0.09]} c={C.steel} />
        <Block p={[0.35, 0.02, -0.15]} s={[0.7, 0.04, 0.09]} c={C.steel} />
      </group>
      <Wheel p={[0.22, 0.18, 0.33]} />
      <Wheel p={[0.22, 0.18, -0.33]} />
      <Wheel p={[-0.38, 0.18, 0.33]} />
      <Wheel p={[-0.38, 0.18, -0.33]} />
    </group>
  );
}

/** Truck with its rear at x=0 and cab towards +X. */
export function TruckModel({ client }: { client: ClientId }) {
  const look = CLIENT_LOOK[client];
  return (
    <group>
      <Block p={[1.8, 1.05, 0]} s={[3.6, 1.5, 1.05]} c={C.trailer} />
      <Block p={[1.8, 0.6, 0.53]} s={[3.5, 0.22, 0.02]} c={look.stripe} cast={false} />
      <Block p={[1.8, 0.6, -0.53]} s={[3.5, 0.22, 0.02]} c={look.stripe} cast={false} />
      <Block p={[2.1, 0.26, 0]} s={[4.2, 0.12, 0.9]} c={C.chassis} />
      <RoundedBox args={[0.95, 1.25, 1.05]} radius={0.12} position={[4.2, 0.92, 0]} castShadow material={mat(look.cab)} />
      <Block p={[4.66, 1.18, 0]} s={[0.06, 0.45, 0.88]} c={C.glass} cast={false} />
      <Block p={[4.25, 1.18, 0.53]} s={[0.45, 0.32, 0.02]} c={C.glass} cast={false} />
      <Block p={[4.25, 1.18, -0.53]} s={[0.45, 0.32, 0.02]} c={C.glass} cast={false} />
      <Label position={[1.8, 1.22, 0.54]} fontSize={0.4} color={look.stripe} anchorX="center" anchorY="middle">
        {look.logo}
      </Label>
      <Label position={[1.8, 1.22, -0.54]} rotation={[0, Math.PI, 0]} fontSize={0.4} color={look.stripe} anchorX="center" anchorY="middle">
        {look.logo}
      </Label>
      {[0.5, 1.05, 3.1, 4.3].map((x) => (
        <group key={x}>
          <Wheel p={[x, 0.24, 0.46]} r={0.24} w={0.16} />
          <Wheel p={[x, 0.24, -0.46]} r={0.24} w={0.16} />
        </group>
      ))}
    </group>
  );
}

/** Two-cell pallet rack along X, centred on the origin. Level 0 at y≈0, level 1 shelf at y≈1.15. */
export function RackModel() {
  return (
    <group>
      {[-1, 0, 1].flatMap((x) =>
        [0.45, -0.45].map((z) => <Block key={`u${x}${z}`} p={[x * 0.98, 1.2, z]} s={[0.07, 2.4, 0.07]} c={C.blue} />),
      )}
      {[1.12, 2.3].flatMap((y) => [0.45, -0.45].map((z) => <Block key={`b${y}${z}`} p={[0, y, z]} s={[2.0, 0.1, 0.06]} c={C.rackBeam} />))}
      <Block p={[0, 1.14, 0]} s={[1.96, 0.04, 0.9]} c={C.steelLight} />
    </group>
  );
}

export function TreeModel({ s = 1 }: { s?: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 0.5, 0]} castShadow material={mat(C.trunk)}>
        <cylinderGeometry args={[0.08, 0.1, 1, 8]} />
      </mesh>
      <mesh position={[0, 1.45, 0]} castShadow material={mat(C.tree)}>
        <sphereGeometry args={[0.65, 16, 12]} />
      </mesh>
      <mesh position={[0.25, 1.15, 0.2]} castShadow material={mat(C.treeDark)}>
        <sphereGeometry args={[0.35, 12, 10]} />
      </mesh>
    </group>
  );
}
