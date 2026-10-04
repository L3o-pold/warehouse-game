import type { Vec2 } from './world';

export type Walkable = (x: number, y: number) => boolean;

const STRIDE = 1024;
const MAX_EXPANDED = 6000;
const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

class MinHeap {
  private keys: number[] = [];
  private pri: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, p: number) {
    this.keys.push(key);
    this.pri.push(p);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.pri[parent] <= this.pri[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const top = this.keys[0];
    const lastK = this.keys.pop()!;
    const lastP = this.pri.pop()!;
    if (this.keys.length) {
      this.keys[0] = lastK;
      this.pri[0] = lastP;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.pri[l] < this.pri[m]) m = l;
        if (r < this.keys.length && this.pri[r] < this.pri[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.pri[a], this.pri[b]] = [this.pri[b], this.pri[a]];
  }
}

export function findPath(start: Vec2, goals: Vec2[], walkable: Walkable, blocked?: Set<string>): Vec2[] | null {
  if (goals.length === 0) return null;
  const key = (x: number, y: number) => y * STRIDE + x;
  const goalSet = new Set(goals.map((g) => key(g.x, g.y)));
  const startK = key(start.x, start.y);
  if (goalSet.has(startK)) return [];
  const h = (x: number, y: number) => {
    let m = Infinity;
    for (const g of goals) m = Math.min(m, Math.abs(g.x - x) + Math.abs(g.y - y));
    return m;
  };
  const open = new MinHeap();
  const gScore = new Map<number, number>([[startK, 0]]);
  const came = new Map<number, number>();
  const closed = new Set<number>();
  open.push(startK, h(start.x, start.y));
  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (++expanded > MAX_EXPANDED) return null;
    if (goalSet.has(cur)) {
      const path: Vec2[] = [];
      let k = cur;
      while (k !== startK) {
        path.push({ x: k % STRIDE, y: Math.floor(k / STRIDE) });
        k = came.get(k)!;
      }
      return path.reverse();
    }
    const cx = cur % STRIDE;
    const cy = Math.floor(cur / STRIDE);
    const g = gScore.get(cur)!;
    for (const [dx, dy] of STEPS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const isGoal = goalSet.has(nk);
      if (!isGoal && (!walkable(nx, ny) || blocked?.has(`${nx},${ny}`))) continue;
      const ng = g + 1;
      if (ng < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, ng);
        came.set(nk, cur);
        open.push(nk, ng + h(nx, ny));
      }
    }
  }
  return null;
}
