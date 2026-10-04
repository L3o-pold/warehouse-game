import { Canvas } from '@react-three/fiber';
import { useEffect, useRef, type ReactNode } from 'react';
import type * as THREE from 'three';
import { LOT_H, LOT_W } from '../sim/balance';
import { CameraRig } from './CameraRig';
import { Ground } from './Ground';
import { C } from './palette';
import { SimDriver } from './SimDriver';

function Lights() {
  const light = useRef<THREE.DirectionalLight>(null!);
  useEffect(() => {
    light.current.target.position.set(LOT_W / 2, 0, LOT_H / 2);
    light.current.target.updateMatrixWorld();
  }, []);
  return (
    <>
      <hemisphereLight args={['#ffffff', '#b7c4d6', 0.9]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        ref={light}
        castShadow
        position={[LOT_W / 2 + 25, 45, LOT_H / 2 + 18]}
        intensity={1.7}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-bias={-0.0004}
      />
    </>
  );
}

export function Scene({ children }: { children?: ReactNode }) {
  return (
    <Canvas
      shadows
      orthographic
      camera={{ zoom: 20, position: [60, 55, 60], near: 0.1, far: 600 }}
      dpr={[1, 2]}
      onContextMenu={(e) => e.preventDefault()}
    >
      <color attach="background" args={[C.sky]} />
      <Lights />
      <CameraRig />
      <SimDriver />
      <Ground />
      {children}
    </Canvas>
  );
}
