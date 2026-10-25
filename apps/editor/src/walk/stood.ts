/**
 * Where the player stands, told to the sim (M5.9, D71, docs/specs/worldspaces.md#world-at): as the
 * shell pauses and the page hides, before each use, and every 5 s once the player has moved 0.5 m
 * since the last. Each is a step, so each makes a save. Plain functions of the clock and the feet.
 */
import type { Action } from '@eb/core';
import type { Vec3 } from '../spaces/vec.ts';

export const EVERY_MS = 5000;
export const MOVED_M = 0.5;

export interface Told {
  readonly feet: Vec3;
  readonly time: number;
}

/** Due when it has been long enough and the player has moved far enough since the last told. */
export const dueAt = (last: Told, feet: Vec3, now: number): boolean =>
  now - last.time >= EVERY_MS &&
  Math.hypot(feet[0] - last.feet[0], feet[1] - last.feet[1], feet[2] - last.feet[2]) >= MOVED_M;

const cm = (n: number) => Math.round(n * 100) / 100;

/** The action, to the centimetre and the tenth of a degree, the yaw in 0 to 360, as the sim keeps it. */
export function standing(space: string, feet: Vec3, yaw: number): Action {
  const turned = Math.round((((yaw % 360) + 360) % 360) * 10) / 10;
  return { type: 'world/at', space, feet: [cm(feet[0]), cm(feet[1]), cm(feet[2])], yaw: turned === 360 ? 0 : turned };
}
