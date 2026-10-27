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

/**
 * One axis of an object's place, turn or scale set, the other two as the file holds them when the
 * edit lands: x, y and z typed one after another each keep the others', where a whole triple taken
 * from the form's last render put back an axis whose edit hadn't drawn yet (M6.6's CI found it).
 */
export function setAxis(space: SpaceJson, id: string, part: keyof Transform, axis: number, n: number): SpaceJson {
  return {
    ...space,
    objects: space.objects.map((o) => {
      if (o.id !== id) return o;
      const t = transformOf(o);
      return withTransform(o, { ...t, [part]: t[part].map((v, i) => (i === axis ? n : v)) as unknown as Vec3 });
    }),
  };
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

/** The space's own tags (M6.7): none left, none written. */
export function withSpaceTags(space: SpaceJson, tags: readonly string[]): SpaceJson {
  const { tags: _, ...rest } = space;
  return tags.length > 0 ? { ...rest, tags: [...tags] } : rest;
}

/** A 2D space's stage (M7.4): a file under stages/ that draws it, or none, when stage2d does. */
export function withSpaceStage(space: SpaceJson, stage: string | undefined): SpaceJson {
  const { stage: _, ...rest } = space;
  return stage === undefined ? rest : { ...rest, stage };
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

/** How far apart Add puts objects when the middle of the view is taken. */
const ADD_STEP = 1.5;

/** The first spot on the ground from `x`, `z` along x that no object stands on. */
export function freeSpot(space: SpaceJson, x: number, z: number): [number, number, number] {
  const taken = space.objects.map((o) => transformOf(o).at);
  for (let k = 0; ; k++) {
    const spot: [number, number, number] = [x + k * ADD_STEP, 0, z];
    if (!taken.some((at) => Math.abs(at[0] - spot[0]) < 0.5 && Math.abs(at[2] - spot[2]) < 0.5)) return spot;
  }
}

/** Whether the prefab `from` places `target`, itself or through others: placing it in `target` would loop (E061). */
export function places(prefabs: ReadonlyMap<string, SpaceJson>, from: string, target: string): boolean {
  const seen = new Set<string>();
  const walk = (id: string): boolean => {
    if (id === target) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return (prefabs.get(id)?.objects ?? []).some((o) => o.prefab !== undefined && walk(o.prefab));
  };
  return walk(from);
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
