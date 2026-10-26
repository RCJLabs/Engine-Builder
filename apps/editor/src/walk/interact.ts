/**
 * What the player can use (M5.9, D71, docs/specs/worldspaces.md#interact): the nearest interact
 * within reach of the body's middle and within a cone of the way the player faces, not taken. The
 * prompt shows it; Interact sends world/use for it. Plain arithmetic on the parts.
 */
import type { Vec3 } from '../spaces/vec.ts';
import { BODY } from './physics.ts';
import { isTaken, type UsePoint } from './solids.ts';

/** Metres from the body's middle to the object's. A first guess, until tried on a phone. */
export const REACH = 2;
/** Degrees either side of the way the player faces. */
export const CONE = 60;

/** Which way a yaw faces over the ground: 0 along −z, 90 along −x, as the walk turns. */
export const forwardOf = (yaw: number): [number, number] => {
  const r = (yaw * Math.PI) / 180;
  return [-Math.sin(r), -Math.cos(r)];
};

/**
 * The use the player faces, or none: the nearest in reach and in the cone, one with something to
 * come of it before one spent, so a body searched never hides another beside it (M6.4).
 */
export function facing(
  uses: readonly UsePoint[],
  feet: Vec3,
  yaw: number,
  taken: ReadonlySet<string>,
): UsePoint | undefined {
  const middle: Vec3 = [feet[0], feet[1] + BODY.height / 2, feet[2]];
  const [fx, fz] = forwardOf(yaw);
  const cos = Math.cos((CONE * Math.PI) / 180);
  let best: { use: UsePoint; d: number; spent: boolean } | undefined;
  for (const use of uses) {
    const [dx, dy, dz] = [use.center[0] - middle[0], use.center[1] - middle[1], use.center[2] - middle[2]];
    const d = Math.hypot(dx, dy, dz);
    if (d > REACH || isTaken(use.path, taken)) continue;
    const across = Math.hypot(dx, dz);
    // Right above or below the middle, it is faced whichever way the player turns.
    if (across > 0.05 && (dx * fx + dz * fz) / across < cos) continue;
    const spent = use.spent === true;
    if (!best || (spent === best.spent ? d < best.d : !spent)) best = { use, d, spent };
  }
  return best?.use;
}
