/**
 * A building's edits as steps of the editor's undo (M7.3, D85, docs/specs/rooms.md#the-editor): a new
 * building put in the middle of the view, chosen; a stroke of Place, Erase or Stairs, one step; a floor
 * added on top, or the top one taken off. Each works on the open file's top-level object it names, as the
 * file stands when the step is taken.
 */
import { type BuildingFields, isBuilding, type SpaceJson } from '@eb/compiler';
import { editOpen } from '../spaces/actions.ts';
import { addObject } from '../spaces/spaceEdits.ts';
import { withTransform } from '../spaces/spaceFile.ts';
import { pick } from '../spaces/state.ts';
import type { Point } from '../stage2d/camera.ts';
import { addFloor, newBuilding, removeTopFloor, withBuilding } from './buildingEdits.ts';
import type { BuildingChange } from './roomPainter.ts';
import { aim2d } from './state2d.ts';

/** The building fields of the open file's top-level object `id`, when it has a building. */
export function buildingOf(space: SpaceJson | undefined, id: string): BuildingFields | undefined {
  const fields = space?.objects.find((object) => object.id === id)?.components?.building;
  return isBuilding(fields) ? fields : undefined;
}

/** A building of `floors` floors of `slots` slots of `slot` pixels, centred in the view at whole pixels, and chosen. */
export async function addBuilding(slot: Point, slots: number, floors: number, stair?: string): Promise<void> {
  const [x, y] = aim2d.value;
  const at: [number, number, number] = [
    Math.round(x - (slot[0] * slots) / 2),
    Math.round(y - (slot[1] * floors) / 2),
    0,
  ];
  let made = '';
  await editOpen('Add building', (space) => {
    const object = withTransform(newBuilding(slot, slots, floors, stair), { at, turn: [0, 0, 0], scale: [1, 1, 1] });
    const added = addObject(space, object);
    made = added.id;
    return added.space;
  });
  if (made) pick([made]);
}

/** A change to building `id`, as one step called `label`. */
export function buildingStep(id: string, label: string, change: BuildingChange): Promise<void> {
  return editOpen(label, (space) => {
    const fields = buildingOf(space, id);
    return fields ? withBuilding(space, id, change(fields)) : space;
  });
}

export const addFloorStep = (id: string) => buildingStep(id, 'Add a floor', addFloor);

/** The top floor taken off as a step, or why it can't be. */
export async function removeTopFloorStep(id: string, space: SpaceJson | undefined): Promise<string> {
  const fields = buildingOf(space, id);
  const done = fields ? removeTopFloor(fields) : 'No building is chosen.';
  if (typeof done === 'string') return done;
  await buildingStep(id, 'Remove the top floor', (now) => {
    const next = removeTopFloor(now);
    return typeof next === 'string' ? now : next;
  });
  return '';
}
