/**
 * Placements' overrides (M5.2, D64, docs/specs/components.md#prefab-overrides), as plain functions
 * over the files' JSON for the checks and the editor's view. An object inside a prefab is seen
 * through layers: what each placement on the way to it overrides, innermost first. A layer's place
 * and looks replace the object's; its components merge kind by kind, field by field; and its own
 * `overrides` pass on to what the object places.
 */
import type { SpaceJson, SpaceObject } from './spaceShape.ts';

export type Fields = Readonly<Record<string, unknown>>;

export const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What an override replaces whole. */
const REPLACED = ['name', 'at', 'turn', 'scale', 'shape', 'color'] as const;

/** Components with `over`'s laid on them: a kind's fields replace the base's one by one, and a kind it lacks is added. */
export function mergeComponents(base: unknown, over: unknown): Record<string, Fields> | undefined {
  const merged: Record<string, Fields> = isFields(base) ? { ...(base as Record<string, Fields>) } : {};
  if (isFields(over)) {
    for (const [kind, fields] of Object.entries(over)) {
      if (isFields(fields)) merged[kind] = { ...(isFields(merged[kind]) ? merged[kind] : {}), ...fields };
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** The object with each layer laid over it, innermost first; its own `overrides` stay its own. */
export function overridden(object: SpaceObject, layers: readonly unknown[]): SpaceObject {
  let next: Record<string, unknown> = object as unknown as Record<string, unknown>;
  for (const layer of layers) {
    if (!isFields(layer)) continue;
    next = { ...next };
    for (const key of REPLACED) if (layer[key] !== undefined) next[key] = layer[key];
    if (layer.components !== undefined) {
      const components = mergeComponents(next.components, layer.components);
      if (components) next.components = components;
    }
  }
  return next as unknown as SpaceObject;
}

/** What a placement passes on to what it places: its own overrides, then each layer's, innermost first. */
export function passedOn(object: SpaceObject, layers: readonly unknown[]): Fields[] {
  return [object.overrides, ...layers.map((layer) => (isFields(layer) ? layer.overrides : undefined))].filter(isFields);
}

/** A prefab's objects as one placement of it sees them: each with the layers that reach it, by its id. */
export function placedObjects(
  prefab: SpaceJson,
  passed: readonly Fields[],
): { object: SpaceObject; layers: unknown[] }[] {
  return prefab.objects.map((object) => ({ object, layers: passed.map((layer) => layer[object.id]) }));
}

/** A placed record's fields as they stand here: the record's own, each override replacing one whole. */
export function recordHere(value: unknown, passed: readonly Fields[]): Record<string, unknown> {
  return Object.assign({}, isFields(value) ? value : {}, ...passed);
}

/** Every object a placement shows, depth first, with the path of ids that leads to it: what the view and W142 walk. */
export function eachPlaced(
  object: SpaceObject,
  prefabs: ReadonlyMap<string, SpaceJson>,
  visit: (seen: SpaceObject, ids: readonly string[]) => void,
  deepest = 8,
): void {
  const walk = (o: SpaceObject, layers: readonly unknown[], ids: readonly string[], depth: number) => {
    const seen = overridden(o, layers);
    visit(seen, ids);
    const prefab = o.prefab === undefined ? undefined : prefabs.get(o.prefab);
    if (!prefab || depth >= deepest) return;
    for (const inner of placedObjects(prefab, passedOn(o, layers))) {
      walk(inner.object, inner.layers, [...ids, inner.object.id], depth + 1);
    }
  };
  walk(object, [], [object.id], 0);
}
