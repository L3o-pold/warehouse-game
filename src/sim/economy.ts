import type { World } from './world';

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
