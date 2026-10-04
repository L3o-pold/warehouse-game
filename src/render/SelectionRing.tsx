import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { C, mat } from './palette';

export function SelectionRing({ radius }: { radius: number }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.05;
    ref.current.scale.set(s, s, s);
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, 0.04, 0]} material={mat(C.blue, { emissive: C.blue, opacity: 0.85 })}>
      <ringGeometry args={[radius * 0.84, radius, 40]} />
    </mesh>
  );
}
