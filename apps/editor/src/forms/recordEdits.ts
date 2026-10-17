/**
 * Reading a record for its form, and the file changes a form makes: one record's value changed in
 * its own layout (editing/jsonText.ts), a record created, a record deleted. Each is a step the
 * command log can undo (D30).
 */
import { type ProjectSource, parseJsonFile } from '@eb/compiler';
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
  const before = await source.read(file);
  return before === undefined ? [] : [{ path: file, before, after: null }];
}
