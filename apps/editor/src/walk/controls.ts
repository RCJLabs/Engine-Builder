/**
 * The walk's inputs as one intent a frame (M5.8, D70, docs/specs/movement.md#controls): keys and the
 * mouse, a pad, and touch, merged, the strongest push winning. Plain functions of what is held.
 */
import type { Push } from './stick.ts';

export interface Intent {
  /** Right and forward, each -1 to 1, together at most 1 long. */
  readonly move: readonly [number, number];
  readonly run: boolean;
  /** Held this frame; the walk jumps when it is on the ground. */
  readonly jump: boolean;
  /** Interact held this frame (M5.9): pressed, the walk uses what the player faces. */
  readonly use: boolean;
  /** Attack held this frame (M6.4): it swings, and swings again as the last recovers while held. */
  readonly attack: boolean;
  /** How far to turn, in degrees: left is positive yaw, up positive pitch. */
  readonly look: readonly [number, number];
}

export const MOUSE_DEGREES = 0.25;
export const TOUCH_DEGREES = 0.3;
export const PAD_LOOK = 150;
/** A pad's stick under this is at rest; past PAD_RUN it runs. */
export const PAD_DEAD = 0.15;
export const PAD_RUN = 0.9;

const FORWARD = ['KeyW', 'ArrowUp'];
const BACK = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const RUN = ['ShiftLeft', 'ShiftRight'];
const JUMP = ['Space'];
const USE = ['KeyE'];
const ATTACK = ['KeyF'];

/** The keys the walk takes, by KeyboardEvent.code: the page does nothing else with them while it has focus. */
export const WALK_KEYS: ReadonlySet<string> = new Set([
  ...FORWARD,
  ...BACK,
  ...LEFT,
  ...RIGHT,
  ...RUN,
  ...JUMP,
  ...USE,
  ...ATTACK,
]);

export interface Held {
  /** KeyboardEvent.code of each key held. */
  readonly keys: ReadonlySet<string>;
  /** The pad's axes and whether A, X and the right trigger (M6.4) are down, when one is connected. */
  readonly pad?: { readonly axes: readonly number[]; readonly a: boolean; readonly x?: boolean; readonly rt?: boolean };
  /** The touch stick's push. */
  readonly stick?: Push;
  /** The jump button held. */
  readonly jumpButton?: boolean;
  /** The touch Attack button held, or the mouse's button with the pointer locked (M6.4). */
  readonly attackButton?: boolean;
  readonly click?: boolean;
  /** Mouse or touch look since the last frame, in pixels, and which. */
  readonly drag?: { readonly x: number; readonly y: number; readonly by: 'mouse' | 'touch' };
}

const any = (held: ReadonlySet<string>, codes: readonly string[]) => codes.some((code) => held.has(code));

/** A push held to the unit circle. */
function clamp([x, y]: readonly [number, number]): [number, number] {
  const d = Math.hypot(x, y);
  return d > 1 ? [x / d, y / d] : [x, y];
}

/** A pad's stick past its dead zone, its y flipped to forward, and how far it is pushed. */
function padStick(x: number, y: number): { push: [number, number]; strength: number } {
  const strength = Math.min(1, Math.hypot(x, y));
  if (strength < PAD_DEAD) return { push: [0, 0], strength: 0 };
  return { push: clamp([x, -y]), strength };
}

/** The intent of what is held, `dt` seconds since the last frame (the pad's look turns by time). */
export function intentOf(held: Held, dt: number): Intent {
  const keys: [number, number] = [
    (any(held.keys, RIGHT) ? 1 : 0) - (any(held.keys, LEFT) ? 1 : 0),
    (any(held.keys, FORWARD) ? 1 : 0) - (any(held.keys, BACK) ? 1 : 0),
  ];
  const pad = held.pad
    ? padStick(held.pad.axes[0] ?? 0, held.pad.axes[1] ?? 0)
    : { push: [0, 0] as [number, number], strength: 0 };
  const stick: [number, number] = held.stick ? [held.stick.x, held.stick.y] : [0, 0];
  const pushes = [clamp(keys), pad.push, stick];
  let move: [number, number] = [0, 0];
  for (const p of pushes) if (Math.hypot(p[0], p[1]) > Math.hypot(move[0], move[1])) move = p;
  const run = any(held.keys, RUN) || pad.strength > PAD_RUN || held.stick?.run === true;
  const jump = any(held.keys, JUMP) || held.pad?.a === true || held.jumpButton === true;
  const use = any(held.keys, USE) || held.pad?.x === true;
  const attack = any(held.keys, ATTACK) || held.pad?.rt === true || held.attackButton === true || held.click === true;
  const look: [number, number] = [0, 0];
  if (held.drag) {
    const k = held.drag.by === 'mouse' ? MOUSE_DEGREES : TOUCH_DEGREES;
    look[0] -= held.drag.x * k;
    look[1] -= held.drag.y * k;
  }
  if (held.pad) {
    const right = padStick(held.pad.axes[2] ?? 0, held.pad.axes[3] ?? 0);
    look[0] -= right.push[0] * PAD_LOOK * dt;
    look[1] += right.push[1] * PAD_LOOK * dt;
  }
  return { move, run, jump, use, attack, look };
}
