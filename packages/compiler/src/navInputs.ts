/**
 * What a space's navmesh is baked from (M6.2, D74, docs/specs/navigation.md#the-navmesh): every solid
 * that doesn't move, through prefabs and overrides, as the walk's solids.ts finds them, and the
 * terrain's heights. NPCs, zones and water are left out. The bake in the editor reads these, and
 * the hash of them is what a .nav file carries, so the compiler can say when one is stale (W147).
 *
 * The hash is over the solids as written, each with the chain of places and turns that reaches it,
 * not over where they end up: that would put sin and cos into the hash, and a browser's last bit
 * can differ from Node's.
 */
import { canonicalJson, fnv1a64 } from '@eb/core';
import { base64Of } from './audioFiles.ts';
import type { NavFileRead } from './navFiles.ts';
import { type Fields, isFields, overridden, passedOn, placedObjects } from './overrides.ts';
import { type ModelSources, modelHere } from './placedModels.ts';
import type { ProjectSource } from './source.ts';
import { terrainPath } from './spaceFiles.ts';
import { type SpaceJson, type SpaceObject, spaceSchema } from './spaceShape.ts';
import type { SpaceFileRead } from './spaces.ts';

/** The body every navmesh is baked for: the player's (apps/editor/src/walk/physics.ts), so the player can follow anywhere an NPC walks. */
export const NAV_AGENT = { radius: 0.35, height: 1.8, climb: 0.35, slope: 40 } as const;

/** Recast's cells, in metres; a space wider than `solo` metres bakes as tiles of `tile` cells. */
export const NAV_CELLS = { size: 0.15, height: 0.1, tile: 128, solo: 128 } as const;

/** The record type an NPC is placed as: it walks on the navmesh, so it isn't baked into it. */
const ACTOR = 'actor';
const DEEPEST = 8;

/** A placed record's model collider and scale, as this placement sees it, or null for none. */
export type NavModelOf = (
  key: string,
  passed: readonly Fields[],
) => { readonly collider?: unknown; readonly scale?: number } | null;

/** One part of a solid's place: an object's own, as written. */
export interface NavFrame {
  readonly at: readonly number[];
  readonly turn: readonly number[];
  readonly scale: readonly number[];
}

/** A solid as the bake reads it: the frames from the space down to it, and what makes it solid. */
export type NavSolid =
  | { readonly path: string; readonly frames: readonly NavFrame[]; readonly shape: string; readonly collider: Fields }
  | { readonly path: string; readonly frames: readonly NavFrame[]; readonly model: Fields; readonly scale: number };

const frameOf = (object: SpaceObject): NavFrame => ({
  at: object.at ?? [0, 0, 0],
  turn: object.turn ?? [0, 0, 0],
  scale: object.scale ?? [1, 1, 1],
});

/** The solids that don't move, depth first as the walk's partsOf finds them. */
export function navSolids(space: SpaceJson, prefabs: ReadonlyMap<string, SpaceJson>, models: NavModelOf): NavSolid[] {
  const solids: NavSolid[] = [];
  const walk = (
    object: SpaceObject,
    layers: readonly unknown[],
    frames: readonly NavFrame[],
    ids: readonly string[],
    depth: number,
  ) => {
    const seen = overridden(object, layers);
    const here = [...frames, frameOf(seen)];
    const path = ids.join('/');
    const collider = seen.components?.collider;
    if (isFields(collider) && collider.moves !== true) {
      solids.push({ path, frames: here, shape: seen.shape ?? 'box', collider });
    }
    if (seen.record !== undefined) {
      if (seen.record.startsWith(`${ACTOR}:`)) return;
      const model = models(seen.record, passedOn(object, layers));
      if (model && isFields(model.collider)) {
        solids.push({ path, frames: here, model: model.collider, scale: model.scale ?? 1 });
      }
      return;
    }
    const prefab = seen.prefab === undefined ? undefined : prefabs.get(seen.prefab);
    if (!prefab || depth >= DEEPEST) return;
    for (const inner of placedObjects(prefab, passedOn(object, layers))) {
      walk(inner.object, inner.layers, here, [...ids, inner.object.id], depth + 1);
    }
  };
  for (const object of space.objects) walk(object, [], [], [object.id], 0);
  return solids;
}

/** Everything a bake reads, as one value: the agent, the cells, the solids and the terrain. */
export function navInputs(
  space: SpaceJson,
  prefabs: ReadonlyMap<string, SpaceJson>,
  models: NavModelOf,
  heights: Uint8Array | undefined,
): unknown {
  const terrain = space.terrain;
  return {
    agent: NAV_AGENT,
    cells: NAV_CELLS,
    solids: navSolids(space, prefabs, models),
    terrain: terrain
      ? {
          size: terrain.size,
          spacing: terrain.spacing,
          low: terrain.low,
          high: terrain.high,
          heights: heights ? fnv1a64(base64Of(heights)) : null,
        }
      : null,
  };
}

/** The hash a .nav file carries: 16 hex digits. */
export const navInputsHash = (...args: Parameters<typeof navInputs>): string =>
  fnv1a64(canonicalJson(navInputs(...args)));

/** A placed record's model collider and scale, through the model it draws as (M5.5's modelHere). */
export function navModelsOf(sources: ModelSources): NavModelOf {
  return (key, passed) => {
    const model = modelHere(key, passed, sources);
    if (!model) return null;
    const { collider, scale } = model.value;
    return { ...(collider !== undefined ? { collider } : {}), ...(typeof scale === 'number' ? { scale } : {}) };
  };
}

/**
 * The inputs' hash of each space a navmesh is beside, as a bake would work it out now. None while
 * any space or prefab isn't sound: E058 says what is wrong, and a hash of half a space means nothing.
 */
export async function navHashes(
  source: ProjectSource,
  files: readonly SpaceFileRead[],
  navs: readonly NavFileRead[],
  models: NavModelOf,
): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  if (navs.length === 0 || files.some((read) => !spaceSchema.safeParse(read.value).success)) return hashes;
  const of = (kind: 'space' | 'prefab') =>
    new Map(files.filter((read) => read.kind === kind).map((read) => [read.id, read.value as SpaceJson]));
  const spaces = of('space');
  const prefabs = of('prefab');
  for (const { id } of navs) {
    const space = spaces.get(id);
    if (!space) continue;
    const heights = space.terrain ? await source.read(terrainPath(id, 'heights')) : undefined;
    hashes.set(id, navInputsHash(space, prefabs, models, heights));
  }
  return hashes;
}
