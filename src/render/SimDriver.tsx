import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { advance } from '../game/loop';
import { useGame } from '../game/store';

const PUBLISH_EVERY_S = 0.2;

export function SimDriver() {
  const since = useRef(0);
  useFrame((_, dt) => {
    const s = useGame.getState();
    if (!s.world) return;
    advance(s.world, dt, s.speed);
    since.current += dt;
    if (since.current >= PUBLISH_EVERY_S) {
      since.current = 0;
      s.publish();
    }
  });
  return null;
}
