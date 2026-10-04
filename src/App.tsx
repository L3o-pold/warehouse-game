import { useGame } from './game/store';
import { useHotkeys } from './input/hotkeys';
import { BuildGhost } from './render/BuildGhost';
import { Effects } from './render/Effects';
import { Entities } from './render/Entities';
import { GroundInteraction } from './render/GroundInteraction';
import { Scene } from './render/Scene';
import { BoxSelectOverlay } from './ui/BoxSelectOverlay';
import { BuildToolbar } from './ui/BuildToolbar';
import { Checklist } from './ui/Checklist';
import { ContractBoard } from './ui/ContractBoard';
import { Inspector } from './ui/Inspector';
import { KpiCards } from './ui/KpiCards';
import { MainMenu } from './ui/MainMenu';
import { OpsPanel } from './ui/OpsPanel';
import { ScenarioEndModal } from './ui/ScenarioEndModal';
import { ShipmentTimeline } from './ui/ShipmentTimeline';
import { Toasts } from './ui/Toasts';
import { TopBar } from './ui/TopBar';

export default function App() {
  const screen = useGame((s) => s.screen);
  const seed = useGame((s) => s.world?.seed);
  useHotkeys();
  if (screen === 'menu') return <MainMenu />;
  return (
    <div className="relative h-full w-full overflow-hidden">
      <Scene key={seed}>
        <Entities />
        <GroundInteraction />
        <BuildGhost />
        <Effects />
      </Scene>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <TopBar />
        <KpiCards />
        <Checklist />
        <Inspector />
        <ContractBoard />
        <OpsPanel />
        <ShipmentTimeline />
        <BuildToolbar />
        <Toasts />
        <BoxSelectOverlay />
        <ScenarioEndModal />
      </div>
    </div>
  );
}
