import { useGame } from '../game/store';
import { Icon } from './Icon';
import { Panel } from './Panel';

export function KpiCards() {
  const hud = useGame((s) => s.hud);
  if (!hud) return null;
  const cards = [
    { icon: 'box', label: 'Stock on hand', value: String(hud.stock), sub: `pallets · ${hud.capacity} slots` },
    { icon: 'truck', label: 'Trucks on site', value: String(hud.trucksOnSite), sub: `${hud.inboundArriving} inbound · WH-01` },
    { icon: 'clock', label: 'On-time delivery', value: `${hud.onTimePct}%`, sub: `${hud.stats.onTime + hud.stats.late + hud.stats.failed} contracts · WH-01` },
  ];
  return (
    <div className="pointer-events-none absolute left-4 top-24 hidden gap-3 2xl:flex">
      {cards.map((c) => (
        <Panel key={c.label} className="flex w-52 items-center gap-3 px-4 py-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Icon name={c.icon} className="h-6 w-6" />
          </div>
          <div className="leading-tight">
            <div className="text-xs font-medium text-slate-500">{c.label}</div>
            <div className="text-2xl font-extrabold tabular-nums">{c.value}</div>
            <div className="text-xs text-slate-400">{c.sub}</div>
          </div>
        </Panel>
      ))}
    </div>
  );
}
