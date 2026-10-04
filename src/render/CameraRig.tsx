import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { LOT_H, LOT_W } from '../sim/balance';
import { useGame } from '../game/store';
import { edgeDirection, inputState, installInputTracking, isTyping } from '../input/inputState';

const DIST = 60;
const HEIGHT = 55;
const ELEV_K = Math.hypot(DIST, HEIGHT) / HEIGHT;
const HOME = { x: LOT_W / 2, z: LOT_H / 2 + 2, yaw: Math.PI / 4, zoom: 20 };
const KEY_PAN_PX_PER_S = 700;

type RigState = { tx: number; tz: number; yaw: number; yawGoal: number; zoom: number; zoomGoal: number };

function panBy(s: RigState, rightPx: number, upPx: number): void {
  const k = 1 / s.zoom;
  const rx = Math.cos(s.yaw);
  const rz = -Math.sin(s.yaw);
  const fx = -Math.sin(s.yaw);
  const fz = -Math.cos(s.yaw);
  s.tx = THREE.MathUtils.clamp(s.tx + (rx * rightPx + fx * upPx * ELEV_K) * k, -8, LOT_W + 8);
  s.tz = THREE.MathUtils.clamp(s.tz + (rz * rightPx + fz * upPx * ELEV_K) * k, -8, LOT_H + 10);
}

export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const gl = useThree((s) => s.gl);
  const st = useRef<RigState>({ tx: HOME.x, tz: HOME.z, yaw: HOME.yaw, yawGoal: HOME.yaw, zoom: HOME.zoom, zoomGoal: HOME.zoom });
  const keys = useRef(new Set<string>());
  const nonce = useGame((s) => s.cameraNonce);

  useEffect(() => {
    Object.assign(st.current, { tx: HOME.x, tz: HOME.z, yawGoal: HOME.yaw, zoomGoal: HOME.zoom });
  }, [nonce]);

  useEffect(() => {
    installInputTracking();
    const el = gl.domElement;
    let panning = false;
    let lx = 0;
    let ly = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const k = e.key.toLowerCase();
      keys.current.add(k);
      if (k === 'q') st.current.yawGoal += Math.PI / 2;
      if (k === 'e') st.current.yawGoal -= Math.PI / 2;
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const onBlur = () => keys.current.clear();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = st.current;
      s.zoomGoal = THREE.MathUtils.clamp(s.zoomGoal * (e.deltaY > 0 ? 0.88 : 1.12), 8, 70);
    };
    const onDown = (e: PointerEvent) => {
      const sel = useGame.getState().selection;
      const rightCommands = sel?.kind === 'forklifts' || sel?.kind === 'truck';
      if (e.button === 1 || (e.button === 2 && !rightCommands)) {
        panning = true;
        lx = e.clientX;
        ly = e.clientY;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!panning) return;
      panBy(st.current, -(e.clientX - lx), e.clientY - ly);
      lx = e.clientX;
      ly = e.clientY;
    };
    const onUp = () => {
      panning = false;
    };
    const onEnter = () => {
      inputState.inside = true;
    };
    const onLeave = () => {
      inputState.inside = false;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [gl]);

  useFrame((_, dt) => {
    const s = st.current;
    const k = keys.current;
    const step = KEY_PAN_PX_PER_S * dt;
    let r = 0;
    let u = 0;
    if (k.has('a') || k.has('arrowleft')) r -= step;
    if (k.has('d') || k.has('arrowright')) r += step;
    if (k.has('w') || k.has('arrowup')) u += step;
    if (k.has('s') || k.has('arrowdown')) u -= step;
    if (inputState.inside && document.hasFocus()) {
      const edge = edgeDirection(inputState.mouseX, inputState.mouseY, gl.domElement.getBoundingClientRect());
      r += edge.r * step;
      u += edge.u * step;
    }
    if (r || u) panBy(s, r, u);
    const t = 1 - Math.exp(-dt * 10);
    s.yaw += (s.yawGoal - s.yaw) * t;
    s.zoom += (s.zoomGoal - s.zoom) * t;
    camera.position.set(s.tx + Math.sin(s.yaw) * DIST, HEIGHT, s.tz + Math.cos(s.yaw) * DIST);
    camera.lookAt(s.tx, 0, s.tz);
    if (Math.abs(camera.zoom - s.zoom) > 1e-3) {
      camera.zoom = s.zoom;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}
