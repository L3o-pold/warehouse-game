import { useState } from 'react';
import { useGame } from '../game/store';
import { Icon } from './Icon';
import { LogoMark } from './Panel';

const randomSeed = () => Math.floor(1000 + Math.random() * 9000);

export function MainMenu() {
  const startGame = useGame((s) => s.startGame);
  const [seedText, setSeedText] = useState(String(randomSeed()));
  const seed = () => {
    const n = Number.parseInt(seedText, 10);
    return Number.isFinite(n) ? Math.abs(n) : randomSeed();
  };
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 via-slate-100 to-blue-100">
      <div className="w-[720px]">
        <div className="flex items-center gap-3">
          <LogoMark className="h-14 w-14" />
          <div>
            <h1 className="text-5xl font-extrabold tracking-tight">WareTrack</h1>
            <div className="text-sm font-bold tracking-[0.4em] text-blue-600">TYCOON</div>
          </div>
        </div>
        <p className="mt-4 max-w-lg text-lg text-slate-600">Build a warehouse, win contracts, and keep trucks and forklifts moving.</p>
        <div className="mt-8 grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => startGame('scenario', seed())}
            className="group rounded-2xl bg-blue-600 p-6 text-left text-white shadow-xl transition hover:-translate-y-0.5 hover:bg-blue-700"
          >
            <Icon name="star" className="h-7 w-7" />
            <div className="mt-3 text-2xl font-extrabold">First Lot</div>
            <div className="mt-1 text-sm text-blue-100">Scenario · Reach $250k net worth and 4★ by the end of Day 7.</div>
          </button>
          <button
            type="button"
            onClick={() => startGame('sandbox', seed())}
            className="rounded-2xl bg-white p-6 text-left shadow-xl transition hover:-translate-y-0.5"
          >
            <Icon name="warehouse" className="h-7 w-7 text-blue-600" />
            <div className="mt-3 text-2xl font-extrabold">Sandbox</div>
            <div className="mt-1 text-sm text-slate-500">No goal, no clock pressure. Build and optimise at your own pace.</div>
          </button>
        </div>
        <label className="mt-6 flex items-center gap-3 text-sm text-slate-500">
          Seed
          <input
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            className="w-28 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs">Same seed = same contracts and events.</span>
        </label>
        <div className="mt-8 grid grid-cols-4 gap-2 text-xs text-slate-500">
          <div><b className="text-slate-700">WASD / edges</b> pan</div>
          <div><b className="text-slate-700">Wheel</b> zoom · <b className="text-slate-700">Q/E</b> rotate</div>
          <div><b className="text-slate-700">Left</b> select · <b className="text-slate-700">Right</b> order</div>
          <div><b className="text-slate-700">Space</b> pause · <b className="text-slate-700">1/2/3</b> speed</div>
        </div>
      </div>
    </div>
  );
}
