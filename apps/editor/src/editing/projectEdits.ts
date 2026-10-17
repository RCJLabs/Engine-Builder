/**
 * Edits to project.json's name and version: the first things the editor edits. M2.4's forms
 * build steps the same way, for records.
 */
import { MANIFEST_FILE, type ProjectSource, projectSchema } from '@eb/compiler';
import type { FileChange } from './history.ts';
import { editJson } from './jsonText.ts';

export type ManifestField = 'name' | 'version';

export const FIELD_LABELS: Record<ManifestField, string> = {
  name: 'Rename the project',
  version: 'Change the version',
};

/** Why `value` can't go in the field, in a sentence, or null when it can. */
export function manifestProblem(field: ManifestField, value: string): string | null {
  // The schema takes any name of one character or more; a name of spaces alone reads as none.
  if (field === 'name') return value.trim() === '' ? 'A project needs a name.' : null;
  const checked = projectSchema.shape.version.safeParse(value);
  return checked.success ? null : (checked.error.issues[0]?.message ?? 'Not a version.');
}

/**
 * The change that puts `value` in project.json, in the file's own layout, or null when there is
 * no project.json or the field already holds it.
 */
export async function manifestChange(
  source: ProjectSource,
  field: ManifestField,
  value: string,
): Promise<FileChange | null> {
  const before = await source.read(MANIFEST_FILE);
  if (before === undefined) return null;
  // Spreading keeps each key where it was, so only the edited line moves in a diff.
  const after = editJson(before, (manifest) => ({ ...(manifest as object), [field]: value }));
  return after === before ? null : { path: MANIFEST_FILE, before, after };
}
