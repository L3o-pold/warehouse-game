import type { ReactNode } from 'react';

export function Panel({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`pointer-events-auto rounded-2xl border border-white/80 bg-white/85 shadow-[0_8px_30px_rgba(15,23,42,0.12)] backdrop-blur-md ${className}`}>
      {children}
    </div>
  );
}

export type Tone = 'green' | 'amber' | 'blue' | 'red' | 'slate';
const TONES: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-blue-50 text-blue-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-500',
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

export function statusTone(status: string): Tone {
  if (/Unloading|Loading|Working|Operational|In Stock|Done|done/.test(status)) return 'green';
  if (/Waiting|Low|Late|Under construction|Reserved/.test(status)) return 'amber';
  if (/Broken|Failed|failed|Empty/.test(status)) return 'red';
  if (/Docking|En route|Moving|Scheduled|Departing|active/.test(status)) return 'blue';
  return 'slate';
}

export function Progress({ value, total, tone = 'green' }: { value: number; total: number; tone?: 'green' | 'blue' }) {
  const pct = total ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div className={`h-full rounded-full transition-[width] duration-300 ${tone === 'green' ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Button({
  onClick, disabled, children, variant = 'primary', title, className = '',
}: { onClick?: () => void; disabled?: boolean; children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'active'; title?: string; className?: string }) {
  const styles = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    active: 'bg-blue-50 text-blue-700 ring-2 ring-blue-500',
  }[variant];
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600">{children}</div>;
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{children}</span>
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{children}</p>;
}

export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <path d="M20 3l15 8.5v17L20 37 5 28.5v-17z" fill="#2563EB" />
      <path d="M20 3l15 8.5L20 20 5 11.5z" fill="#60A5FA" />
      <path d="M20 20v17l15-8.5v-17z" fill="#1D4ED8" />
    </svg>
  );
}
