/**
 * A code stage's canvas as the player touches it (M7.4, D86): pointers, the wheel and the stage's
 * keys gathered into the next frame's list (gestures.ts). The canvas takes focus, so the arrow keys
 * reach the stage and not the shell's spatial focus while it has it; Tab moves on as ever. A use's
 * button sits over the canvas, so a press on one is the button's, never a tap.
 */
import type { StageInput } from './api.ts';
import { gestureOf, moved, type Pointer, pushInput, STAGE_KEYS } from './gestures.ts';

export interface StageInputs {
  /** What the player did since the last call, in order. */
  take(): StageInput[];
  stop(): void;
}

export function captureInput(canvas: HTMLCanvasElement): StageInputs {
  let list: StageInput[] = [];
  const pointers = new Map<number, Pointer>();
  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const down = (e: PointerEvent) => {
    const [x, y] = local(e);
    pointers.set(e.pointerId, { x, y, from: [x, y], wandered: false });
    canvas.setPointerCapture?.(e.pointerId);
    canvas.focus({ preventScroll: true });
  };
  const move = (e: PointerEvent) => {
    const pointer = pointers.get(e.pointerId);
    if (!pointer) return;
    const [x, y] = local(e);
    const after = moved(pointer, x, y);
    const ids = [...pointers.keys()];
    const gesture = gestureOf([...pointers.values()], e.pointerId, after, ids);
    pointers.set(e.pointerId, after);
    if (gesture) pushInput(list, gesture);
  };
  const up = (e: PointerEvent) => {
    const pointer = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointer && !pointer.wandered && pointers.size === 0 && e.type === 'pointerup')
      pushInput(list, { kind: 'tap', x: pointer.x, y: pointer.y });
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    pushInput(list, { kind: 'wheel', dy: e.deltaY });
  };
  const key = (e: KeyboardEvent) => {
    if (!STAGE_KEYS.has(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    // The stage's, not the shell's spatial focus.
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'keydown' && e.repeat) return;
    pushInput(list, { kind: 'key', key: e.key === '=' ? '+' : e.key, down: e.type === 'keydown' });
  };

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('keydown', key);
  canvas.addEventListener('keyup', key);
  return {
    take() {
      const taken = list;
      list = [];
      return taken;
    },
    stop() {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('keydown', key);
      canvas.removeEventListener('keyup', key);
    },
  };
}
