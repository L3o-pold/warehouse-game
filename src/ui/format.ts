import { dayOf, fmtMoney } from '../sim/world';
import type { ContractType } from '../sim/world';

export const money = fmtMoney;
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const timeOfDay = (m: number) => `${pad2(Math.floor((m % 1440) / 60))}:${pad2(m % 60)}`;
export const when = (m: number, now: number) => (dayOf(m) === dayOf(now) ? timeOfDay(m) : `Day ${dayOf(m)} ${timeOfDay(m)}`);
export function inDuration(min: number): string {
  if (min <= 0) return 'now';
  const h = Math.floor(min / 60);
  const mm = Math.round(min % 60);
  return h ? `${h}h ${pad2(mm)}m` : `${mm}m`;
}
export const forkliftLabel = (id: string) => `FL-${pad2(Number(id.split('-')[1]))}`;
export const TYPE_LABEL: Record<ContractType, string> = { storage: 'Storage', crossdock: 'Cross-dock', outbound: 'Outbound' };
