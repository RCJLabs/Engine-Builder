/**
 * Where each object of a 2D space stands (M7.1, D83; M7.2, D84), through its prefabs and their
 * overrides: a placement moves what it places by its `at` and scales it by its `scale`, and nothing
 * turns in 2D. The 2D stage reads it for its walkers' marks, and the compiler for which tile each
 * object stands on. Kept apart from the checks, so the stage reads it without their schemas.
 */
import { isFields, overridden, passedOn, placedObjects } from './overrides.ts';
import type { SpaceJson, SpaceObject } from './spaceShape.ts';

export type Point = readonly [number, number];

/** An object's place, depth and scale as placed. */
export interface FlatPlace {
  readonly at: Point;
  readonly depth: number;
  readonly scale: Point;
}

const DEEPEST = 8;
const ORIGIN: FlatPlace = { at: [0, 0], depth: 0, scale: [1, 1] };

export const placeIn = (parent: FlatPlace, object: SpaceObject): FlatPlace => {
  const [x, y, d] = object.at ?? [0, 0, 0];
  const [sx, sy] = object.scale ?? [1, 1, 1];
  return {
    at: [parent.at[0] + x * parent.scale[0], parent.at[1] + y * parent.scale[1]],
    depth: parent.depth + d,
    scale: [parent.scale[0] * sx, parent.scale[1] * sy],
  };
};

/**
 * Each object as placed, through its prefabs, in the file's order: its path ("gate/bell" inside a
 * prefab), the object as its overrides leave it, its place, and what it passes on to what it places.
 */
export function eachFlat(
  space: SpaceJson,
  prefabs: Readonly<Record<string, unknown>>,
  visit: (path: string, seen: SpaceObject, place: FlatPlace, passed: ReturnType<typeof passedOn>) => void,
): void {
  const walk = (object: SpaceObject, layers: readonly unknown[], ids: string[], parent: FlatPlace, depth: number) => {
    const seen = overridden(object, layers);
    const passed = passedOn(object, layers);
    const place = placeIn(parent, seen);
    visit(ids.join('/'), seen, place, passed);
    const prefab = seen.prefab === undefined ? undefined : prefabs[seen.prefab];
    if (!isFields(prefab) || depth >= DEEPEST) return;
    for (const inner of placedObjects(prefab as unknown as SpaceJson, passed))
      walk(inner.object, inner.layers, [...ids, inner.object.id], place, depth + 1);
  };
  for (const object of space.objects) walk(object, [], [object.id], ORIGIN, 0);
}

/** Where each object stands, by path, for a walker's goal: placed objects drawn or not. */
export function flatPlacesOf(space: SpaceJson, prefabs: Readonly<Record<string, unknown>>): Map<string, Point> {
  const places = new Map<string, Point>();
  eachFlat(space, prefabs, (path, _seen, place) => places.set(path, place.at));
  return places;
}
