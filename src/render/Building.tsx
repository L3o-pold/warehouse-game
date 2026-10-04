
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { loop } from '../game/loop';
import { useGame } from '../game/store';
import { BUILD_MINUTES, LOT_H, LOT_W } from '../sim/balance';
import { F_DOCK, F_DOOR, F_WALL, flagsAt } from '../sim/grid';
import type { BuildingPart, Rect, Vec2 } from '../sim/world';
import { Block, Label } from './models';
import { C, DOCK_H, mat } from './palette';

const MAX_WALLS = 500;

function WallInstances({ cells, height }: { cells: Vec2[]; height: number }) {
  const body = useRef<THREE.InstancedMesh>(null!);
  const base = useRef<THREE.InstancedMesh>(null!);
  const cap = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    cells.forEach((c, i) => {
      m.makeScale(1, height, 1).setPosition(c.x, height / 2, c.y);
      body.current.setMatrixAt(i, m);
      m.makeScale(1.02, 1, 1.02).setPosition(c.x, 0.2, c.y);
      base.current.setMatrixAt(i, m);
      m.makeScale(1.04, 1, 1.04).setPosition(c.x, height + 0.05, c.y);
      cap.current.setMatrixAt(i, m);
    });
    for (const r of [body, base, cap]) {
      r.current.count = cells.length;
      r.current.instanceMatrix.needsUpdate = true;
    }
  }, [cells, height]);
  return (
    <>
      <instancedMesh ref={body} args={[undefined, undefined, MAX_WALLS]} castShadow receiveShadow frustumCulled={false} material={mat(C.wall)}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={base} args={[undefined, undefined, MAX_WALLS]} frustumCulled={false} material={mat(C.blue)}>
        <boxGeometry args={[1, 0.4, 1]} />
      </instancedMesh>
      <instancedMesh ref={cap} args={[undefined, undefined, MAX_WALLS]} frustumCulled={false} material={mat(C.blue)}>
        <boxGeometry args={[1, 0.1, 1]} />
      </instancedMesh>
    </>
  );
}

function DockPlatform({ cells }: { cells: Vec2[] }) {
  const top = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    cells.forEach((c, i) => {
      m.makeScale(1, 1, 1).setPosition(c.x, DOCK_H / 2, c.y);
      top.current.setMatrixAt(i, m);
    });
    top.current.count = cells.length;
    top.current.instanceMatrix.needsUpdate = true;
  }, [cells]);
  return (
    <instancedMesh ref={top} args={[undefined, undefined, MAX_WALLS]} castShadow receiveShadow frustumCulled={false} material={mat(C.dock)}>
      <boxGeometry args={[1, DOCK_H, 1]} />
    </instancedMesh>
  );
}

function ReadyPart({ rect, roof }: { rect: Rect; roof: boolean }) {
  const cx = rect.x + rect.w / 2 - 0.5;
  const cz = rect.y + rect.h / 2 - 0.5;
  const ribs = Math.floor(rect.w / 2);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[cx, 0.01, cz]} receiveShadow material={mat(C.floor)}>
        <planeGeometry args={[rect.w, rect.h]} />
      </mesh>
      {roof && (
        <group position={[cx, 3.1, cz]}>
          <Block p={[0, 0, 0]} s={[rect.w + 0.1, 0.15, rect.h + 0.1]} c={C.blue} />
          {Array.from({ length: ribs }, (_, i) => (
            <Block key={i} p={[-rect.w / 2 + 1 + i * 2, 0.12, 0]} s={[0.12, 0.1, rect.h]} c={C.blueDark} cast={false} />
          ))}
          <Label rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]} fontSize={Math.max(0.8, Math.min(rect.w, rect.h) * 0.16)} color="white">
            WareTrack
          </Label>
        </group>
      )}
    </group>
  );
}

function Scaffold({ part }: { part: BuildingPart }) {
  const fill = useRef<THREE.Mesh>(null!);
  const { rect } = part;
  const cx = rect.x + rect.w / 2 - 0.5;
  const cz = rect.y + rect.h / 2 - 0.5;
  useFrame(() => {
    const w = useGame.getState().world;
    if (!w) return;
    const k = Math.min(1, Math.max(0.02, (w.minute + loop.alpha - (part.readyAt - BUILD_MINUTES)) / BUILD_MINUTES));
    fill.current.scale.y = k;
    fill.current.position.y = 1.5 * k;
  });
  const corners: [number, number][] = [
    [rect.x - 0.5, rect.y - 0.5],
    [rect.x + rect.w - 0.5, rect.y - 0.5],
    [rect.x - 0.5, rect.y + rect.h - 0.5],
    [rect.x + rect.w - 0.5, rect.y + rect.h - 0.5],
  ];
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[cx, 0.02, cz]} material={mat(C.bay, { opacity: 0.35 })}>
        <planeGeometry args={[rect.w, rect.h]} />
      </mesh>
      <mesh ref={fill} position={[cx, 0, cz]} material={mat(C.wall, { opacity: 0.6 })}>
        <boxGeometry args={[rect.w, 3, rect.h]} />
      </mesh>
      {corners.map(([x, z]) => (
        <Block key={`${x},${z}`} p={[x, 1.7, z]} s={[0.12, 3.4, 0.12]} c={C.yellow} />
      ))}
    </group>
  );
}

export function Building() {
  const gridVersion = useGame((s) => s.hud?.gridVersion ?? 0);
  const low = useGame((s) => s.roofCut || s.tool !== null);
  const world = useGame((s) => s.world);
  const { walls, docks, parts, minute } = useMemo(() => {
    const walls: Vec2[] = [];
    const docks: Vec2[] = [];
    if (!world) return { walls, docks, parts: [] as BuildingPart[], minute: 0 };
    for (let y = 0; y < LOT_H; y++) {
      for (let x = 0; x < LOT_W; x++) {
        const f = flagsAt(world, x, y);
        if (f & F_WALL && !(f & F_DOOR)) walls.push({ x, y });
        if (f & F_DOCK) docks.push({ x, y });
      }
    }
    return { walls, docks, parts: world.parts.map((p) => ({ rect: { ...p.rect }, readyAt: p.readyAt })), minute: world.minute };
    // gridVersion changes whenever structures or readiness change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, gridVersion]);
  return (
    <group>
      <WallInstances cells={walls} height={low ? 0.9 : 3} />
      <DockPlatform cells={docks} />
      {parts.map((p, i) => (p.readyAt <= minute ? <ReadyPart key={i} rect={p.rect} roof={!low} /> : <Scaffold key={i} part={p} />))}
    </group>
  );
}
