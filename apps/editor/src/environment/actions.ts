/**
 * The environment's edits as steps of the editor's undo (M5.4, D66): each over the space open in
 * the Scene panel, or over its environment's record. Dragging the hour or typing into a field
 * joins into one step, as the record form's fields do.
 */
import { ENVIRONMENT } from '@eb/schema';
import { editing } from '../editing/current.ts';
import { recordFile } from '../forms/catalog.ts';
import type { Path } from '../forms/values.ts';
import { current } from '../projects/opened.ts';
import { liveOf } from '../spaces/live.ts';
import { openSpace } from '../spaces/state.ts';
import { changeEnvironment, newEnvironment, setSpaceEnvironment } from './environmentEdits.ts';
import type { Preset } from './presets.ts';

const spaceOpen = () => {
  const open = openSpace.value;
  return open?.kind === 'space' ? open : null;
};

/** The open space drawn under the environment `id`, or under none. */
export function chooseEnvironment(id: string | null): Promise<void> {
  const open = spaceOpen();
  if (!open) return Promise.resolve();
  const label = id === null ? `No environment in ${open.id}` : `Environment ${id} in ${open.id}`;
  return editing.edit(label, (copy) => setSpaceEnvironment(copy, open.id, id));
}

/** A new environment from `preset`, given to the open space in the same step. */
export function newEnvironmentHere(preset: Preset): Promise<void> {
  const open = spaceOpen();
  const space = liveOf(open)?.space;
  if (!open || !space) return Promise.resolve();
  const taken = new Set(current.value?.catalog.records.get(ENVIRONMENT) ?? []);
  return editing.edit(`New ${preset.name.toLowerCase()} environment for ${open.id}`, async (copy) => {
    const made = await newEnvironment(copy, { id: open.id, name: space.name }, preset, taken);
    return made.changes;
  });
}

/** One of the environment `id`'s fields: dragging or typing into it joins into one step, as the record form's do. */
export function setEnvironmentField(id: string, path: Path, next: unknown, label: string): Promise<void> {
  const file = recordFile(ENVIRONMENT, id);
  return editing.edit(
    `${label} in ${id}`,
    (copy) => changeEnvironment(copy, id, path, next),
    `${file}#/${path.join('/')}`,
  );
}
