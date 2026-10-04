import { BREAKDOWN_MIN, EVENT_CHANCE_PER_HOUR, HOT_OFFER_TTL } from './balance';
import { makeOffer } from './contracts';
import { breakdown } from './forklifts';
import { cellOf } from './grid';
import { chance, int, pick } from './rng';
import { fmtMoney, pushEvent, type World } from './world';

const forkliftName = (id: string) => `FL-${id.split('-')[1].padStart(2, '0')}`;

export function rollEvent(w: World): void {
  if (!chance(w.rng, EVENT_CHANCE_PER_HOUR)) return;
  const kind = int(w.rng, 0, 2);
  if (kind === 0) {
    const soon = Object.values(w.trucks).filter((t) => t.state === 'scheduled' && t.arriveAt > w.minute && t.arriveAt <= w.minute + 180);
    if (!soon.length) return;
    const t = pick(w.rng, soon);
    const early = int(w.rng, 30, 60);
    t.arriveAt = Math.max(w.minute + 1, t.arriveAt - early);
    pushEvent(w, 'alert', `${t.id} (${t.client}) is arriving ${early} min early`);
  } else if (kind === 1) {
    const working = Object.values(w.forklifts).filter((f) => f.state !== 'parked' && f.state !== 'broken');
    if (!working.length) return;
    const f = pick(w.rng, working);
    breakdown(w, f, BREAKDOWN_MIN);
    pushEvent(w, 'alert', `${forkliftName(f.id)} broke down — repair for $500 or wait 2h`, { at: cellOf(f.pos) });
  } else {
    const c = makeOffer(w, 'crossdock');
    c.payout *= 2;
    c.hot = true;
    c.offerExpires = w.minute + HOT_OFFER_TTL;
    w.contracts[c.id] = c;
    pushEvent(w, 'alert', `Rush order! ${c.client}: ${c.qty} pallets cross-dock, pays ${fmtMoney(c.payout)}`);
  }
}
