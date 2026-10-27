/**
 * The 2D view's edits as steps of the editor's undo (M7.1, D83, docs/specs/2d-scenes.md#the-editor):
 * a sprite, a mark, a prefab's placement or a record put in the middle of the view, chosen; the
 * chosen moved by a drag; and moved by the arrow keys, presses in a row joined into one step.
 */
import { editOpen } from '../spaces/actions.ts';
import { addObject, placeObjects } from '../spaces/spaceEdits.ts';
import { type SpaceObject, withTransform } from '../spaces/spaceFile.ts';
import { openSpace, pick, picked } from '../spaces/state.ts';
import type { Point } from '../stage2d/camera.ts';
import { movedBy } from './pick2d.ts';
import { aim2d } from './state2d.ts';

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export type Added2d =
  | { readonly sprite: string }
  | { readonly prefab: string }
  | { readonly record: string }
  | { readonly mark: true };

function baseOf(what: Added2d): SpaceObject {
  if ('sprite' in what) return { id: what.sprite, components: { sprite: { sprite: what.sprite } } };
  if ('prefab' in what) return { id: what.prefab, prefab: what.prefab };
  if ('record' in what) return { id: what.record.slice(what.record.indexOf(':') + 1), record: what.record };
  return { id: 'mark' };
}

/** Put in the middle of the view at depth 0, at whole pixels, and chosen. */
export async function addFlat(what: Added2d): Promise<void> {
  const [x, y] = aim2d.value;
  const base = baseOf(what);
  let made = '';
  await editOpen(`Add ${base.id}`, (space) => {
    const at = [Math.round(x), Math.round(y), 0] as const;
    const added = addObject(space, withTransform(base, { at: [...at], turn: [0, 0, 0], scale: [1, 1, 1] }));
    made = added.id;
    return added.space;
  });
  if (made) pick([made]);
}

/**
 * The chosen moved by `by` art pixels: a drag's one step, or an arrow key's, joined with the presses
 * before it. Worked out from the file as the edit lands, so presses faster than the view redraws
 * each count.
 */
export function moveChosen(by: Point, keyed: boolean): Promise<void> {
  const ids = picked.value;
  if (ids.length === 0 || (by[0] === 0 && by[1] === 0)) return Promise.resolve();
  const label = `Move ${ids.length === 1 ? ids[0] : count(ids.length, 'object')}`;
  return editOpen(
    label,
    (now) => placeObjects(now, movedBy(now, ids, by)),
    keyed ? `${openSpace.value?.path}#nudge#${ids.join()}` : undefined,
  );
}
