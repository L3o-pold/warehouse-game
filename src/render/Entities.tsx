import { useGame } from '../game/store';
import { Building } from './Building';
import { DockDoor } from './DockDoor';
import { Forklift } from './Forklift';
import { PalletInstances } from './PalletInstances';
import { Rack } from './Rack';
import { Truck } from './Truck';

const split = (s?: string) => (s ? s.split(',').filter(Boolean) : []);

export function Entities() {
  const forkliftIds = useGame((s) => s.hud?.forkliftIds);
  const truckIds = useGame((s) => s.hud?.truckIds);
  const doorIds = useGame((s) => s.hud?.doorIds);
  const rackIds = useGame((s) => s.hud?.rackIds);
  return (
    <>
      <Building />
      {split(doorIds).map((id) => (
        <DockDoor key={id} id={id} />
      ))}
      {split(rackIds).map((id) => (
        <Rack key={id} id={id} />
      ))}
      <PalletInstances />
      {split(forkliftIds).map((id) => (
        <Forklift key={id} id={id} />
      ))}
      {split(truckIds).map((id) => (
        <Truck key={id} id={id} />
      ))}
    </>
  );
}
