/**
 * Whether a pointer is pressed, and a way to wait until the press is over (M3.8). A field left by
 * a press shows the problems it held back only then: shown as the press moved focus, they pushed
 * what was pressed out from under the pointer before its click, and the click was lost ("Add to
 * Options" under a Leads to naming a line not yet written).
 *
 * A press is over at its click, not as the pointer lifts: on touch the focus moves, and the field
 * is left, only after the finger lifts, as the tap's mouse events follow it (M3.9, "Add to
 * Objectives" on a phone). A press that makes no click, dragged off or held, is over a moment
 * after it lifts.
 */
let pressed = false;
let noClick: ReturnType<typeof setTimeout> | undefined;
const waiting = new Set<() => void>();

// Long enough for a tap's mouse events and its click, which follow the lift within a frame or two.
const NO_CLICK_MS = 500;

function over(): void {
  pressed = false;
  if (noClick !== undefined) clearTimeout(noClick);
  noClick = undefined;
  // A task later, once the click has been dispatched.
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
      if (noClick !== undefined) clearTimeout(noClick);
      noClick = undefined;
    },
    true,
  );
  document.addEventListener('click', over, true);
  document.addEventListener(
    'pointerup',
    () => {
      if (pressed) noClick = setTimeout(over, NO_CLICK_MS);
    },
    true,
  );
  document.addEventListener('pointercancel', over, true);
  // A press let go outside the window never sends its pointerup or click here.
  window.addEventListener('blur', over);
}

/** Runs `then` now, or once the press under way is over. */
export function afterPress(then: () => void): void {
  if (pressed) waiting.add(then);
  else then();
}
