/**
 * Where Bake map looks from (M6.6, D78, docs/specs/markers.md#baking), as plain functions: the ground
 * it covers, the terrain's or the objects' boxes with 4 m round, squared up; and the height it looks
 * down from, high over a terrain, or 2.4 m over the highest spawn point of a space without one, so an
 * interior shows its floor and not its roof.
 */
import type { SpaceJson } from '@eb/compiler';
import type { Box } from '../spaces/bounds.ts';
import { extentOf } from '../terrain/grid.ts';
import { squareRound } from '../walk/mapPins.ts';

/** A map is this many pixels on its longer side, and its ground is square. */
export const MAP_PIXELS = 1024;
/** How far over the highest spawn point a space without terrain is cut. */
export const CUT_ABOVE_SPAWN = 2.4;
/** How far over the highest thing a camera looking at the whole of a terrain stands. */
const CLEAR = 10;

export interface MapShot {
  /** [least x, least z, most x, most z] in metres. */
  readonly bounds: readonly [number, number, number, number];
  /** The camera's height: nothing above it is drawn. */
  readonly top: number;
  readonly pixels: number;
}

/** The shot of a space, from the boxes its objects draw as and its spawn points' heights. */
export function shotOf(space: SpaceJson, boxes: readonly Box[], spawns: readonly number[]): MapShot {
  const highest = boxes.length === 0 ? 0 : Math.max(...boxes.map((b) => b.max[1]));
  const terrain = space.terrain;
  if (terrain) {
    const e = extentOf(terrain);
    return { bounds: [-e, -e, e, e], top: Math.max(terrain.high, highest) + CLEAR, pixels: MAP_PIXELS };
  }
  const corners = boxes.flatMap((b): [number, number][] => [
    [b.min[0], b.min[2]],
    [b.max[0], b.max[2]],
  ]);
  const top = spawns.length > 0 ? Math.max(...spawns) + CUT_ABOVE_SPAWN : highest + CLEAR;
  return { bounds: squareRound(corners), top, pixels: MAP_PIXELS };
}

/** Where a point of the ground falls on the map's image, in pixels from its top left: north, -z, is up. */
export function pixelOf(shot: Pick<MapShot, 'bounds' | 'pixels'>, x: number, z: number): [number, number] {
  const [x0, z0, x1, z1] = shot.bounds;
  return [((x - x0) / (x1 - x0)) * shot.pixels, ((z - z0) / (z1 - z0)) * shot.pixels];
}
