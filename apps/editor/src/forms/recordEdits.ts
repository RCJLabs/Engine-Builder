/**
 * Reading a record for its form, and the file changes forms and tables make: one record's value
 * changed in its own layout (editing/jsonText.ts), a record created, copied or deleted, and the
 * same change to many. Each is a step the command log can undo (D30).
 */
import { type ProjectSource, parseJsonFile, readFiles } from '@eb/compiler';
import type { FileChange } from '../editing/history.ts';
import { editJson } from '../editing/jsonText.ts';

export type LoadedRecord =
  | { readonly kind: 'missing' }
  | { readonly kind: 'unreadable'; readonly message: string }
  | { readonly kind: 'ok'; readonly value: unknown };

export async function loadRecord(source: ProjectSource, file: string): Promise<LoadedRecord> {
  const bytes = await source.read(file);
  if (bytes === undefined) return { kind: 'missing' };
  const parsed = parseJsonFile(bytes);
  return parsed.ok ? { kind: 'ok', value: parsed.value } : { kind: 'unreadable', message: parsed.message };
}

/** The layout a new record file gets: two spaces and a final newline, as most editors write JSON. */
export const newFileText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** The record at `file` changed by `change`, or no change when it leaves the value as it was. */
export async function changeRecord(
  source: ProjectSource,
  file: string,
  change: (value: unknown) => unknown,
): Promise<FileChange[]> {
  const before = await source.read(file);
  if (before === undefined) return [];
  const after = editJson(before, change);
  return after === before ? [] : [{ path: file, before, after }];
}

/** A new record file. Throws when one is there already: a new record never overwrites one. */
export async function createRecordFile(source: ProjectSource, file: string, value: unknown): Promise<FileChange[]> {
  if ((await source.read(file)) !== undefined) throw new Error(`${file} exists already`);
  return [{ path: file, before: null, after: new TextEncoder().encode(newFileText(value)) }];
}

export async function deleteRecordFile(source: ProjectSource, file: string): Promise<FileChange[]> {
  return deleteRecordFiles(source, [file]);
}

/** Several records deleted as one step (M2.5's tables); files already gone are passed over. */
export async function deleteRecordFiles(source: ProjectSource, files: readonly string[]): Promise<FileChange[]> {
  const read = await readFiles(source, files);
  return files.flatMap((path) => {
    const before = read.get(path);
    return before === undefined ? [] : [{ path, before, after: null }];
  });
}

/**
 * The same change made to several records, as one step (M2.5's bulk edits): each file in its own
 * layout, and those the change leaves as they were left out. Read 32 at a time, as export reads.
 */
export async function changeRecords(
  source: ProjectSource,
  files: readonly string[],
  change: (value: unknown) => unknown,
): Promise<FileChange[]> {
  const read = await readFiles(source, files);
  const changes: FileChange[] = [];
  for (const path of files) {
    const before = read.get(path);
    if (before === undefined) continue;
    const after = editJson(before, change);
    if (after !== before) changes.push({ path, before, after });
  }
  return changes;
}

/**
 * A copy of the record at `from`, saved at `to`: the same bytes, in the same layout, after
 * `change` when there is one (the copy's new name). Never overwrites a record that is there.
 */
export async function duplicateRecordFile(
  source: ProjectSource,
  from: string,
  to: string,
  change?: (value: unknown) => unknown,
): Promise<FileChange[]> {
  const bytes = await source.read(from);
  if (bytes === undefined) return [];
  if ((await source.read(to)) !== undefined) throw new Error(`${to} exists already`);
  return [{ path: to, before: null, after: change ? editJson(bytes, change) : bytes }];
}
