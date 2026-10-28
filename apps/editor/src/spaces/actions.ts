/**
 * The Scene panel's edits as steps of the editor's undo (M5.1): each over the open file, or, for
 * New and Group into prefab, a new file beside it, written as one step.
 */
import { type SpaceKind, spacePath } from '@eb/compiler';
import { editing } from '../editing/current.ts';
import { dropBy } from './bounds.ts';
import type { Transform } from './gizmoMath.ts';
import { snapTo, tidy } from './snap.ts';
import {
  addObject,
  changeObject,
  changeSpaceFile,
  createSpaceFile,
  deleteObjects,
  freeSpot,
  groupObjects,
  placeObjects,
  renameObject,
  setAxis,
  withSpaceStage,
  withSpaceTags,
} from './spaceEdits.ts';
import { type SpaceJson, type SpaceObject, transformOf, withTransform } from './spaceFile.ts';
import { aim, groundHeight, moveStep, objectBoxes, openSpace, openSpaceFile, pick, picked, snapOn } from './state.ts';

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** One step over the open file. */
export function editOpen(label: string, change: (space: SpaceJson) => SpaceJson, group?: string): Promise<void> {
  const open = openSpace.value;
  if (!open) return Promise.resolve();
  return editing.edit(label, (copy) => changeSpaceFile(copy, open.path, change), group);
}

/** A new space or prefab, opened; a 2D space (M7.1) says so and leaves its fit and size to their defaults. */
export async function createSpace(kind: SpaceKind, id: string, typed: string, flat = false): Promise<void> {
  const name = (typed.trim() || id).slice(0, 80);
  const space: SpaceJson = flat ? { name, view: '2d', objects: [] } : { name, objects: [] };
  await editing.edit(`New ${flat ? '2D ' : ''}${kind} ${name}`, (copy) =>
    createSpaceFile(copy, spacePath(kind, id), space),
  );
  openSpaceFile(kind, id);
}

/** A shape, a prefab or a record (M5.2) put on the ground in the middle of the view, or beside what is there, chosen; on a terrain's ground (M5.3). */
export async function addHere(
  object: { readonly shape: SpaceObject['shape'] } | { readonly prefab: string } | { readonly record: string },
): Promise<void> {
  const [x, , z] = aim.value;
  const snap = (v: number) => (snapOn.value ? snapTo(v, moveStep.value) : v);
  const base: SpaceObject =
    'prefab' in object
      ? { id: object.prefab, prefab: object.prefab }
      : 'record' in object
        ? { id: object.record.slice(object.record.indexOf(':') + 1), record: object.record }
        : { id: object.shape ?? 'box', shape: object.shape };
  let made = '';
  await editOpen(`Add ${base.id}`, (space) => {
    const at = freeSpot(space, snap(x), snap(z));
    // On a terrain, on the ground where it lands, to the centimetre.
    at[1] = Math.round((groundHeight.value?.(at[0], at[2]) ?? 0) * 100) / 100;
    const added = addObject(space, withTransform(base, { at, turn: [0, 0, 0], scale: [1, 1, 1] }));
    made = added.id;
    return added.space;
  });
  if (made) pick([made]);
}

/** One axis of an object's place, turn or scale, typed in its form (setAxis). */
export const placeAxis = (id: string, part: keyof Transform, axis: number, n: number, what: string): Promise<void> =>
  editOpen(`${what} ${id}`, (space) => setAxis(space, id, part, axis, n), `${openSpace.value?.path}#${id}#${what}`);

/** The places a drag gave the chosen objects. */
export const placeChosen = (places: ReadonlyMap<string, Transform>, label: string, group?: string): Promise<void> =>
  editOpen(label, (space) => placeObjects(space, places), group);

/**
 * Drop (M5.10, D72): each chosen object stood on what is under it, the highest top of another
 * object's box, else the terrain's highest under it, else 0 m, each as if the others weren't moved.
 */
export function dropChosen(): Promise<void> {
  const chosen = new Set(picked.value);
  const boxes = objectBoxes.value?.() ?? [];
  const others = boxes.filter((b) => !chosen.has(b.id)).map((b) => b.box);
  if (chosen.size === 0) return Promise.resolve();
  return editOpen(`Drop ${count(chosen.size, 'object')}`, (space) => {
    const places = new Map<string, Transform>();
    for (const object of space.objects) {
      const box = chosen.has(object.id) ? boxes.find((b) => b.id === object.id)?.box : undefined;
      if (!box) continue;
      const t = transformOf(object);
      const by = dropBy(box, others, groundHeight.value);
      places.set(object.id, { ...t, at: [t.at[0], tidy(t.at[1] + by), t.at[2]] });
    }
    return placeObjects(space, places);
  });
}

export function deleteChosen(): Promise<void> {
  const gone = new Set(picked.value);
  if (gone.size === 0) return Promise.resolve();
  return editOpen(`Delete ${count(gone.size, 'object')}`, (space) => deleteObjects(space, gone)).then(() => pick([]));
}

export const renameChosen = (id: string, typed: string): Promise<void> =>
  editOpen(`Rename ${id}`, (space) => renameObject(space, id, typed));

/** A field of one object set from the form; typing into one field joins into one step. */
export const setObject = (id: string, patch: Partial<SpaceObject>, label: string): Promise<void> =>
  editOpen(
    label,
    (space) => changeObject(space, id, patch),
    `${openSpace.value?.path}#${id}#${Object.keys(patch).join()}`,
  );

/** The open space's own tags (M6.7), as one step. */
export const setSpaceTags = (tags: readonly string[]): Promise<void> =>
  editOpen(`Tags of ${openSpace.value?.id}`, (space) => withSpaceTags(space, tags));

/** The 2D space's stage (M7.4), or none: one step. */
export const setSpaceStage = (stage: string | undefined): Promise<void> =>
  editOpen(`Stage of ${openSpace.value?.id}`, (space) => withSpaceStage(space, stage));

/** The chosen objects made into prefabs/<id>.json, and one placement of it where they were: one step. */
export async function groupChosen(id: string, typed: string): Promise<void> {
  const open = openSpace.value;
  const chosen = new Set(picked.value);
  if (!open || chosen.size === 0) return;
  const name = (typed.trim() || id).slice(0, 80);
  const path = spacePath('prefab', id);
  let placement = '';
  await editing.edit(`Group ${count(chosen.size, 'object')} into ${name}`, async (copy) => {
    if (await copy.read(path)) return [];
    let prefab: SpaceJson | null = null;
    const changed = await changeSpaceFile(copy, open.path, (space) => {
      const grouped = groupObjects(space, chosen, { id, name });
      prefab = grouped.prefab;
      placement = grouped.placement;
      return grouped.space;
    });
    if (!prefab || changed.length === 0) return [];
    return [...(await createSpaceFile(copy, path, prefab)), ...changed];
  });
  if (placement) pick([placement]);
}
