/**
 * The file changes the script editor and the Scripts list make (M3.2), each a step undo takes
 * back (D30): scripts created, a script's text changed, a script deleted. The scene editor and
 * the Scenes list make the same of ink scenes' files (M3.11).
 */
import type { ProjectSource } from '@eb/compiler';
import { scriptPath, stagePath } from '@eb/script';
import { type FileChange, sameState } from '../editing/history.ts';

const encoder = new TextEncoder();

/** New text files, as one step. Throws when one is there already: a new script or scene never overwrites one. */
export async function createTextFiles(
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

/** A file's text as typed; nothing when it is what the file holds. A file deleted meanwhile is made again. */
export async function setFileText(source: ProjectSource, path: string, text: string): Promise<FileChange[]> {
  const before = (await source.read(path)) ?? null;
  const after = encoder.encode(text);
  return before !== null && sameState(before, after) ? [] : [{ path, before, after }];
}

export async function deleteFile(source: ProjectSource, path: string): Promise<FileChange[]> {
  const before = await source.read(path);
  return before === undefined ? [] : [{ path, before, after: null }];
}

export const setScriptText = (source: ProjectSource, id: string, text: string) =>
  setFileText(source, scriptPath(id), text);

export const deleteScript = (source: ProjectSource, id: string) => deleteFile(source, scriptPath(id));

/** A stage file's text as typed, and a stage file deleted (M7.4): files under stages/, by their path there. */
export const setStageText = (source: ProjectSource, id: string, text: string) =>
  setFileText(source, stagePath(id), text);

export const deleteStage = (source: ProjectSource, id: string) => deleteFile(source, stagePath(id));
