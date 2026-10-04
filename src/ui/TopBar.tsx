import { useGame, type Speed } from '../game/store';
import { WIN_NET_WORTH, WIN_REP } from '../sim/balance';
import { money } from './format';
import { Icon } from './Icon';
import { LogoMark, Panel, Progress } from './Panel';

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5" title={`${value.toFixed(1)} / 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <div key={i} className="relative h-4 w-4 text-slate-300">
            <Icon name="star" className="absolute inset-0 h-4 w-4" />
            <div className="absolute inset-0 overflow-hidden text-amber-400" style={{ width: `${fill * 100}%` }}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const SPEEDS: Speed[] = [1, 2, 4];

export function TopBar() {
  const hud = useGame((s) => s.hud);
  const speed = useGame((s) => s.speed);
  const offers = useGame((s) => s.hud?.offers.length ?? 0);
  const { setSpeed, togglePause, toggleContracts, quitToMenu, resetCamera, toggleRoof } = useGame.getState();
  if (!hud) return null;
  const pct = hud.capacity ? Math.round((hud.stock / hud.capacity) * 100) : 0;
  const busy = hud.docks.filter((d) => d.truckId).length;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-3 p-4">
      <Panel className="flex items-center gap-2 px-3 py-2">
        <LogoMark />
        <div className="leading-tight">
          <div className="text-xl font-extrabold tracking-tight">WareTrack</div>
          <div className="text-[10px] font-bold tracking-[0.25em] text-slate-400">TYCOON</div>
        </div>
      </Panel>
      <Panel className="hidden items-center gap-3 whitespace-nowrap px-3 py-2 lg:flex">
        <span className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-bold text-white">WH-01</span>
        <div className="leading-tight">
          <div className="text-sm font-semibold">First Lot</div>
          <div className="text-xs text-slate-500">
            {pct}% full · {busy}/{hud.docks.length} docked
          </div>
        </div>
      </Panel>
      <div className="flex-1" />
      {hud.mode === 'scenario' && (
        <Panel className="hidden w-56 whitespace-nowrap px-3 py-2 xl:block">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Goal · Day 7</span>
            <span className="tabular-nums">{money(hud.netWorth)} / $250k</span>
          </div>
          <Progress value={hud.netWorth} total={WIN_NET_WORTH} tone="blue" />
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>Reputation</span>
            <span className={hud.reputation >= WIN_REP ? 'font-semibold text-emerald-600' : ''}>
              {hud.reputation.toFixed(1)} / {WIN_REP}★
            </span>
          </div>
        </Panel>
      )}
      <Panel className="px-4 py-2">
        <div className="text-xs text-slate-500">Cash</div>
        <div className={`text-lg font-bold tabular-nums ${hud.cash < 0 ? 'text-red-600' : 'text-slate-900'}`}>{money(hud.cash)}</div>
      </Panel>
      <Panel className="hidden px-3 py-2 md:block">
        <div className="text-xs text-slate-500">Reputation</div>
        <div className="mt-1">
          <Stars value={hud.reputation} />
        </div>
      </Panel>
      <Panel className="flex items-center gap-1 px-2 py-1.5">
        <span
          className={`mr-1 flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-sm font-semibold tabular-nums ${speed ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}
        >
          <span className={`h-2 w-2 rounded-full ${speed ? 'animate-pulse bg-emerald-500' : 'bg-slate-400'}`} />
          {hud.clock}
        </span>
        <button type="button" onClick={togglePause} title="Pause (Space)" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
          <Icon name={speed ? 'pause' : 'play'} className="h-4 w-4" />
        </button>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={`rounded-lg px-2 py-1 text-xs font-bold ${speed === s ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            {s}×
          </button>
        ))}
      </Panel>
      <Panel className="flex items-center gap-1 px-1.5 py-1.5">
        <button type="button" onClick={toggleContracts} title="Contracts (C)" className="relative rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
          <Icon name="clipboard" />
          {offers > 0 && <span className="absolute -right-0.5 -top-0.5 h-4 min-w-4 rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">{offers}</span>}
        </button>
        <button type="button" onClick={toggleRoof} title="Roof cutaway (R)" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
          <Icon name="layers" />
        </button>
        <button type="button" onClick={resetCamera} title="Reset view (H)" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
          <Icon name="home" />
        </button>
        <button type="button" onClick={quitToMenu} title="Main menu" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
          <Icon name="menu" />
        </button>
      </Panel>
    </div>
  );
}
