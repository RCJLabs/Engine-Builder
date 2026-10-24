/**
 * Which placed objects draw as models (M5.5, D67, docs/specs/models.md#placing-and-drawing), as
 * plain functions the view, the space's live copy and the pack's world (M5.8) share: a placed model record, as its placement
 * overrides it, or a placed record of a type whose first top-level field referring to `model` alone
 * names one. Placements are walked as the view walks them, through prefabs and their overrides.
 */

import { MODEL, type TypeFile } from '@eb/schema';
import { type Fields, isFields, overridden, passedOn, placedObjects, recordHere } from './overrides.ts';
import type { SpaceJson, SpaceObject } from './spaceShape.ts';

/** How deep placements inside placements are walked, as the view draws them. */
const DEEPEST = 8;

/** The first top-level field of a type that refers to model records and nothing else, or null. */
export function modelFieldOf(file: TypeFile): string | null {
  for (const [name, def] of Object.entries(file.fields)) {
    if (def.kind !== 'ref') continue;
    const to = typeof def.to === 'string' ? [def.to] : def.to;
    if (to.length === 1 && to[0] === MODEL) return name;
  }
  return null;
}

/** What the walk needs to know of the project: each record's value and each type's model field. */
export interface ModelSources {
  /** A record's value by "type:id", undefined when there is none. */
  readonly record: (key: string) => unknown;
  /** The type's model field, or null when its records don't draw as models. */
  readonly field: (type: string) => string | null;
}

/**
 * The model record a placed record draws as, its value as this placement sees it: the model's own
 * with the placement's overrides for a placed model, or the model a record's field names. Null when
 * it draws as M5.2's marker.
 */
export function modelHere(
  key: string,
  passed: readonly Fields[],
  sources: ModelSources,
): { readonly id: string; readonly value: Record<string, unknown> } | null {
  const colon = key.indexOf(':');
  const [type, id] = [key.slice(0, colon), key.slice(colon + 1)];
  if (type === MODEL) {
    const own = sources.record(key);
    return own === undefined ? null : { id, value: recordHere(own, passed) };
  }
  const field = sources.field(type);
  const named = field === null ? undefined : recordHere(sources.record(key), passed)[field];
  if (typeof named !== 'string') return null;
  const own = sources.record(`${MODEL}:${named}`);
  return own === undefined ? null : { id: named, value: recordHere(own, []) };
}

/** Each placed record a space shows, with what its placement passes on, depth first as the view draws. */
export function eachPlacedRecord(
  space: SpaceJson,
  prefabs: ReadonlyMap<string, SpaceJson>,
  visit: (key: string, passed: readonly Fields[]) => void,
): void {
  const walk = (object: SpaceObject, layers: readonly unknown[], depth: number) => {
    const seen = overridden(object, layers);
    if (seen.record !== undefined) return visit(seen.record, passedOn(object, layers));
    const prefab = seen.prefab === undefined ? undefined : prefabs.get(seen.prefab);
    if (!prefab || depth >= DEEPEST) return;
    for (const inner of placedObjects(prefab, passedOn(object, layers))) walk(inner.object, inner.layers, depth + 1);
  };
  for (const object of space.objects) walk(object, [], 0);
}

/** The keys of every record a space places, through its prefabs, sorted. */
export function placedKeys(space: SpaceJson, prefabs: ReadonlyMap<string, SpaceJson>): string[] {
  const keys = new Set<string>();
  eachPlacedRecord(space, prefabs, (key) => keys.add(key));
  return [...keys].sort();
}

/**
 * What drawing a space's models needs: the files they name and the material records their slots
 * name. `also` are records drawn as models though nothing places them: the foliage's (M5.6).
 */
export function modelNeeds(
  space: SpaceJson,
  prefabs: ReadonlyMap<string, SpaceJson>,
  sources: ModelSources,
  also: readonly string[] = [],
): { readonly files: string[]; readonly materials: string[] } {
  const files = new Set<string>();
  const materials = new Set<string>();
  const visit = (key: string, passed: readonly Fields[]) => {
    const model = modelHere(key, passed, sources);
    if (!model) return;
    if (typeof model.value.file === 'string') files.add(model.value.file);
    const slots = Array.isArray(model.value.materials) ? model.value.materials : [];
    for (const slot of slots) if (isFields(slot) && typeof slot.material === 'string') materials.add(slot.material);
  };
  eachPlacedRecord(space, prefabs, visit);
  for (const key of also) visit(key, []);
  return { files: [...files].sort(), materials: [...materials].sort() };
}
