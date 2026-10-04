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

export const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
