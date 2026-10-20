/**
 * A gamepad read as commands (M4.2, docs/specs/input.md#gamepad): every pad's buttons and sticks
 * merged, the left stick with hysteresis (Dirtbag's pad.ts), a held direction repeating (Chooser's
 * pad.ts), the rest on press only. A plain function of what the pads read and the time, so the
 * page's loop is thin and this is tested without one.
 */
import type { Direction } from './spatial.ts';

/** The standard mapping's buttons this reads. */
export const BUTTONS = { a: 0, b: 1, lb: 4, rb: 5, start: 9, up: 12, down: 13, left: 14, right: 15 } as const;

const STICK_ON = 0.5;
const STICK_OFF = 0.35;
export const REPEAT_AFTER = 400;
export const REPEAT_EVERY = 120;

/** What the pads read this frame, merged: a button is down if any pad's is, an axis is the furthest from centre. */
export interface PadInput {
  readonly buttons: readonly boolean[];
  readonly axes: readonly number[];
}

export type PadCommand =
  | { readonly kind: 'move'; readonly direction: Direction }
  | { readonly kind: 'press' }
  | { readonly kind: 'back' }
  /** Start: the shell's pause (M4.3). */
  | { readonly kind: 'start' }
  | { readonly kind: 'tab'; readonly step: 1 | -1 };

export interface PadMemory {
  /** The buttons down last frame. */
  readonly down: readonly boolean[];
  /** The stick's direction, kept until it falls back under STICK_OFF. */
  readonly stick: Direction | undefined;
  /** The direction held, and when it next repeats. */
  readonly held: { readonly direction: Direction; readonly next: number } | undefined;
}

export const PAD_START: PadMemory = { down: [], stick: undefined, held: undefined };

/** Every pad's state as one, in the standard mapping. */
export function mergePads(pads: readonly (PadInput | null)[]): PadInput {
  const buttons: boolean[] = [];
  const axes: number[] = [];
  for (const pad of pads) {
    if (!pad) continue;
    pad.buttons.forEach((down, i) => {
      buttons[i] = (buttons[i] ?? false) || down;
    });
    pad.axes.forEach((value, i) => {
      if (Math.abs(value) > Math.abs(axes[i] ?? 0)) axes[i] = value;
    });
  }
  return { buttons, axes };
}

function stickOf(axes: readonly number[], was: Direction | undefined): Direction | undefined {
  const x = axes[0] ?? 0;
  const y = axes[1] ?? 0;
  const along = (direction: Direction) =>
    direction === 'left' ? -x : direction === 'right' ? x : direction === 'up' ? -y : y;
  if (was !== undefined && along(was) >= STICK_OFF) return was;
  if (Math.max(Math.abs(x), Math.abs(y)) < STICK_ON) return undefined;
  return Math.abs(x) >= Math.abs(y) ? (x < 0 ? 'left' : 'right') : y < 0 ? 'up' : 'down';
}

const DPAD: readonly (readonly [Direction, number])[] = [
  ['up', BUTTONS.up],
  ['down', BUTTONS.down],
  ['left', BUTTONS.left],
  ['right', BUTTONS.right],
];

/** One frame: the commands it gives, and what to remember for the next. */
export function padStep(
  memory: PadMemory,
  input: PadInput,
  now: number,
): { memory: PadMemory; commands: PadCommand[] } {
  const commands: PadCommand[] = [];
  const pressed = (button: number) => (input.buttons[button] ?? false) && !(memory.down[button] ?? false);
  if (pressed(BUTTONS.a)) commands.push({ kind: 'press' });
  if (pressed(BUTTONS.b)) commands.push({ kind: 'back' });
  if (pressed(BUTTONS.lb)) commands.push({ kind: 'tab', step: -1 });
  if (pressed(BUTTONS.rb)) commands.push({ kind: 'tab', step: 1 });
  if (pressed(BUTTONS.start)) commands.push({ kind: 'start' });
  const stick = stickOf(input.axes, memory.stick);
  const direction = DPAD.find(([, button]) => input.buttons[button])?.[0] ?? stick;
  let held = memory.held;
  if (direction === undefined) held = undefined;
  else if (held === undefined || held.direction !== direction) {
    commands.push({ kind: 'move', direction });
    held = { direction, next: now + REPEAT_AFTER };
  } else if (now >= held.next) {
    commands.push({ kind: 'move', direction });
    held = { direction, next: now + REPEAT_EVERY };
  }
  return { memory: { down: input.buttons, stick, held }, commands };
}

/** Whether a frame shows the player using the pad: a button down or the stick past its dead zone. */
export const padActive = (input: PadInput): boolean =>
  input.buttons.some(Boolean) || input.axes.slice(0, 2).some((value) => Math.abs(value) >= STICK_ON);
