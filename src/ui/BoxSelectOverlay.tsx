import { useGame } from '../game/store';

export function BoxSelectOverlay() {
  const r = useGame((s) => s.dragRect);
  if (!r) return null;
  const left = Math.min(r.x0, r.x1);
  const top = Math.min(r.y0, r.y1);
  return (
    <div
      className="pointer-events-none fixed rounded border-2 border-blue-500 bg-blue-500/10"
      style={{ left, top, width: Math.abs(r.x1 - r.x0), height: Math.abs(r.y1 - r.y0) }}
    />
  );
}
