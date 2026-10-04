import { useGame } from '../game/store';
import { Icon } from './Icon';

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="pointer-events-none absolute left-1/2 top-24 flex w-[420px] -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium shadow-lg backdrop-blur ${
            t.kind === 'alert' ? 'bg-amber-50/95 text-amber-800' : t.kind === 'payout' ? 'bg-emerald-50/95 text-emerald-800' : 'bg-white/95 text-slate-700'
          }`}
        >
          <Icon name={t.kind === 'alert' ? 'alert' : t.kind === 'payout' ? 'check' : 'truck'} className="h-4 w-4 shrink-0" />
          {t.text}
        </div>
      ))}
    </div>
  );
}
