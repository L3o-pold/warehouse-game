import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGame } from '../game/store';
import { rectFrom, snapCell, toolCommand } from '../input/buildMode';
import { inputState } from '../input/inputState';
import { LOT_H, LOT_W, ROAD_ROWS } from '../sim/balance';
import { cellKey, type Vec2 } from '../sim/world';

const toCell = (p: THREE.Vector3): Vec2 => ({ x: Math.floor(p.x + 0.5), y: Math.floor(p.z + 0.5) });

export function GroundInteraction() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const boxStart = useRef<{ x: number; y: number } | null>(null);
  const painting = useRef<string | null>(null);

  useEffect(() => {
    const v = new THREE.Vector3();
    const onMove = (e: PointerEvent) => {
      if (!boxStart.current) return;
      useGame.getState().setDragRect({ x0: boxStart.current.x, y0: boxStart.current.y, x1: e.clientX, y1: e.clientY });
    };
    const onUp = (e: PointerEvent) => {
      painting.current = null;
      const start = boxStart.current;
      boxStart.current = null;
      const s = useGame.getState();
      s.setDragRect(null);
      if (!start || e.button !== 0 || inputState.dragDist <= 6 || !s.world) return;
      const b = gl.domElement.getBoundingClientRect();
      const [x0, x1] = [Math.min(start.x, e.clientX), Math.max(start.x, e.clientX)];
      const [y0, y1] = [Math.min(start.y, e.clientY), Math.max(start.y, e.clientY)];
      const ids = Object.values(s.world.forklifts)
        .filter((f) => f.state !== 'parked')
        .filter((f) => {
          v.set(f.pos.x, 0.5, f.pos.y).project(camera);
          const sx = b.left + ((v.x + 1) / 2) * b.width;
          const sy = b.top + ((1 - v.y) / 2) * b.height;
          return sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1;
        })
        .map((f) => f.id);
      s.select(ids.length ? { kind: 'forklifts', ids } : null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [camera, gl]);

  const paint = (c: Vec2) => {
    const s = useGame.getState();
    const k = cellKey(c);
    if (painting.current === k || s.world?.staging[k]) return;
    painting.current = k;
    s.dispatch({ type: 'placeStaging', cell: c });
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const s = useGame.getState();
    const c = toCell(e.point);
    s.setHoverCell(c);
    if (s.tool?.kind === 'staging' && painting.current !== null && e.buttons === 1) paint(c);
  };
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (inputState.entityHit || e.button !== 0) return;
    const s = useGame.getState();
    const c = toCell(e.point);
    const t = s.tool;
    if (!t) {
      boxStart.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
      return;
    }
    if (t.kind === 'footprint') s.setBuildDragStart(c);
    else if (t.kind === 'staging') {
      painting.current = '';
      paint(c);
    } else {
      const cmd = toolCommand(t, s.world ? snapCell(s.world, t, c) : c);
      if (cmd) s.dispatch(cmd);
    }
  };
  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (inputState.entityHit) return;
    const s = useGame.getState();
    const c = toCell(e.point);
    if (e.button === 0) {
      if (s.tool?.kind === 'footprint' && s.buildDragStart) {
        s.dispatch({ type: 'buildFootprint', rect: rectFrom(s.buildDragStart, c) });
        s.setBuildDragStart(null);
      } else if (!s.tool && inputState.dragDist <= 6) s.select(null);
    } else if (e.button === 2 && inputState.dragDist < 6) {
      const sel = s.selection;
      if (sel?.kind === 'forklifts') s.dispatch({ type: 'orderForklifts', forkliftIds: sel.ids, target: { kind: 'cell', cell: c } });
    }
  };

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[LOT_W / 2 - 0.5, 0.005, (LOT_H + ROAD_ROWS) / 2 - 0.5]}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={() => useGame.getState().setHoverCell(null)}
    >
      <planeGeometry args={[LOT_W, LOT_H + ROAD_ROWS]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
