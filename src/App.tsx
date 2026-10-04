import { useEffect } from 'react';
import { useGame } from './game/store';
import { useHotkeys } from './input/hotkeys';
import { BuildGhost } from './render/BuildGhost';
import { Entities } from './render/Entities';
import { GroundInteraction } from './render/GroundInteraction';
import { Scene } from './render/Scene';

export default function App() {
  const world = useGame((s) => s.world);
  useHotkeys();
  useEffect(() => {
    if (!useGame.getState().world) useGame.getState().startGame('scenario', 42);
  }, []);
  const clock = useGame((s) => s.hud?.clock);
  return (
    <div className="relative h-full w-full">
      {world && (
        <Scene>
          <Entities />
          <GroundInteraction />
          <BuildGhost />
        </Scene>
      )}
      <div className="pointer-events-none absolute left-4 top-4 rounded-xl bg-white/85 px-4 py-2 font-bold shadow">{clock}</div>
    </div>
  );
}
