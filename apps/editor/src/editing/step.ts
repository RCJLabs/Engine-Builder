/**
 * A panel's action as one step of the command log (D30), or a note of why it couldn't be made: a
 * step refused (a name taken, a file in the way, a rename that would lose data) changes nothing.
 * The type designer (M2.6) and the Assets panel (M2.7) make their steps through it.
 */
import { noteError } from '../app/state.ts';
import { editing } from './current.ts';
import type { FileChange } from './history.ts';
import type { WorkingCopy } from './workingCopy.ts';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Resolves to whether the step was made. */
export async function step(
  label: string,
  make: (copy: WorkingCopy) => Promise<readonly FileChange[]>,
  group?: string,
): Promise<boolean> {
  try {
    await editing.edit(label, make, group);
    return true;
  } catch (error) {
    noteError(`Couldn’t ${label.charAt(0).toLowerCase()}${label.slice(1)}: ${message(error)}.`);
    return false;
  }
}
