import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { LOT_H, LOT_W, ROAD_ROWS } from '../sim/balance';
import { createRng, next } from '../sim/rng';
import { TreeModel } from './models';
import { C, mat } from './palette';

export function Ground() {
  const trees = useMemo(() => {
    const r = createRng(99);
    const out: { x: number; z: number; s: number }[] = [];
    while (out.length < 48) {
      const x = -16 + next(r) * (LOT_W + 32);
      const z = -16 + next(r) * (LOT_H + 30);
      const inLot = x > -2 && x < LOT_W + 1 && z > -2 && z < LOT_H + ROAD_ROWS + 1.5;
      if (!inLot) out.push({ x, z, s: 0.8 + next(r) * 0.6 });
    }
    return out;
  }, []);
  const dashes = useMemo(() => Array.from({ length: 70 }, (_, i) => -100 + i * 3.5), []);
  const roadZ = LOT_H + ROAD_ROWS / 2 - 0.5;
  const border: [number, number, number][] = [
    [-0.5, 0.02, -0.5],
    [LOT_W - 0.5, 0.02, -0.5],
    [LOT_W - 0.5, 0.02, LOT_H - 0.5],
    [-0.5, 0.02, LOT_H - 0.5],
    [-0.5, 0.02, -0.5],
  ];
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[LOT_W / 2, -0.03, LOT_H / 2]} receiveShadow material={mat(C.ground)}>
        <planeGeometry args={[260, 260]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[LOT_W / 2 - 0.5, -0.015, LOT_H / 2 - 0.5]} receiveShadow material={mat(C.lot)}>
        <planeGeometry args={[LOT_W, LOT_H]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[LOT_W / 2, -0.01, roadZ]} receiveShadow material={mat(C.road)}>
        <planeGeometry args={[260, ROAD_ROWS]} />
      </mesh>
      {dashes.map((x) => (
        <mesh key={x} rotation-x={-Math.PI / 2} position={[x, 0, roadZ]} material={mat(C.roadLine)}>
          <planeGeometry args={[1.6, 0.12]} />
        </mesh>
      ))}
      <Line points={border} color={C.bay} lineWidth={2} />
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]}>
          <TreeModel s={t.s} />
        </group>
      ))}
    </group>
  );
}
