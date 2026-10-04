import { useGame } from '../game/store';
import type { TruckRow } from '../game/hud';
import { inDuration, TYPE_LABEL, when } from './format';
import { Icon } from './Icon';
import { Badge, Panel, statusTone } from './Panel';

function stepIndex(t: TruckRow): number {
  switch (t.state) {
    case 'scheduled':
      return 0;
    case 'queued':
    case 'driving':
    case 'docking':
      return 1;
    case 'docked':
      return 3;
    case 'departing':
      return 4;
  }
}

export function ShipmentTimeline() {
  const hud = useGame((s) => s.hud);
  const sel = useGame((s) => s.selection);
  const select = useGame((s) => s.select);
  if (!hud) return null;
  const focus =
    (sel?.kind === 'truck' && hud.trucks.find((t) => t.id === sel.id)) ||
    hud.trucks.find((t) => t.state === 'docked') ||
    hud.trucks.find((t) => t.state !== 'scheduled') ||
    hud.trucks[0];
  if (!focus) {
    return (
      <Panel className="absolute bottom-4 left-4 hidden w-[560px] px-5 py-4 xl:block">
        <div className="flex items-center gap-2 font-bold">
          <Icon name="truck" className="h-5 w-5 text-blue-600" /> Shipment Tracking
        </div>
        <p className="mt-2 text-sm text-slate-500">Accept a contract (C) to see trucks and shipments here.</p>
      </Panel>
    );
  }
  const c = [...hud.active, ...hud.history].find((x) => x.id === focus.contractId);
  const steps =
    focus.kind === 'in'
      ? ['Scheduled', 'Arrived', 'Docked', `Unloading ${focus.done}/${focus.total}`, 'Empty · leaving']
      : ['Scheduled', 'Arrived', 'Docked', `Loading ${focus.done}/${focus.total}`, 'Departed'];
  const idx = stepIndex(focus);
  return (
    <Panel className="absolute bottom-4 left-4 hidden w-[760px] items-stretch gap-4 px-5 py-4 xl:flex">
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold">
            <Icon name="truck" className="h-5 w-5 text-blue-600" /> Shipment Tracking
          </div>
          <span className="text-sm text-slate-500">{`${focus.id} · ${focus.client}`}</span>
        </div>
        <div className="mt-4 flex items-start">
          {steps.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col items-center text-center">
              <div className="flex w-full items-center">
                <div className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : i <= idx ? 'bg-blue-600' : 'bg-slate-200'}`} />
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    i < idx ? 'bg-blue-600 text-white' : i === idx ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <Icon name={i < idx ? 'check' : i === 3 ? 'box' : 'truck'} className="h-4 w-4" />
                </div>
                <div className={`h-0.5 flex-1 ${i === steps.length - 1 ? 'opacity-0' : i < idx ? 'bg-blue-600' : 'bg-slate-200'}`} />
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-700">{label}</div>
              {i === 0 && <div className="text-[11px] text-slate-400">{when(focus.arriveAt, hud.minute)}</div>}
            </div>
          ))}
        </div>
      </div>
      {c && (
        <button
          type="button"
          onClick={() => select({ kind: 'contract', id: c.id })}
          className="flex w-60 items-center gap-3 rounded-xl bg-slate-50 p-3 text-left hover:bg-slate-100"
        >
          <div className="min-w-0 flex-1">
            <div className="font-bold">{`#${c.id.toUpperCase()}`}</div>
            <div className="truncate text-sm text-slate-500">{`${TYPE_LABEL[c.type]} · ${c.qty} × ${c.productName}`}</div>
            <div className="mt-1">
              <Badge tone={statusTone(focus.status)}>{focus.status}</Badge>
            </div>
            <div className="mt-1 text-xs text-slate-500">{`${focus.door ?? 'No door'} · due ${inDuration(c.deadline - hud.minute)}`}</div>
          </div>
          <Icon name="chevron" className="h-4 w-4 text-slate-400" />
        </button>
      )}
    </Panel>
  );
}
