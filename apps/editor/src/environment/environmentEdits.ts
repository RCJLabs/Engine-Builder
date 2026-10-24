/**
 * The environment's edits as file changes (M5.4, D66, docs/specs/environments.md#the-editor): a
 * space given an environment or none, a new environment from a preset given to the space in the
 * same step, and one of a record's fields changed in its own layout. actions.ts makes them steps
 * of undo.
 */
import { type ProjectSource, spacePath } from '@eb/compiler';
import { ENVIRONMENT, ENVIRONMENT_TYPE_FILE } from '@eb/schema';
import type { FileChange } from '../editing/history.ts';
import { recordFile } from '../forms/catalog.ts';
import { changeRecord, createRecordFile } from '../forms/recordEdits.ts';
import { type Path, setIn } from '../forms/values.ts';
import { changeSpaceFile } from '../spaces/spaceEdits.ts';
import { freeId } from '../spaces/spaceFile.ts';
import type { Preset } from './presets.ts';

/** The space drawn under the environment `id`, or under none. */
export function setSpaceEnvironment(source: ProjectSource, space: string, id: string | null): Promise<FileChange[]> {
  return changeSpaceFile(source, spacePath('space', space), (now) => {
    const { environment: _, ...rest } = now;
    return id === null ? rest : { ...rest, environment: id };
  });
}

/**
 * A new environment from `preset`, named for the space, and the space drawn under it: one step.
 * Its id is the space's and the preset's, or the first free one after it.
 */
export async function newEnvironment(
  source: ProjectSource,
  space: { readonly id: string; readonly name: string },
  preset: Preset,
  taken: ReadonlySet<string>,
): Promise<{ readonly id: string; readonly changes: FileChange[] }> {
  const id = freeId(taken, `${space.id}-${preset.id}`);
  const record = { name: `${space.name}, ${preset.name.toLowerCase()}`, ...preset.value };
  const made = await createRecordFile(source, recordFile(ENVIRONMENT, id), record);
  return { id, changes: [...made, ...(await setSpaceEnvironment(source, space.id, id))] };
}

/** One of an environment's fields set, or taken out with undefined, in the record's own layout. */
export function changeEnvironment(source: ProjectSource, id: string, path: Path, next: unknown): Promise<FileChange[]> {
  return changeRecord(source, recordFile(ENVIRONMENT, id), (now) => setIn(now, path, next, ENVIRONMENT_TYPE_FILE));
}
