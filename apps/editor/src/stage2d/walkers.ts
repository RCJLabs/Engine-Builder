/**
 * Figures walked in a 2D space (M7.1, D83, docs/specs/2d-scenes.md#actors-in-a-2d-space): each in a
 * straight line to the mark the sim sends it to, at its actor's speed in art pixels a second, facing
 * the way it last walked; arriving, it is told to the sim as the crowd's are in 3D (npcTell.ts). It
 * plays walk as it moves and idle as it stands, when its sprite has them. No navmesh: in a space
 * with no tilemap nothing is in the way. In one with a tilemap (M7.2, D84) it walks the four-way
 * route from its tile to the mark's, tile centre to tile centre, then on to the mark's own place;
 * with no route it stays where it is, and the sim never hears it arrive.
 */
import { gridOf, type PackTiles, route, type Tile } from '@eb/core';
import type { NpcGoal } from '@eb/ui';
import type { Point } from './camera.ts';
import { tileCentre, tileUnder } from './tilemap2d.ts';

/** How fast a figure walks when its actor doesn't say, in art pixels a second. */
export const SPEED_DEFAULT = 24;

export interface Walker {
  readonly actor: string;
  at: Point;
  /** The mark it is sent to, by path, and the place it stands. */
  goal?: string;
  target?: Point;
  /** The tile centres it passes on its way there, the next first, and its route as tiles (M7.2). */
  path: Point[];
  route?: readonly Tile[];
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
    path: [],
    moving: false,
    speed: typeof speed === 'number' && speed > 0 ? speed : SPEED_DEFAULT,
  };
}

/**
 * The sim's goal for it now: a new mark sets it walking, unless the sim already heard it arrive there;
 * across `tiles`, the space's tilemap, by its route.
 */
export function sendTo(
  walker: Walker,
  told: NpcGoal | undefined,
  places: ReadonlyMap<string, Point>,
  tiles?: PackTiles,
): void {
  const goal = told?.goal;
  if (goal === walker.goal) return;
  walker.goal = goal;
  walker.target = goal === undefined ? undefined : places.get(goal);
  walker.path = [];
  walker.route = undefined;
  if (goal !== undefined && told?.arrived === goal) walker.target = undefined;
  if (!tiles || goal === undefined || walker.target === undefined) return;
  const from = tileUnder(tiles, walker.at);
  const to = tiles.places[goal] ?? tileUnder(tiles, walker.target);
  const tiled = from && to ? route(gridOf(tiles), from, to) : null;
  if (!tiled) {
    walker.target = undefined;
    return;
  }
  walker.route = tiled;
  walker.path = tiled.slice(1).map((tile) => tileCentre(tiles, tile));
}

/** One frame of `dt` seconds: the walker moved along its path, and the mark it arrived at, if it did. */
export function stepWalker(walker: Walker, dt: number): string | undefined {
  let step = walker.speed * dt;
  for (;;) {
    const next = walker.path[0] ?? walker.target;
    if (!next) {
      walker.moving = false;
      return undefined;
    }
    const [dx, dy] = [next[0] - walker.at[0], next[1] - walker.at[1]];
    const far = Math.hypot(dx, dy);
    if (dx !== 0) walker.flip = dx < 0;
    if (far > step) {
      walker.at = [walker.at[0] + (dx / far) * step, walker.at[1] + (dy / far) * step];
      walker.moving = true;
      return undefined;
    }
    walker.at = next;
    step -= far;
    // A tile centre passed: on to the next with what is left of the frame's step.
    if (walker.path.length > 0) {
      walker.path.shift();
      continue;
    }
    walker.target = undefined;
    walker.moving = false;
    walker.arrived = walker.goal;
    return walker.goal;
  }
}
