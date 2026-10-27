/**
 * Figures walked in a 2D space (M7.1, D83, docs/specs/2d-scenes.md#actors-in-a-2d-space): each in a
 * straight line to the mark the sim sends it to, at its actor's speed in art pixels a second, facing
 * the way it last walked; arriving, it is told to the sim as the crowd's are in 3D (npcTell.ts). It
 * plays walk as it moves and idle as it stands, when its sprite has them. No navmesh: nothing is in
 * the way in 2D.
 */
import type { NpcGoal } from '@eb/ui';
import type { Point } from './camera.ts';

/** How fast a figure walks when its actor doesn't say, in art pixels a second. */
export const SPEED_DEFAULT = 24;

export interface Walker {
  readonly actor: string;
  at: Point;
  /** The mark it is sent to, by path, and the place it stands. */
  goal?: string;
  target?: Point;
  /** The mark it reached last, said to the sim until heard. */
  arrived?: string;
  /** Mirrored: it last walked left. */
  flip: boolean;
  moving: boolean;
  readonly speed: number;
}

export function walkerOf(actor: string, placed: Point, speed: unknown, told: NpcGoal | undefined): Walker {
  const feet = told?.feet;
  return {
    actor,
    at: feet ? [feet[0], feet[1]] : placed,
    flip: told?.yaw !== undefined && told.yaw > 180,
    moving: false,
    speed: typeof speed === 'number' && speed > 0 ? speed : SPEED_DEFAULT,
  };
}

/** The sim's goal for it now: a new mark sets it walking, unless the sim already heard it arrive there. */
export function sendTo(walker: Walker, told: NpcGoal | undefined, places: ReadonlyMap<string, Point>): void {
  const goal = told?.goal;
  if (goal === walker.goal) return;
  walker.goal = goal;
  walker.target = goal === undefined ? undefined : places.get(goal);
  if (goal !== undefined && told?.arrived === goal) walker.target = undefined;
}

/** One frame of `dt` seconds: the walker moved along, and the mark it arrived at, if it did. */
export function stepWalker(walker: Walker, dt: number): string | undefined {
  const target = walker.target;
  if (!target) {
    walker.moving = false;
    return undefined;
  }
  const [dx, dy] = [target[0] - walker.at[0], target[1] - walker.at[1]];
  const far = Math.hypot(dx, dy);
  const step = walker.speed * dt;
  if (dx !== 0) walker.flip = dx < 0;
  if (far <= step) {
    walker.at = target;
    walker.target = undefined;
    walker.moving = false;
    walker.arrived = walker.goal;
    return walker.goal;
  }
  walker.at = [walker.at[0] + (dx / far) * step, walker.at[1] + (dy / far) * step];
  walker.moving = true;
  return undefined;
}
