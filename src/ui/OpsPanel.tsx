import { useState } from 'react';
import { useGame } from '../game/store';
import { Icon } from './Icon';
import { Badge, Panel, Progress, statusTone } from './Panel';

type Tab = 'docks' | 'forklifts' | 'trucks';

export function OpsPanel() {
  const hud = useGame((s) => s.hud);
  const select = useGame((s) => s.select);
  const [tab, setTab] = useState<Tab>('docks');
  if (!hud) return null;
  const busy = hud.docks.filter((d) => d.truckId).length;
  const working = hud.forklifts.filter((f) => f.status === 'Working').length;
  const visibleTrucks = hud.trucks.filter((t) => t.state !== 'scheduled');
  const tabs: { id: Tab; label: string; count: string }[] = [
    { id: 'docks', label: 'Docks', count: `${busy}/${hud.docks.length}` },
    { id: 'forklifts', label: 'Forklifts', count: `${working}/${hud.forklifts.length}` },
    { id: 'trucks', label: 'Trucks', count: String(visibleTrucks.length) },
  ];
  const rowCls = 'grid w-full grid-cols-[72px_1fr_96px_64px_16px] items-center gap-2 border-b border-slate-100 py-2 text-left text-sm last:border-0 hover:bg-slate-50';
  return (
    <Panel className="absolute bottom-4 right-4 w-[440px] p-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Icon name="warehouse" className="h-4 w-4" />
        </div>
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1 text-sm font-semibold ${tab === t.id ? 'bg-white shadow-sm' : 'text-slate-500'}`}
            >
              {t.label} <span className="text-blue-600">{t.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 max-h-52 overflow-y-auto pr-1">
        {tab === 'docks' &&
          (hud.docks.length ? (
            hud.docks.map((d) => (
              <button key={d.id} type="button" className={rowCls} onClick={() => select({ kind: 'door', id: d.id })}>
                <span className="font-semibold">{d.label}</span>
                <span className="truncate text-slate-600">{d.truckId ? `${d.truckId} · ${d.client}` : 'No truck assigned'}</span>
                <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                <span>{d.truckId ? <Progress value={d.done} total={d.total} /> : null}</span>
                <Icon name="chevron" className="h-4 w-4 text-slate-400" />
              </button>
            ))
          ) : (
            <p className="py-4 text-center text-sm text-slate-400">No dock doors yet — add one from the build bar.</p>
          ))}
        {tab === 'forklifts' &&
          hud.forklifts.map((f) => (
            <button key={f.id} type="button" className={rowCls} onClick={() => select({ kind: 'forklifts', ids: [f.id] })}>
              <span className="font-semibold">{f.label}</span>
              <span className="truncate text-slate-600">{f.detail || '—'}</span>
              <Badge tone={statusTone(f.status)}>{f.status}</Badge>
              <span className="text-xs text-slate-400">{f.fast ? 'Fast' : ''}</span>
              <Icon name="chevron" className="h-4 w-4 text-slate-400" />
            </button>
          ))}
        {tab === 'trucks' &&
          (visibleTrucks.length ? (
            visibleTrucks.map((t) => (
              <button key={t.id} type="button" className={rowCls} onClick={() => select({ kind: 'truck', id: t.id })}>
                <span className="font-semibold">{t.id}</span>
                <span className="truncate text-slate-600">{`${t.client}${t.door ? ` · ${t.door}` : ''}`}</span>
                <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                <span className="text-xs tabular-nums text-slate-500">{`${t.done}/${t.total}`}</span>
                <Icon name="chevron" className="h-4 w-4 text-slate-400" />
              </button>
            ))
          ) : (
            <p className="py-4 text-center text-sm text-slate-400">No trucks on site.</p>
          ))}
      </div>
    </Panel>
  );
}
