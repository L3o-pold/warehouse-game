import { useGame } from '../game/store';
import { COST } from '../sim/balance';
import { PRODUCTS } from '../sim/products';
import { inDuration, money, TYPE_LABEL, when } from './format';
import { Icon } from './Icon';
import { Badge, Button, Hint, Kicker, Panel, Progress, Row, statusTone } from './Panel';

function Header({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  const select = useGame((s) => s.select);
  return (
    <div className="flex items-start justify-between">
      <div>
        <Kicker>{kicker}</Kicker>
        <div className="text-xl font-extrabold">{title}</div>
        {sub && <div className="text-sm text-slate-500">{sub}</div>}
      </div>
      <button type="button" onClick={() => select(null)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50">
        <Icon name="x" className="h-4 w-4" />
      </button>
    </div>
  );
}

const Gone = ({ text }: { text: string }) => (
  <>
    <Header kicker="SELECTION" title="Gone" />
    <p className="mt-2 text-sm text-slate-500">{text}</p>
  </>
);

function SiteOverview() {
  const hud = useGame((s) => s.hud)!;
  const status = !hud.buildingReady ? (hud.constructing ? 'Under construction' : 'Empty lot') : 'Operational';
  const working = hud.forklifts.filter((f) => f.status === 'Working').length;
  const busyDocks = hud.docks.filter((d) => d.truckId).length;
  const first = hud.forklifts.find((f) => f.detail);
  return (
    <>
      <Kicker>DEPOT · WH-01</Kicker>
      <div className="text-xl font-extrabold">First Lot</div>
      <div className="text-sm text-slate-500">40 × 30 lot · Linden NJ</div>
      <div className="mt-3 flex items-center gap-2">
        <Badge tone={statusTone(status)}>{status}</Badge>
        <span className="text-sm text-slate-500">
          {busyDocks} docked · {hud.inboundArriving} arriving · {hud.active.length} active
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Stock on hand</div>
          <div className="font-bold tabular-nums">
            {hud.stock} <span className="text-xs font-normal text-slate-400">/ {hud.capacity}</span>
          </div>
          <Progress value={hud.stock} total={hud.capacity} tone="blue" />
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Truck bays</div>
          <div className="font-bold tabular-nums">
            {busyDocks} <span className="text-xs font-normal text-slate-400">/ {hud.docks.length} busy</span>
          </div>
          <Progress value={busyDocks} total={hud.docks.length} />
        </div>
      </div>
      <div className="mt-4 flex justify-between text-sm font-semibold">
        <span>Inventory</span>
        <span className="text-xs font-normal text-slate-400">pallets</span>
      </div>
      <div className="mt-1">
        {hud.inventory.map((r) => (
          <div key={r.product} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm last:border-0">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ background: PRODUCTS[r.product].color }} />
              {r.name}
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{r.count}</span>
              <Badge tone={r.count === 0 ? 'slate' : r.count < 4 ? 'amber' : 'green'}>{r.count === 0 ? 'Empty' : r.count < 4 ? 'Low Stock' : 'In Stock'}</Badge>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between text-sm font-semibold">
        <span>Forklift fleet</span>
        <span className="text-xs font-normal text-slate-500">
          {working}/{hud.forklifts.length} working
        </span>
      </div>
      {first && (
        <div className="mt-1 text-sm text-slate-600">
          <span className="font-semibold">{first.label}</span> {first.detail}
        </div>
      )}
      <Hint>Click anything in the yard to inspect it. Press B to build, C for contracts.</Hint>
    </>
  );
}

function ForkliftCard({ ids }: { ids: string[] }) {
  const hud = useGame((s) => s.hud)!;
  const dispatch = useGame((s) => s.dispatch);
  if (ids.length > 1) {
    return (
      <>
        <Header kicker="FORKLIFTS" title={`${ids.length} selected`} />
        <div className="mt-2">
          {hud.forklifts
            .filter((f) => ids.includes(f.id))
            .map((f) => (
              <Row key={f.id} label={f.label}>
                <Badge tone={statusTone(f.status)}>{f.status}</Badge>
              </Row>
            ))}
        </div>
        <Hint>Right-click a truck to focus them on it, or the floor to move them.</Hint>
      </>
    );
  }
  const row = hud.forklifts.find((f) => f.id === ids[0]);
  if (!row) return <Gone text="This forklift no longer exists." />;
  return (
    <>
      <Header kicker="FORKLIFT" title={row.label} sub={row.fast ? 'Fast mast fitted' : 'Standard mast'} />
      <div className="mt-3 flex items-center gap-2">
        <Badge tone={statusTone(row.status)}>{row.status}</Badge>
        <span className="text-sm text-slate-600">{row.detail || 'Waiting for work'}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button disabled={row.fast} onClick={() => dispatch({ type: 'upgradeForklift', forkliftId: row.id })}>
          <Icon name="bolt" className="h-4 w-4" /> Fast mast {money(COST.fastMast)}
        </Button>
        <Button variant="secondary" disabled={row.state !== 'broken'} onClick={() => dispatch({ type: 'repairForklift', forkliftId: row.id })}>
          <Icon name="wrench" className="h-4 w-4" /> Repair {money(COST.repair)}
        </Button>
      </div>
      <Hint>Right-click a truck, pallet or floor cell to give orders. Shift-click or drag to select several.</Hint>
    </>
  );
}

function TruckCard({ id }: { id: string }) {
  const hud = useGame((s) => s.hud)!;
  const dispatch = useGame((s) => s.dispatch);
  const row = hud.trucks.find((t) => t.id === id);
  if (!row) return <Gone text="This truck has left the site." />;
  const c = [...hud.active, ...hud.history].find((x) => x.id === row.contractId);
  const doors = hud.docks.filter((d) => d.kind === row.kind);
  const canRedirect = row.state === 'scheduled' || row.state === 'queued' || row.state === 'driving';
  return (
    <>
      <Header kicker={`TRUCK · ${row.kind === 'in' ? 'INBOUND' : 'OUTBOUND'}`} title={row.id} sub={row.client} />
      <div className="mt-2">
        <Row label="Status">
          <Badge tone={statusTone(row.status)}>{row.status}</Badge>
        </Row>
        <Row label="Door">{row.door ?? '—'}</Row>
        <Row label={row.kind === 'in' ? 'Unloaded' : 'Loaded'}>
          {row.done}/{row.total}
        </Row>
        {row.state === 'scheduled' && <Row label="Arrives">{when(row.arriveAt, hud.minute)}</Row>}
        {c && <Row label="Contract">{`${TYPE_LABEL[c.type]} · ${c.productName}`}</Row>}
        {c && <Row label="Deadline">{`${when(c.deadline, hud.minute)} (${inDuration(c.deadline - hud.minute)})`}</Row>}
      </div>
      <div className="mt-2">
        <Progress value={row.done} total={row.total} />
      </div>
      {canRedirect && doors.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold text-slate-500">Send to door</div>
          <div className="flex flex-wrap gap-2">
            {doors.map((d) => (
              <Button
                key={d.id}
                variant={d.truckId === id ? 'active' : 'secondary'}
                disabled={!!d.truckId && d.truckId !== id}
                onClick={() => dispatch({ type: 'reassignTruck', truckId: id, doorId: d.id })}
              >
                {d.label}
              </Button>
            ))}
          </div>
        </div>
      )}
      <Hint>Select forklifts and right-click this truck to focus them on it. With this truck selected, right-click a door to redirect it.</Hint>
    </>
  );
}

function DoorCard({ id }: { id: string }) {
  const hud = useGame((s) => s.hud)!;
  const dispatch = useGame((s) => s.dispatch);
  const door = useGame.getState().world?.doors[id];
  const row = hud.docks.find((d) => d.id === id);
  if (!row || !door) return <Gone text="This door was removed." />;
  return (
    <>
      <Header kicker="DOCK DOOR · WH-01" title={row.label} sub={row.kind === 'in' ? 'Inbound dock with leveller' : 'Outbound dock with leveller'} />
      <div className="mt-3 flex items-center gap-2">
        <Badge tone={statusTone(row.status)}>{row.status}</Badge>
        {row.truckId && <span className="text-sm text-slate-600">{`${row.truckId} · ${row.client}`}</span>}
      </div>
      {row.truckId && (
        <div className="mt-2">
          <Progress value={row.done} total={row.total} />
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={!!row.truckId} onClick={() => dispatch({ type: 'toggleDoor', doorId: id })}>
          Switch to {row.kind === 'in' ? 'Out' : 'In'} · {money(COST.doorToggle)}
        </Button>
        <Button variant="secondary" disabled={!!row.truckId} onClick={() => dispatch({ type: 'demolish', cell: door.cell })}>
          <Icon name="trash" className="h-4 w-4" /> Demolish
        </Button>
      </div>
    </>
  );
}

function RackCard({ id }: { id: string }) {
  useGame((s) => s.hud?.minute);
  const dispatch = useGame((s) => s.dispatch);
  const w = useGame.getState().world;
  const rack = w?.racks[id];
  if (!w || !rack) return <Gone text="This rack was removed." />;
  const slotName = (i: number) => {
    const pid = rack.slots[i];
    const p = pid ? w.pallets[pid] : undefined;
    return p ? PRODUCTS[p.product].name : 'Empty';
  };
  return (
    <>
      <Header kicker="PALLET RACK" title={`Rack ${id.split('-')[1]}`} sub="2 bays × 2 levels" />
      <div className="mt-2">
        <Row label="Upper · left">{slotName(2)}</Row>
        <Row label="Upper · right">{slotName(3)}</Row>
        <Row label="Ground · left">{slotName(0)}</Row>
        <Row label="Ground · right">{slotName(1)}</Row>
      </div>
      <div className="mt-3">
        <Button variant="secondary" onClick={() => dispatch({ type: 'demolish', cell: rack.cells[0] })}>
          <Icon name="trash" className="h-4 w-4" /> Demolish · refund {money(COST.rack / 2)}
        </Button>
      </div>
      <Hint>Heavy goods (playmat rolls) only go on the ground level.</Hint>
    </>
  );
}

function PalletCard({ id }: { id: string }) {
  useGame((s) => s.hud?.minute);
  const w = useGame.getState().world;
  const p = w?.pallets[id];
  if (!w || !p) return <Gone text="This pallet has left the site." />;
  const c = w.contracts[p.contractId];
  const where = { truck: 'On a truck', rack: 'In a rack', staging: 'On staging', floor: 'On the floor (blocking)', forklift: 'On a forklift' }[p.loc.kind];
  const job = w.jobs[`job-${p.id}`];
  return (
    <>
      <Header kicker="PALLET" title={PRODUCTS[p.product].name} sub={c ? `${c.client} · ${TYPE_LABEL[c.type]}` : undefined} />
      <div className="mt-2">
        <Row label="Location">{where}</Row>
        <Row label="Next move">{job ? `${job.type.toLowerCase()}${job.forkliftId ? ' · assigned' : ' · queued'}` : 'None'}</Row>
        {c && <Row label="Deadline">{when(c.deadline, w.minute)}</Row>}
      </div>
      <Hint>Select a forklift and right-click this pallet to make it handle the pallet now.</Hint>
    </>
  );
}

function ContractCard({ id }: { id: string }) {
  const hud = useGame((s) => s.hud)!;
  const dispatch = useGame((s) => s.dispatch);
  const c = [...hud.active, ...hud.offers, ...hud.history].find((x) => x.id === id);
  if (!c) return <Gone text="This offer expired." />;
  return (
    <>
      <Header kicker={`CONTRACT · ${TYPE_LABEL[c.type].toUpperCase()}`} title={c.client} sub={`${c.qty} × ${c.productName}`} />
      <div className="mt-2">
        <Row label="Status">
          <Badge tone={statusTone(c.status)}>{c.status}</Badge>
        </Row>
        <Row label="Progress">{`${c.done}/${c.qty}`}</Row>
        <Row label="Payout">{money(c.payout)}</Row>
        {c.type === 'storage' && <Row label="Rent">{`${money(c.rentPerDay)}/pallet/day · ${c.storeDays}d`}</Row>}
        <Row label="Deadline">{when(c.deadline, hud.minute)}</Row>
      </div>
      {c.status === 'active' && (
        <div className="mt-3">
          <Button variant={c.rush ? 'active' : 'secondary'} onClick={() => dispatch({ type: 'toggleRush', contractId: c.id })}>
            <Icon name="bolt" className="h-4 w-4" /> {c.rush ? 'Rush on' : 'Mark as rush'}
          </Button>
        </div>
      )}
    </>
  );
}

export function Inspector() {
  const sel = useGame((s) => s.selection);
  const hasHud = useGame((s) => !!s.hud);
  const contractsOpen = useGame((s) => s.contractsOpen);
  if (!hasHud || contractsOpen) return null;
  let body;
  if (!sel) body = <SiteOverview />;
  else if (sel.kind === 'forklifts') body = <ForkliftCard ids={sel.ids} />;
  else if (sel.kind === 'truck') body = <TruckCard id={sel.id} />;
  else if (sel.kind === 'door') body = <DoorCard id={sel.id} />;
  else if (sel.kind === 'rack') body = <RackCard id={sel.id} />;
  else if (sel.kind === 'pallet') body = <PalletCard id={sel.id} />;
  else body = <ContractCard id={sel.id} />;
  // On narrow screens only show the inspector for an actual selection, so the yard stays visible.
  return (
    <Panel className={`absolute right-4 top-24 max-h-[calc(100vh-380px)] w-[360px] overflow-y-auto p-4 ${sel ? '' : 'hidden lg:block'}`}>{body}</Panel>
  );
}
