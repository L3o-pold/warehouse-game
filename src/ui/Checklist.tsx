import { useGame } from '../game/store';
import { Icon } from './Icon';
import { Panel } from './Panel';

export function Checklist() {
  const items = useGame((s) => s.hud?.checklist);
  const open = useGame((s) => s.checklistOpen);
  const toggle = useGame((s) => s.toggleChecklist);
  if (!items || items.every((i) => i.done)) return null;
  const done = items.filter((i) => i.done).length;
  return (
    <Panel className="absolute left-4 top-[200px] w-72 p-3">
      <button type="button" onClick={toggle} className="flex w-full items-center justify-between text-sm font-bold">
        <span>{`Getting started · ${done}/${items.length}`}</span>
        <Icon name="chevron" className={`h-4 w-4 transition ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {items.map((i) => (
            <li key={i.label} className={`flex items-center gap-2 text-sm ${i.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full ${i.done ? 'bg-emerald-500 text-white' : 'border border-slate-300'}`}>
                {i.done && <Icon name="check" className="h-3 w-3" />}
              </span>
              {i.label}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
