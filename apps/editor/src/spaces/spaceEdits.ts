/**
 * What the Scene panel does to a space or prefab (M5.1, docs/specs/viewport.md): objects added,
 * placed, changed, renamed, deleted and grouped into a prefab, as plain functions of the file's
 * value; then the file changes each makes, for the editor's undo.
 */
import type { ProjectSource } from '@eb/compiler';
import type { FileChange } from '../editing/history.ts';
import type { Transform } from './gizmoMath.ts';
import { tidy } from './snap.ts';
import {
  changeSpaceText,
  freeId,
  type SpaceJson,
  type SpaceObject,
  spaceText,
  transformOf,
  withTransform,
} from './spaceFile.ts';
import type { Vec3 } from './vec.ts';

const ids = (space: SpaceJson) => new Set(space.objects.map((o) => o.id));

/** The object added last, its id made free in the file from `object.id`. */
export function addObject(space: SpaceJson, object: SpaceObject): { space: SpaceJson; id: string } {
  const id = freeId(ids(space), object.id);
  return { space: { ...space, objects: [...space.objects, { ...object, id }] }, id };
}

/** Each object named in `places` at its new place, turn and scale. */
export function placeObjects(space: SpaceJson, places: ReadonlyMap<string, Transform>): SpaceJson {
  return {
    ...space,
    objects: space.objects.map((o) => {
      const place = places.get(o.id);
      return place ? withTransform(o, place) : o;
    }),
  };
}

export const deleteObjects = (space: SpaceJson, gone: ReadonlySet<string>): SpaceJson => ({
  ...space,
  objects: space.objects.filter((o) => !gone.has(o.id)),
});

/** One object changed: `patch`'s fields set, an undefined one taken away. */
export function changeObject(space: SpaceJson, id: string, patch: Partial<SpaceObject>): SpaceJson {
  return {
    ...space,
    objects: space.objects.map((o) => {
      if (o.id !== id) return o;
      const next: Record<string, unknown> = { ...o, ...patch };
      for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key];
      return next as SpaceObject;
    }),
  };
}

/** Its name: none when typed as nothing or as its id, which the outliner shows anyway. */
export function renameObject(space: SpaceJson, id: string, typed: string): SpaceJson {
  const name = typed.trim().slice(0, 80);
  return changeObject(space, id, { name: name === '' || name === id ? undefined : name });
}

/**
 * The chosen objects made into a prefab around their centre, on the ground beneath it, and one
 * placement of it where they were, in the place of the first of them.
 */
export function groupObjects(
  space: SpaceJson,
  chosen: ReadonlySet<string>,
  prefab: { readonly id: string; readonly name: string },
): { space: SpaceJson; prefab: SpaceJson; placement: string } {
  const grouped = space.objects.filter((o) => chosen.has(o.id));
  const places = grouped.map((o) => transformOf(o).at);
  const mid = (i: number) =>
    (Math.min(...places.map((p) => p[i] as number)) + Math.max(...places.map((p) => p[i] as number))) / 2;
  const centre: Vec3 = [tidy(mid(0)), tidy(Math.min(...places.map((p) => p[1]))), tidy(mid(2))];
  const inside = grouped.map((o) => {
    const t = transformOf(o);
    return withTransform(o, { ...t, at: [t.at[0] - centre[0], t.at[1] - centre[1], t.at[2] - centre[2]] });
  });
  const others = space.objects.filter((o) => !chosen.has(o.id));
  const placement = freeId(new Set(others.map((o) => o.id)), prefab.id);
  const placed = withTransform({ id: placement, prefab: prefab.id }, { at: centre, turn: [0, 0, 0], scale: [1, 1, 1] });
  const first = space.objects.findIndex((o) => chosen.has(o.id));
  const objects = space.objects.flatMap((o, i) => (i === first ? [placed] : chosen.has(o.id) ? [] : [o]));
  return { space: { ...space, objects }, prefab: { name: prefab.name, objects: inside }, placement };
}

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** The change to `path` that `change` makes, or none when the file is missing, isn't a space, or stays the same. */
export async function changeSpaceFile(
  source: ProjectSource,
  path: string,
  change: (space: SpaceJson) => SpaceJson,
): Promise<FileChange[]> {
  const before = await source.read(path);
  if (!before) return [];
  const text = decode(before);
  const after = changeSpaceText(text, change);
  return after === null || after === text ? [] : [{ path, before, after: encode(after) }];
}

/** A new file at `path`, unless one is there. */
export async function createSpaceFile(source: ProjectSource, path: string, space: SpaceJson): Promise<FileChange[]> {
  if (await source.read(path)) return [];
  return [{ path, before: null, after: encode(spaceText(space)) }];
}
