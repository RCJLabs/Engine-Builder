/**
 * The edits M5.2 adds to a space or prefab (D64, docs/specs/components.md), as plain functions over
 * its JSON: an object's components added, set and taken away; a placed record's fields changed
 * here; a placement's overrides of the objects inside what it places. Reverting an override takes
 * it out, and an override left empty goes with it, so a reverted placement is the line it was.
 */
import { type Fields, isFields, overridden, passedOn } from '@eb/compiler';
import type { TypeFile } from '@eb/schema';
import { getIn, newGroup, type Path, setIn, setInOrder } from '../forms/values.ts';
import type { SpaceJson, SpaceObject } from './spaceFile.ts';

/** An object's fields in the order a file lists them (spaceFile.ts), what an override can change among them. */
const ORDER = ['id', 'name', 'shape', 'prefab', 'record', 'at', 'turn', 'scale', 'color', 'components', 'overrides'];

/** Where, in a placement, an object inside what it places is overridden: `overrides` and its id, for each prefab down. */
export const overrideAt = (inside: readonly string[]): Path => inside.flatMap((id) => ['overrides', id]);

function changeOne(space: SpaceJson, id: string, change: (object: SpaceObject) => SpaceObject): SpaceJson {
  return { ...space, objects: space.objects.map((o) => (o.id === id ? change(o) : o)) };
}

/** Keys of an object or an override in the file's order; anything deeper, last. */
const orderAt = (at: Path) => (at.length === 0 || at[at.length - 2] === 'overrides' ? ORDER : []);

/** `object` with what is empty inside its overrides taken out, from the deepest on `path` up. */
function pruned(object: SpaceObject, path: Path): SpaceObject {
  let next: unknown = object;
  const start = path.indexOf('overrides');
  if (start < 0) return object;
  for (let end = path.length - 1; end > start; end--) {
    const at = path.slice(0, end);
    const node = getIn(next, at);
    if (isFields(node) && Object.keys(node).length === 0) next = setInOrder(next, at, undefined, orderAt);
  }
  const overrides = getIn(next, ['overrides']);
  if (isFields(overrides) && Object.keys(overrides).length === 0)
    next = setInOrder(next, ['overrides'], undefined, orderAt);
  return next as SpaceObject;
}

/** A component of `kind` on the object, its required fields given empty values: one a form can show. */
export function addComponent(space: SpaceJson, id: string, kind: string, file: TypeFile): SpaceJson {
  return changeOne(space, id, (object) =>
    object.components?.[kind] !== undefined
      ? object
      : (setInOrder(object, ['components', kind], newGroup(file.fields), orderAt) as SpaceObject),
  );
}

export function removeComponent(space: SpaceJson, id: string, kind: string): SpaceJson {
  return changeOne(space, id, (object) => {
    const rest = { ...(object.components ?? {}) };
    delete rest[kind];
    return setInOrder(object, ['components'], Object.keys(rest).length > 0 ? rest : undefined, orderAt) as SpaceObject;
  });
}

/** A field of one of the object's own components set, or taken out (undefined). */
export function setComponent(
  space: SpaceJson,
  id: string,
  kind: string,
  path: Path,
  next: unknown,
  file: TypeFile,
): SpaceJson {
  return changeOne(space, id, (object) => {
    const component = object.components?.[kind];
    if (component === undefined) return object;
    return setInOrder(object, ['components', kind], setIn(component, path, next, file), orderAt) as SpaceObject;
  });
}

/**
 * The placement `id`'s override at `path` under the object `inside` it names (none: the placement
 * itself, for a placed record's `overrides`), set, or reverted (undefined).
 */
export function setOverride(
  space: SpaceJson,
  id: string,
  inside: readonly string[],
  path: Path,
  next: unknown,
): SpaceJson {
  const full = [...overrideAt(inside), ...path];
  return changeOne(space, id, (object) => pruned(setInOrder(object, full, next, orderAt) as SpaceObject, full));
}

/** An object inside a placement as the placement shows it, and what this placement overrides of it. */
export interface Inside {
  /** With every layer laid over it, this placement's last. */
  readonly object: SpaceObject;
  /** The layers this placement's own `overrides` and the prefabs' pass on to what the object places. */
  readonly passed: readonly Fields[];
  /** This placement's override of it: what Revert takes back. */
  readonly here: Fields | undefined;
}

/** The object `inside` names under `placement`, a path of ids down through prefabs, or null when there is none. */
export function insideOf(
  placement: SpaceObject,
  prefabs: ReadonlyMap<string, SpaceJson>,
  inside: readonly string[],
): Inside | null {
  let object = placement;
  let layers: unknown[] = [];
  for (const id of inside) {
    const prefab = object.prefab === undefined ? undefined : prefabs.get(object.prefab);
    const child = prefab?.objects.find((o) => o.id === id);
    if (!child) return null;
    layers = passedOn(object, layers).map((layer) => layer[id]);
    object = child;
  }
  const here = inside.length === 0 ? undefined : getIn(placement, overrideAt(inside));
  return {
    object: overridden(object, layers),
    passed: passedOn(object, layers),
    here: isFields(here) ? here : undefined,
  };
}

/** What this placement changes of the record placed at `inside` (none: the placement itself), by field. */
export function recordOverridesHere(placement: SpaceObject, inside: readonly string[]): Fields {
  const here = getIn(placement, [...overrideAt(inside), 'overrides']);
  return isFields(here) ? here : {};
}
