import { useGame } from '../game/store';
import { money } from './format';
import { Button, Panel } from './Panel';

export function ScenarioEndModal() {
  const hud = useGame((s) => s.hud);
  const { startGame, continueSandbox, quitToMenu } = useGame.getState();
  if (!hud?.outcome) return null;
  const won = hud.outcome === 'won';
  const seed = useGame.getState().world?.seed ?? 42;
  const s = hud.stats;
  const stats: [string, string][] = [
    ['Net worth', money(hud.netWorth)],
    ['Reputation', `${hud.reputation.toFixed(1)}★`],
    ['Contracts on time', String(s.onTime)],
    ['Late / failed', `${s.late} / ${s.failed}`],
    ['Pallets handled', String(s.palletsHandled)],
    ['Revenue', money(s.revenue)],
  ];
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
      <Panel className="w-[460px] p-6 text-center">
        <div className={`text-sm font-bold uppercase tracking-widest ${won ? 'text-emerald-600' : 'text-red-600'}`}>{won ? 'Scenario won' : 'Scenario lost'}</div>
        <h2 className="mt-1 text-2xl font-extrabold">{hud.outcomeReason}</h2>
        <div className="mt-5 grid grid-cols-2 gap-2 text-left">
          {stats.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">{k}</div>
              <div className="font-bold">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => startGame('scenario', seed)}>Retry same seed</Button>
          <Button variant="secondary" onClick={continueSandbox}>
            Continue in sandbox
          </Button>
          <Button variant="ghost" onClick={quitToMenu}>
            Main menu
          </Button>
        </div>
      </Panel>
    </div>
  );
}
