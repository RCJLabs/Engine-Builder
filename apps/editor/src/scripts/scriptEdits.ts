/**
 * The file changes the script editor and the Scripts list make (M3.2), each a step undo takes
 * back (D30): scripts created, a script's text changed, a script deleted.
 */
import type { ProjectSource } from '@eb/compiler';
import { scriptPath } from '@eb/script';
import { type FileChange, sameState } from '../editing/history.ts';

const encoder = new TextEncoder();

/** New script files, as one step. Throws when one is there already: a new script never overwrites one. */
export async function createScripts(
  source: ProjectSource,
  files: readonly (readonly [path: string, text: string])[],
): Promise<FileChange[]> {
  const changes: FileChange[] = [];
  for (const [path, text] of files) {
    if ((await source.read(path)) !== undefined) throw new Error(`${path} exists already`);
    changes.push({ path, before: null, after: encoder.encode(text) });
  }
  return changes;
}

/** The script's text as typed; nothing when it is what the file holds. A script deleted meanwhile is made again. */
export async function setScriptText(source: ProjectSource, id: string, text: string): Promise<FileChange[]> {
  const path = scriptPath(id);
  const before = (await source.read(path)) ?? null;
  const after = encoder.encode(text);
  return before !== null && sameState(before, after) ? [] : [{ path, before, after }];
}

export async function deleteScript(source: ProjectSource, id: string): Promise<FileChange[]> {
  const path = scriptPath(id);
  const before = await source.read(path);
  return before === undefined ? [] : [{ path, before, after: null }];
}
