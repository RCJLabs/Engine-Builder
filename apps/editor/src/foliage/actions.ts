/**
 * A terrain's foliage edits as steps of the editor's undo (M5.6, D68): each over the space open in
 * the Scene panel and its density file, and a new record made in the same step as it is added.
 */
import { FOLIAGE, type FoliagePreset, MODEL } from '@eb/schema';
import { editing } from '../editing/current.ts';
import { current } from '../projects/opened.ts';
import { liveOf } from '../spaces/live.ts';
import { openSpace } from '../spaces/state.ts';
import { brushFoliage } from '../terrain/state.ts';
import { addFoliage, type Fill, fillFoliage, newFoliage, presetModel, removeFoliage } from './foliageEdits.ts';

const spaceOpen = () => {
  const open = openSpace.value;
  return open?.kind === 'space' ? open : null;
};

/** The foliage record `id` added to the open space's terrain. */
export function addFoliageHere(id: string, name: string): Promise<void> {
  const open = spaceOpen();
  if (!open) return Promise.resolve();
  return editing.edit(`Add ${name} to ${open.id}`, (copy) => addFoliage(copy, open.id, id));
}

/** The terrain's foliage `k` taken out, its plants with it. */
export function removeFoliageHere(k: number, name: string): Promise<void> {
  const open = spaceOpen();
  if (!open) return Promise.resolve();
  // The types after it move down one, and Plant keeps to the one it had.
  if (brushFoliage.peek() > k) brushFoliage.value = brushFoliage.peek() - 1;
  return editing.edit(`Remove ${name} from ${open.id}`, (copy) => removeFoliage(copy, open.id, k));
}

/** The terrain's foliage `k` filled everywhere, nowhere or from a paint layer. */
export function fillFoliageHere(k: number, fill: Fill, label: string): Promise<void> {
  const open = spaceOpen();
  if (!open) return Promise.resolve();
  return editing.edit(label, (copy) => fillFoliage(copy, open.id, k, fill));
}

/** A new foliage record from `preset`, its model the kit's when the project has it, added to the terrain. */
export function newFoliageHere(preset: FoliagePreset): Promise<void> {
  const open = spaceOpen();
  const space = liveOf(open)?.space;
  const catalog = current.value?.catalog;
  if (!open || !space || !catalog) return Promise.resolve();
  const model = presetModel(preset, catalog.records.get(MODEL) ?? []);
  const taken = new Set(catalog.records.get(FOLIAGE) ?? []);
  return editing.edit(`New ${preset.name.toLowerCase()} for ${open.id}`, async (copy) => {
    const made = await newFoliage(copy, { id: open.id, name: space.name }, preset, model, taken);
    return made.changes;
  });
}
