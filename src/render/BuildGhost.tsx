import { Billboard } from '@react-three/drei';
import { useGame } from '../game/store';
import { previewTool } from '../input/buildMode';
import { Label } from './models';
import { C, mat } from './palette';

export function BuildGhost() {
  const tool = useGame((s) => s.tool);
  const hover = useGame((s) => s.hoverCell);
  const dragStart = useGame((s) => s.buildDragStart);
  useGame((s) => s.hud?.gridVersion);
  useGame((s) => s.hud?.cash);
  const w = useGame.getState().world;
  if (!tool || !hover || !w) return null;
  const g = previewTool(w, tool, hover, dragStart);
  const color = g.ok ? C.ok : C.bad;
  const xs = g.cells.map((c) => c.x);
  const ys = g.cells.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return (
    <group>
      <mesh position={[(minX + maxX) / 2, 0.08, (minY + maxY) / 2]} material={mat(color, { opacity: 0.4 })}>
        <boxGeometry args={[maxX - minX + 0.96, 0.12, maxY - minY + 0.96]} />
      </mesh>
      <Billboard position={[hover.x, 1.8, hover.y]}>
        <Label fontSize={0.48} color={color} outlineWidth={0.05} outlineColor="#ffffff">
          {g.label}
        </Label>
      </Billboard>
    </group>
  );
}
