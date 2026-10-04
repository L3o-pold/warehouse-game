import { useGame } from '../game/store';
import { entityHandlers } from '../input/selection';
import { RackModel } from './models';
import { SelectionRing } from './SelectionRing';

export function Rack({ id }: { id: string }) {
  const selected = useGame((s) => s.selection?.kind === 'rack' && s.selection.id === id);
  const r = useGame.getState().world?.racks[id];
  if (!r) return null;
  const [a, b] = r.cells;
  const vertical = a.x === b.x;
  return (
    <group position={[(a.x + b.x) / 2, 0, (a.y + b.y) / 2]} rotation-y={vertical ? Math.PI / 2 : 0} {...entityHandlers({ kind: 'rack', id })}>
      <RackModel />
      {selected && <SelectionRing radius={1.4} />}
    </group>
  );
}
