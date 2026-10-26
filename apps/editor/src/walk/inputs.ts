/**
 * What the walk is given by keys, the mouse and a pad (M5.8, D70, docs/specs/movement.md#controls):
 * keys held while the space has focus, the mouse dragged or locked after a click, and the pad read
 * each frame. Touch is touch.ts's. Each frame the stage takes what has been held and moved since.
 */
import type { Held } from './controls.ts';
import { WALK_KEYS } from './controls.ts';

export interface Inputs {
  /** What is held now, and the mouse's move since the last take. */
  take(): Omit<Held, 'stick' | 'jumpButton' | 'attackButton'>;
  /** Nothing held: the space lost focus, or the shell paused it. */
  clear(): void;
  dispose(): void;
}

/** A click is a press that moved less than this, in pixels: it locks the mouse rather than turning. */
const CLICK = 4;

export function createInputs(box: HTMLElement, canvas: HTMLCanvasElement): Inputs {
  const keys = new Set<string>();
  // A key pressed and let go between two frames still counts, once: a tap of Space jumps.
  const tapped = new Set<string>();
  let drag = { x: 0, y: 0 };
  let pressed: { x: number; y: number; moved: number } | null = null;
  // With the pointer locked a click attacks (M6.4): held while the button is, counted once if let go between frames.
  let clicking = false;
  let clicked = false;

  const keydown = (event: KeyboardEvent) => {
    if (!WALK_KEYS.has(event.code) || event.altKey || event.ctrlKey || event.metaKey) return;
    // The page's own use of them waits: no scrolling, no spatial focus, no button pressed by Space.
    event.preventDefault();
    keys.add(event.code);
    tapped.add(event.code);
  };
  const keyup = (event: KeyboardEvent) => keys.delete(event.code);
  const blur = () => keys.clear();
  const down = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    if (document.pointerLockElement === canvas && event.button === 0) {
      clicking = true;
      clicked = true;
      return;
    }
    pressed = { x: event.clientX, y: event.clientY, moved: 0 };
    canvas.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    const locked = document.pointerLockElement === canvas;
    if (!locked && !pressed) return;
    drag = { x: drag.x + event.movementX, y: drag.y + event.movementY };
    if (pressed) pressed.moved += Math.abs(event.movementX) + Math.abs(event.movementY);
  };
  const up = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') clicking = false;
    if (event.pointerType !== 'mouse' || !pressed) return;
    const click = pressed.moved < CLICK;
    pressed = null;
    // A click locks the mouse to the walk, which Escape lets go; a drag only turns.
    if (click && document.pointerLockElement !== canvas) {
      Promise.resolve(canvas.requestPointerLock?.()).catch(() => {});
    }
  };
  box.addEventListener('keydown', keydown);
  box.addEventListener('keyup', keyup);
  box.addEventListener('focusout', blur);
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);

  const pad = () => {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return undefined;
    const pads = Array.from(navigator.getGamepads()).filter((p): p is Gamepad => p !== null);
    if (pads.length === 0) return undefined;
    // Every pad merged, the strongest axis of each winning, as pad.ts merges them for the screens.
    const axes = [0, 1, 2, 3].map((i) =>
      pads.reduce((best, p) => (Math.abs(p.axes[i] ?? 0) > Math.abs(best) ? (p.axes[i] ?? 0) : best), 0),
    );
    const a = pads.some((p) => p.buttons[0]?.pressed === true);
    // X, in the standard mapping: Interact (M5.9); the right trigger: Attack (M6.4).
    const x = pads.some((p) => p.buttons[2]?.pressed === true);
    const rt = pads.some((p) => p.buttons[7]?.pressed === true || (p.buttons[7]?.value ?? 0) > 0.5);
    return { axes, a, x, rt };
  };

  return {
    take() {
      const moved = drag;
      drag = { x: 0, y: 0 };
      const held = pad();
      const down = new Set([...keys, ...tapped]);
      tapped.clear();
      const click = clicking || clicked;
      clicked = false;
      return {
        keys: down,
        ...(click ? { click } : {}),
        ...(held ? { pad: held } : {}),
        ...(moved.x !== 0 || moved.y !== 0 ? { drag: { ...moved, by: 'mouse' as const } } : {}),
      };
    },
    clear() {
      keys.clear();
      tapped.clear();
      drag = { x: 0, y: 0 };
      pressed = null;
      clicking = false;
      clicked = false;
    },
    dispose() {
      box.removeEventListener('keydown', keydown);
      box.removeEventListener('keyup', keyup);
      box.removeEventListener('focusout', blur);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
  };
}
