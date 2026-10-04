import { useEffect } from 'react';
import { useGame } from './game/store';
import { useHotkeys } from './input/hotkeys';
import { BuildGhost } from './render/BuildGhost';
import { Entities } from './render/Entities';
import { GroundInteraction } from './render/GroundInteraction';
import { Scene } from './render/Scene';
import { Inspector } from './ui/Inspector';
import { KpiCards } from './ui/KpiCards';
import { OpsPanel } from './ui/OpsPanel';
import { ShipmentTimeline } from './ui/ShipmentTimeline';
import { TopBar } from './ui/TopBar';

export default function App() {
  const world = useGame((s) => s.world);
  useHotkeys();
  useEffect(() => {
    if (!useGame.getState().world) useGame.getState().startGame('scenario', 42);
  }, []);
  return (
    <div className="relative h-full w-full">
      {world && (
        <Scene>
          <Entities />
          <GroundInteraction />
          <BuildGhost />
        </Scene>
      )}
      <div className="pointer-events-none absolute inset-0">
        <TopBar />
        <KpiCards />
        <Inspector />
        <OpsPanel />
        <ShipmentTimeline />
      </div>
    </div>
  );
}
