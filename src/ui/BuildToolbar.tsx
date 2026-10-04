import { useGame, type BuildTool } from '../game/store';
import { COST } from '../sim/balance';
import { money } from './format';
import { Icon } from './Icon';
import { Panel } from './Panel';

type Item = { key: string; label: string; icon: string; cost: string; tool: NonNullable<BuildTool> | null; hint: string };

export function BuildToolbar() {
  const open = useGame((s) => s.buildOpen);
  const tool = useGame((s) => s.tool);
  const ready = useGame((s) => s.hud?.buildingReady ?? false);
  const { setTool, toggleBuild, dispatch } = useGame.getState();
  if (!open) {
    return (
      <div className="pointer-events-none absolute bottom-[150px] left-1/2 -translate-x-1/2">
        <Panel className="px-1 py-1">
          <button type="button" onClick={toggleBuild} className="flex items-center gap-2 rounded-xl px-4 py-2 font-semibold text-blue-700 hover:bg-blue-50">
            <Icon name="hammer" /> Build <kbd className="rounded bg-slate-100 px-1.5 text-xs text-slate-500">B</kbd>
          </button>
        </Panel>
      </div>
    );
  }
  const items: Item[] = [
    { key: 'footprint', label: ready ? 'Expand' : 'Warehouse', icon: 'warehouse', cost: `${money(COST.cell)}/cell`, tool: { kind: 'footprint' }, hint: 'Drag a rectangle on the lot. Expansions must share a wall.' },
    { key: 'in', label: 'In door', icon: 'doorIn', cost: money(COST.door), tool: { kind: 'door', doorKind: 'in' }, hint: 'Click a wall with 8 cells of clear yard outside.' },
    { key: 'out', label: 'Out door', icon: 'doorOut', cost: money(COST.door), tool: { kind: 'door', doorKind: 'out' }, hint: 'Outbound trucks load here.' },
    { key: 'rack', label: 'Rack', icon: 'rack', cost: money(COST.rack), tool: { kind: 'rack', orient: tool?.kind === 'rack' ? tool.orient : 'h' }, hint: 'Click inside. Press T to rotate. 4 pallet slots.' },
    { key: 'staging', label: 'Staging', icon: 'grid', cost: `${money(COST.staging)}/cell`, tool: { kind: 'staging' }, hint: 'Click or drag to paint buffer cells near doors.' },
    { key: 'demolish', label: 'Demolish', icon: 'trash', cost: '50% back', tool: { kind: 'demolish' }, hint: 'Click a rack, door or staging cell.' },
  ];
  const activeKey = tool ? (tool.kind === 'door' ? tool.doorKind : tool.kind) : null;
  const active = items.find((i) => i.key === activeKey);
  return (
    <div className="pointer-events-none absolute bottom-[150px] left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
      {active && <div className="rounded-lg bg-slate-900/80 px-3 py-1.5 text-xs text-white">{active.hint} · Esc to cancel</div>}
      <Panel className="flex items-center gap-1 p-1.5">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={() => setTool(activeKey === it.key ? null : it.tool)}
            className={`flex w-[84px] flex-col items-center rounded-xl px-2 py-1.5 text-xs font-semibold transition ${
              activeKey === it.key ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Icon name={it.icon} className="h-5 w-5" />
            <span className="mt-0.5">{it.label}</span>
            <span className={`text-[10px] ${activeKey === it.key ? 'text-blue-100' : 'text-slate-400'}`}>{it.cost}</span>
          </button>
        ))}
        <div className="mx-1 h-10 w-px bg-slate-200" />
        <button
          type="button"
          disabled={!ready}
          onClick={() => dispatch({ type: 'buyForklift' })}
          className="flex w-[84px] flex-col items-center rounded-xl px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
        >
          <Icon name="forklift" className="h-5 w-5" />
          <span className="mt-0.5">Forklift</span>
          <span className="text-[10px] text-slate-400">{money(COST.forklift)}</span>
        </button>
        <button type="button" onClick={toggleBuild} className="ml-1 rounded-lg p-2 text-slate-400 hover:bg-slate-100" title="Close (B)">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </Panel>
    </div>
  );
}
