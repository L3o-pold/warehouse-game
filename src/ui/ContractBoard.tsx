import { useGame } from '../game/store';
import type { ContractRow } from '../game/hud';
import { PRODUCTS } from '../sim/products';
import { inDuration, money, TYPE_LABEL, when } from './format';
import { Icon } from './Icon';
import { Badge, Button, Panel, Progress, type Tone } from './Panel';

const TYPE_TONE: Record<ContractRow['type'], Tone> = { storage: 'blue', crossdock: 'amber', outbound: 'green' };

function Offer({ c, now }: { c: ContractRow; now: number }) {
  const dispatch = useGame((s) => s.dispatch);
  return (
    <div className={`rounded-xl border bg-white p-3 ${c.hot ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200'}`}>
      <div className="flex items-center gap-2">
        <Badge tone={TYPE_TONE[c.type]}>{TYPE_LABEL[c.type]}</Badge>
        {c.hot && <Badge tone="red">RUSH ×2</Badge>}
        <span className="ml-auto text-xs text-slate-400">{`expires in ${inDuration(c.offerExpires - now)}`}</span>
      </div>
      <div className="mt-2 font-bold">{c.client}</div>
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <span className="h-3 w-3 rounded-sm" style={{ background: PRODUCTS[c.product].color }} />
        {`${c.qty} × ${c.productName}`}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-slate-500">
        <span>{`Arrives ${when(c.arriveAt, now)}`}</span>
        <span>{`Due ${when(c.deadline, now)}`}</span>
        {c.type === 'storage' && <span className="col-span-2">{`Store ${c.storeDays}d · rent ${money(c.rentPerDay)}/pallet/day`}</span>}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="text-lg font-extrabold text-emerald-600">{money(c.payout)}</div>
        <Button disabled={!!c.blocker} title={c.blocker ?? ''} onClick={() => dispatch({ type: 'acceptContract', contractId: c.id })}>
          Accept
        </Button>
      </div>
      {c.blocker && <div className="mt-1 text-xs font-medium text-amber-600">{c.blocker}</div>}
    </div>
  );
}

function Active({ c, now }: { c: ContractRow; now: number }) {
  const { dispatch, select } = useGame.getState();
  const left = c.deadline - now;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <Badge tone={TYPE_TONE[c.type]}>{TYPE_LABEL[c.type]}</Badge>
        <button type="button" className="font-bold hover:underline" onClick={() => select({ kind: 'contract', id: c.id })}>
          {c.client}
        </button>
        <span className={`ml-auto text-xs font-semibold ${left < 0 ? 'text-red-600' : left < 120 ? 'text-amber-600' : 'text-slate-500'}`}>
          {left < 0 ? `${inDuration(-left)} late` : `due in ${inDuration(left)}`}
        </span>
      </div>
      <div className="mt-1 text-sm text-slate-600">{`${c.done}/${c.qty} × ${c.productName}`}</div>
      <div className="mt-2">
        <Progress value={c.done} total={c.qty} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-emerald-600">{money(c.payout)}</span>
        <Button variant={c.rush ? 'active' : 'ghost'} onClick={() => dispatch({ type: 'toggleRush', contractId: c.id })}>
          <Icon name="bolt" className="h-4 w-4" /> {c.rush ? 'Rush' : 'Rush?'}
        </Button>
      </div>
    </div>
  );
}

export function ContractBoard() {
  const open = useGame((s) => s.contractsOpen);
  const hud = useGame((s) => s.hud);
  const toggle = useGame((s) => s.toggleContracts);
  if (!open || !hud) return null;
  return (
    <Panel className="absolute bottom-4 right-4 top-24 flex w-[400px] flex-col p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-extrabold">
          <Icon name="clipboard" className="h-5 w-5 text-blue-600" /> Contracts
        </div>
        <button type="button" onClick={toggle} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex-1 space-y-4 overflow-y-auto pr-1">
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{`Offers · ${hud.offers.length}`}</h3>
          <div className="space-y-2">
            {hud.offers.length ? hud.offers.map((c) => <Offer key={c.id} c={c} now={hud.minute} />) : <p className="text-sm text-slate-400">New offers arrive every day at 06:00.</p>}
          </div>
        </section>
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{`Active · ${hud.active.length}`}</h3>
          <div className="space-y-2">
            {hud.active.length ? hud.active.map((c) => <Active key={c.id} c={c} now={hud.minute} />) : <p className="text-sm text-slate-400">No active contracts.</p>}
          </div>
        </section>
        {hud.history.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Recent</h3>
            {hud.history.map((c) => (
              <div key={c.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm last:border-0">
                <span>{`${c.client} · ${TYPE_LABEL[c.type]}`}</span>
                <span className={c.status === 'done' ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>
                  {c.status === 'done' ? money(c.earned) : 'Failed'}
                </span>
              </div>
            ))}
          </section>
        )}
      </div>
    </Panel>
  );
}
