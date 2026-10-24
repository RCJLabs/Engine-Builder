/**
 * The character's motion between fixed steps (M5.8, D70, docs/specs/movement.md#the-stage): what it
 * asks to move by, from its intent, its facing and its fall; the controller then moves it as far as
 * the world lets it. The numbers are the spec's, untested for feel until a phone has walked the trail.
 */
import type { Vec3 } from '../spaces/vec.ts';
import type { Intent } from './controls.ts';

export const WALK = 2.5;
export const RUN = 5;
export const GRAVITY = 18;
export const JUMP = 6;
export const STEP = 1 / 60;
/** Most fixed steps a frame: a slow frame falls behind rather than freezing the page. */
export const MOST_STEPS = 5;
/** The fall the walk keeps on the ground, so the controller's snap finds it going down a slope. */
const PRESS = 1;

export interface Fall {
  /** Up is positive, in m/s. */
  readonly vy: number;
  readonly grounded: boolean;
}

export const STANDING: Fall = { vy: 0, grounded: true };

const RAD = Math.PI / 180;

/** The intent's push turned to the world: forward along the yaw, right across it. */
export function pushed(intent: Intent, yaw: number): readonly [number, number] {
  const [right, forward] = intent.move;
  const y = yaw * RAD;
  const f: [number, number] = [-Math.sin(y), -Math.cos(y)];
  const r: [number, number] = [Math.cos(y), -Math.sin(y)];
  return [f[0] * forward + r[0] * right, f[1] * forward + r[1] * right];
}

/** One step's asked movement and the fall after it: a jump only from the ground. */
export function stepOf(intent: Intent, yaw: number, fall: Fall, dt = STEP): { delta: Vec3; vy: number } {
  const speed = intent.run ? RUN : WALK;
  const [x, z] = pushed(intent, yaw);
  let vy = fall.vy;
  if (fall.grounded) vy = intent.jump ? JUMP : -PRESS;
  else vy -= GRAVITY * dt;
  return { delta: [x * speed * dt, vy * dt, z * speed * dt], vy };
}

/**
 * The fall after the controller moved it: on the ground, none; rising, stopped by a ceiling when it
 * moved up less than it asked.
 */
export function fallAfter(vy: number, asked: number, moved: number, grounded: boolean): Fall {
  if (grounded && vy <= 0) return { vy: 0, grounded: true };
  if (vy > 0 && moved < asked * 0.5) return { vy: 0, grounded };
  return { vy, grounded };
}

/** How many fixed steps a frame of `elapsed` seconds takes, with what carries over. */
export function stepsFor(carried: number, elapsed: number): { steps: number; carried: number } {
  const total = carried + Math.max(0, elapsed);
  const steps = Math.min(MOST_STEPS, Math.floor(total / STEP));
  // A frame past the most drops what it couldn't step, so the next doesn't try to catch up.
  return { steps, carried: steps === MOST_STEPS ? 0 : total - steps * STEP };
}
