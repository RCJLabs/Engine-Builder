/**
 * Whether a pointer is pressed, and a way to wait until it lifts (M3.8). A field left by a press
 * shows the problems it held back only then: shown as the press moved focus, they pushed what was
 * pressed out from under the pointer before it lifted, and the click was lost ("Add to Options"
 * under a Leads to naming a line not yet written).
 */
let pressed = false;
const waiting = new Set<() => void>();

function lift(): void {
  pressed = false;
  // A task later, once the click this lift makes has been dispatched.
  setTimeout(() => {
    for (const run of [...waiting]) {
      waiting.delete(run);
      run();
    }
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    () => {
      pressed = true;
    },
    true,
  );
  document.addEventListener('pointerup', lift, true);
  document.addEventListener('pointercancel', lift, true);
  // A press let go outside the window never sends its pointerup here.
  window.addEventListener('blur', lift);
}

/** Runs `then` now, or once the pointer that is pressed lifts. */
export function afterPress(then: () => void): void {
  if (pressed) waiting.add(then);
  else then();
}
