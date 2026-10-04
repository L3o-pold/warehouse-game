export const inputState = { downX: 0, downY: 0, dragDist: 0, mouseX: -1, mouseY: -1, inside: false, entityHit: false };

let installed = false;
export function installInputTracking(): void {
  if (installed) return;
  installed = true;
  window.addEventListener(
    'pointerdown',
    (e) => {
      inputState.downX = e.clientX;
      inputState.downY = e.clientY;
      inputState.mouseX = e.clientX;
      inputState.mouseY = e.clientY;
      inputState.dragDist = 0;
      inputState.entityHit = false;
    },
    true,
  );
  window.addEventListener(
    'pointermove',
    (e) => {
      inputState.mouseX = e.clientX;
      inputState.mouseY = e.clientY;
      if (e.buttons) inputState.dragDist = Math.max(inputState.dragDist, Math.hypot(e.clientX - inputState.downX, e.clientY - inputState.downY));
    },
    true,
  );
}

const EDGE = 14;

/** Edge-scroll direction for a pointer at (x, y); an unknown position (negative) never scrolls. */
export function edgeDirection(x: number, y: number, rect: { left: number; top: number; width: number; height: number }): { r: number; u: number } {
  if (x < 0 || y < 0) return { r: 0, u: 0 };
  const mx = x - rect.left;
  const my = y - rect.top;
  const r = mx < EDGE ? -1 : mx > rect.width - EDGE ? 1 : 0;
  const u = my < EDGE ? 1 : my > rect.height - EDGE ? -1 : 0;
  return { r, u };
}

export const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __input: typeof inputState }).__input = inputState;
