/**
 * Picking and moving in the 2D view as plain values (M7.1, D83, docs/specs/2d-scenes.md#the-editor):
 * the object under a point, by the box of its sprite's frame as last drawn, the nearest first; a
 * layer that repeats across the view is under every point of its rows. What is picked is the
 * top-level object, a prefab's placement for what it places. A drag or an arrow key moves the
 * chosen in whole art pixels, their depths kept.
 */

import type { Transform } from '../spaces/gizmoMath.ts';
import { type SpaceJson, transformOf } from '../spaces/spaceFile.ts';
import type { Point } from '../stage2d/camera.ts';
import type { Drawn } from '../stage2d/draw.ts';

/** The object a path is under at the top of the file: "gate" for "gate/bell". */
export const topOf = (path: string): string => path.split('/')[0] as string;

/** The top-level object under a point of the canvas, in art pixels from its top-left, or null. */
export function pickAt(drawn: readonly Drawn[], repeats: ReadonlySet<string>, at: Point): string | null {
  for (let i = drawn.length - 1; i >= 0; i--) {
    const { path, box } = drawn[i] as Drawn;
    const down = at[1] >= box.y && at[1] < box.y + box.h;
    const across = repeats.has(path) || (at[0] >= box.x && at[0] < box.x + box.w);
    if (down && across) return topOf(path);
  }
  return null;
}

/** The whole art pixels a drag has moved by, between two world points. */
export const dragBy = (from: Point, to: Point): Point => [Math.round(to[0] - from[0]), Math.round(to[1] - from[1])];

/** The chosen objects' places moved by `by` and kept to whole pixels, each depth as it was. */
export function movedBy(space: SpaceJson, ids: readonly string[], by: Point): Map<string, Transform> {
  const places = new Map<string, Transform>();
  for (const object of space.objects) {
    if (!ids.includes(object.id)) continue;
    const t = transformOf(object);
    places.set(object.id, { ...t, at: [Math.round(t.at[0] + by[0]), Math.round(t.at[1] + by[1]), t.at[2]] });
  }
  return places;
}

const ARROWS: Readonly<Record<string, Point>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

/** An arrow key's move: a pixel, or 8 with Shift; null for any other key. */
export function nudgeOf(key: string, shift: boolean): Point | null {
  const way = ARROWS[key];
  if (!way) return null;
  const by = shift ? 8 : 1;
  return [way[0] * by, way[1] * by];
}
