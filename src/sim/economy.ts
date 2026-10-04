import { RUNNING_PER_CELL, WAGE_PER_FORKLIFT } from './balance';
import { readyCellCount } from './grid';
import { isStoredLoc } from './pallets';
import { fmtMoney, pushEvent, type World } from './world';

export function spend(w: World, amount: number, assetValue = 0): void {
  w.cash -= amount;
  w.stats.expenses += amount;
  w.assetValue += assetValue;
}

export function earn(w: World, amount: number): void {
  w.cash += amount;
  w.stats.revenue += amount;
}

export function refund(w: World, amount: number, assetCost: number): void {
  w.cash += amount;
  w.assetValue -= assetCost;
}

export function addReputation(w: World, delta: number): void {
  w.reputation = Math.min(5, Math.max(0, Math.round((w.reputation + delta) * 10) / 10));
}

export const netWorth = (w: World): number => Math.round(w.cash + 0.5 * w.assetValue);

export function runMidnight(w: World): void {
  let rent = 0;
  for (const p of Object.values(w.pallets)) {
    const c = w.contracts[p.contractId];
    if (c && c.type === 'storage' && c.status === 'active' && isStoredLoc(p.loc)) rent += c.rentPerDay;
  }
  const wages = Object.keys(w.forklifts).length * WAGE_PER_FORKLIFT;
  const upkeep = readyCellCount(w) * RUNNING_PER_CELL;
  if (rent) earn(w, rent);
  spend(w, wages + upkeep);
  pushEvent(w, 'toast', `Midnight: rent +${fmtMoney(rent)} · wages & upkeep −${fmtMoney(wages + upkeep)}`);
}
