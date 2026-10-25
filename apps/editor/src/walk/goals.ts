/**
 * Where each object of a space stands in the world (M6.2, D74, docs/specs/navigation.md#goals-and-arrivals):
 * the place a walk-to sends an NPC to, and the one each NPC was placed at, through prefabs and their
 * overrides as solids.ts places them. Plain arithmetic.
 */
import { overridden, passedOn, placedObjects, type SpaceJson, type SpaceObject } from '@eb/compiler';
import type { Vec3 } from '../spaces/vec.ts';
import { DEEPEST, type Frame, frameOf, WORLD_FRAME, within } from './solids.ts';

/** Every object's place by its path of ids: "stall/counter" inside a prefab. */
export function objectPlaces(space: SpaceJson, prefabs: ReadonlyMap<string, SpaceJson>): Map<string, Vec3> {
  const places = new Map<string, Vec3>();
  const walk = (
    object: SpaceObject,
    layers: readonly unknown[],
    parent: Frame,
    ids: readonly string[],
    depth: number,
  ) => {
    const seen = overridden(object, layers);
    const frame = within(parent, frameOf(seen));
    places.set(ids.join('/'), frame.at);
    const prefab = seen.record === undefined && seen.prefab !== undefined ? prefabs.get(seen.prefab) : undefined;
    if (!prefab || depth >= DEEPEST) return;
    for (const inner of placedObjects(prefab, passedOn(object, layers))) {
      walk(inner.object, inner.layers, frame, [...ids, inner.object.id], depth + 1);
    }
  };
  for (const object of space.objects) walk(object, [], WORLD_FRAME, [object.id], 0);
  return places;
}
