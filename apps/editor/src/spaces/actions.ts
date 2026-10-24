/**
 * The Scene panel's edits as steps of the editor's undo (M5.1): each over the open file, or, for
 * New and Group into prefab, a new file beside it, written as one step.
 */
import { type SpaceKind, spacePath } from '@eb/compiler';
import { editing } from '../editing/current.ts';
import type { Transform } from './gizmoMath.ts';
import { STEPS, snapTo } from './snap.ts';
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
} from './spaceEdits.ts';
import { type SpaceJson, type SpaceObject, withTransform } from './spaceFile.ts';
import { aim, groundHeight, openSpace, openSpaceFile, pick, picked, snapOn } from './state.ts';

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** One step over the open file. */
export function editOpen(label: string, change: (space: SpaceJson) => SpaceJson, group?: string): Promise<void> {
  const open = openSpace.value;
  if (!open) return Promise.resolve();
  return editing.edit(label, (copy) => changeSpaceFile(copy, open.path, change), group);
}

export async function createSpace(kind: SpaceKind, id: string, typed: string): Promise<void> {
  const name = (typed.trim() || id).slice(0, 80);
  await editing.edit(`New ${kind} ${name}`, (copy) =>
    createSpaceFile(copy, spacePath(kind, id), { name, objects: [] }),
  );
  openSpaceFile(kind, id);
}

/** A shape, a prefab or a record (M5.2) put on the ground in the middle of the view, or beside what is there, chosen; on a terrain's ground (M5.3). */
export async function addHere(
  object: { readonly shape: SpaceObject['shape'] } | { readonly prefab: string } | { readonly record: string },
): Promise<void> {
  const [x, , z] = aim.value;
  const snap = (v: number) => (snapOn.value ? snapTo(v, STEPS.move) : v);
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

/** The places a drag or the form gave the chosen objects. */
export const placeChosen = (places: ReadonlyMap<string, Transform>, label: string, group?: string): Promise<void> =>
  editOpen(label, (space) => placeObjects(space, places), group);

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
