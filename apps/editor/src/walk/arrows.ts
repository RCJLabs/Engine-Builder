/**
 * Arrows (M6.4, D76, docs/specs/combat.md#a-hit): a point loosed at the weapon's speed, raised for
 * the drop at its target's distance, and moved on the walk's fixed steps under gravity. Each step a
 * ray goes from where it was to where it is: the first body it meets is hit, a solid stops it, and it
 * is gone after 3 s. The ray is the caller's (Rapier's, in physics.ts); this is plain arithmetic.
 */
import { add, times, type Vec3 } from '../spaces/vec.ts';

export const ARROW_GRAVITY = 9.81;
export const ARROW_LIFE_S = 3;

export interface Arrow {
  /** Who loosed it, and the item it was loosed from. */
  readonly by: string;
  readonly weapon: string;
  readonly at: Vec3;
  readonly velocity: Vec3;
  readonly age: number;
}

/** What a ray met: an actor's body, or a solid. */
export type Met = { readonly toi: number; readonly actor?: string };

/** The velocity that sends an arrow from `from` at `speed` to land on `to`: aimed level, raised for the drop. */
export function aimedVelocity(from: Vec3, to: Vec3, speed: number): Vec3 {
  const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const across = Math.hypot(d[0], d[2]);
  const flight = Math.hypot(...d) / speed;
  // The drop over the flight, made up for by aiming that much higher.
  const rise = d[1] + 0.5 * ARROW_GRAVITY * flight * flight;
  const length = Math.hypot(across, rise) || 1;
  return [(d[0] / length) * speed, (rise / length) * speed, (d[2] / length) * speed];
}

export const loose = (by: string, weapon: string, from: Vec3, velocity: Vec3): Arrow => ({
  by,
  weapon,
  at: from,
  velocity,
  age: 0,
});

export interface ArrowStep {
  readonly flying: Arrow[];
  readonly hits: { readonly by: string; readonly weapon: string; readonly on: string }[];
  /** Where the arrows that stopped this step came to rest. */
  readonly stopped: Vec3[];
}

/** One step of `dt` seconds: `cast` finds what a ray from `from` along `dir` meets within `most`, its shooter left out. */
export function stepArrows(
  arrows: readonly Arrow[],
  dt: number,
  cast: (from: Vec3, dir: Vec3, most: number, by: string) => Met | null,
): ArrowStep {
  const flying: Arrow[] = [];
  const hits: ArrowStep['hits'] = [];
  const stopped: Vec3[] = [];
  for (const arrow of arrows) {
    const velocity: Vec3 = [arrow.velocity[0], arrow.velocity[1] - ARROW_GRAVITY * dt, arrow.velocity[2]];
    const move = times(velocity, dt);
    const most = Math.hypot(...move);
    const met = most > 0 ? cast(arrow.at, times(move, 1 / most), most, arrow.by) : null;
    if (met) {
      if (met.actor !== undefined) hits.push({ by: arrow.by, weapon: arrow.weapon, on: met.actor });
      stopped.push(add(arrow.at, times(move, met.toi / most)));
      continue;
    }
    const age = arrow.age + dt;
    if (age < ARROW_LIFE_S) flying.push({ ...arrow, at: add(arrow.at, move), velocity, age });
  }
  return { flying, hits, stopped };
}
