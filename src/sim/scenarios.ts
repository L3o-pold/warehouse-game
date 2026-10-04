import { LOSE_CASH, LOSE_MINUTES, SCENARIO_END_MINUTE, WIN_NET_WORTH, WIN_REP } from './balance';
import { generateOffers } from './contracts';
import { netWorth } from './economy';
import { createWorld, pushEvent, type Mode, type World } from './world';

export function newGame(mode: Mode, seed: number): World {
  const w = createWorld(seed, mode);
  generateOffers(w, 3);
  pushEvent(w, 'toast', mode === 'scenario' ? 'First Lot: reach $250k net worth and 4★ by the end of Day 7' : 'Sandbox: build freely');
  return w;
}

function end(w: World, outcome: 'won' | 'lost', reason: string): void {
  w.outcome = outcome;
  w.outcomeReason = reason;
  pushEvent(w, outcome === 'won' ? 'payout' : 'alert', reason);
}

export function checkOutcome(w: World): void {
  if (w.outcome || w.mode === 'sandbox') return;
  if (w.cash < LOSE_CASH) {
    w.negativeSince ??= w.minute;
    if (w.minute - w.negativeSince >= LOSE_MINUTES) return end(w, 'lost', 'Bankrupt — cash stayed below −$20,000 for a full day');
  } else w.negativeSince = null;
  if (netWorth(w) >= WIN_NET_WORTH && w.reputation >= WIN_REP) return end(w, 'won', 'You built a warehouse empire in a week!');
  if (w.minute >= SCENARIO_END_MINUTE) end(w, 'lost', 'Day 7 is over — the goal was not reached');
}
