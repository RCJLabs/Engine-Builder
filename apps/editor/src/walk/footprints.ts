/**
 * What streams of a space (M5.10, D72, docs/specs/streaming.md#cells): each top-level object's
 * footprint, its place on x and z and how far anything of it reaches, and the placed records far
 * drawing needs, each where it stands in the world. Walked through prefabs and overrides as the
 * view draws them (build.ts) and the walk's parts are (solids.ts). Plain arithmetic.
 */
import {
  type Fields,
  isFields,
  overridden,
  passedOn,
  placedObjects,
  type SpaceJson,
  type SpaceObject,
} from '@eb/compiler';
import type { ModelCollider } from '@eb/schema';
import type { Footprint } from './cells.ts';
import { DEEPEST, type Frame, frameOf, type ModelOf, middleOf, pointIn, WORLD_FRAME, within } from './solids.ts';

/** A placed record, where it stands in the world, for the far drawing of its model. */
export interface Placement {
  /** The top-level object it is part of. */
  readonly top: string;
  readonly path: string;
  readonly key: string;
  readonly passed: readonly Fields[];
  readonly frame: Frame;
}

export interface Streamed {
  readonly footprints: readonly Footprint[];
  readonly placements: readonly Placement[];
  /** The top-level objects that are water's surfaces, which draw far as well (D72). */
  readonly water: ReadonlySet<string>;
}

/** What a model of no collider counts as, across, in its own metres (spec, question 4). */
const UNKNOWN = 1;

const largest = (v: readonly number[]) => Math.max(...v.map(Math.abs));

/** How far a model's collider reaches from its origin, in the model's own metres. */
function colliderReach(collider: ModelCollider | undefined): number {
  if (!collider) return UNKNOWN / 2;
  const [cx, cy, cz] = collider.center ?? [0, 0, 0];
  const centre = Math.hypot(cx, cy, cz);
  const r = collider.radius ?? 0;
  switch (collider.shape) {
    case 'box': {
      const [x, y, z] = collider.size ?? [0, 0, 0];
      return centre + Math.hypot(x, y, z) / 2;
    }
    case 'sphere':
      return centre + r;
    case 'capsule':
      return centre + Math.max(r, (collider.height ?? 0) / 2);
    case 'hull':
      return Math.max(UNKNOWN / 2, ...(collider.points ?? []).map(([x, y, z]) => Math.hypot(x, y, z)));
  }
}

export function streamedOf(space: SpaceJson, prefabs: ReadonlyMap<string, SpaceJson>, models: ModelOf): Streamed {
  const footprints: Footprint[] = [];
  const placements: Placement[] = [];
  const water = new Set<string>();
  for (const top of space.objects) {
    const origin = frameOf(top).at;
    let reach = 0;
    /** A part `radius` across from `centre`, all of it inside the top object's footprint. */
    const take = (centre: readonly number[], radius: number) => {
      const across = Math.hypot((centre[0] as number) - origin[0], (centre[2] as number) - origin[2]);
      reach = Math.max(reach, across + radius);
    };
    const walk = (
      object: SpaceObject,
      layers: readonly unknown[],
      parent: Frame,
      ids: readonly string[],
      depth: number,
    ) => {
      const seen = overridden(object, layers);
      const frame = within(parent, frameOf(seen));
      if (seen.shape !== undefined) {
        // Half its scaled box's diagonal: however it is turned, the shape is inside it.
        take(pointIn(frame, middleOf(seen)), Math.hypot(...frame.scale) / 2);
        return;
      }
      if (seen.record !== undefined) {
        const passed = passedOn(object, layers);
        const model = models(seen.record, passed);
        take(frame.at, colliderReach(model?.collider) * (model?.scale ?? 1) * largest(frame.scale));
        placements.push({ top: top.id, path: ids.join('/'), key: seen.record, passed, frame });
        return;
      }
      const prefab = seen.prefab === undefined ? undefined : prefabs.get(seen.prefab);
      if (!prefab || depth >= DEEPEST) {
        take(frame.at, (UNKNOWN / 2) * largest(frame.scale));
        return;
      }
      for (const inner of placedObjects(prefab, passedOn(object, layers))) {
        walk(inner.object, inner.layers, frame, [...ids, inner.object.id], depth + 1);
      }
    };
    walk(top, [], WORLD_FRAME, [top.id], 0);
    footprints.push({ id: top.id, at: [origin[0], origin[2]], reach });
    if (top.shape !== undefined && isFields(top.components?.water)) water.add(top.id);
  }
  return { footprints, placements, water };
}
