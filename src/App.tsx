import { useEffect } from 'react';
import { useGame } from './game/store';
import { Entities } from './render/Entities';
import { Scene } from './render/Scene';

export default function App() {
  const world = useGame((s) => s.world);
  useEffect(() => {
    if (!useGame.getState().world) useGame.getState().startGame('scenario', 42);
  }, []);
  const clock = useGame((s) => s.hud?.clock);
  return (
    <div className="relative h-full w-full">
      {world && (
        <Scene>
          <Entities />
        </Scene>
      )}
      <div className="pointer-events-none absolute left-4 top-4 rounded-xl bg-white/85 px-4 py-2 font-bold shadow">{clock}</div>
    </div>
  );
}
