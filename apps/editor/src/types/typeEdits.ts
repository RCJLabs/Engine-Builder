/**
 * The type designer's steps as file changes (M2.6): a type file changed, alone or with its
 * records; a type created, renamed or deleted; a record renamed. Each reads what it changes from
 * the working copy as it is when the step runs, never from the record index, which may be a step
 * behind. Each is one step of the command log (D30): undo takes all of it back.
 */
import {
  classifyRecordFile,
  classifyTypeFile,
  GUIDE_FILE,
  type ProjectSource,
  RECORDS_DIR,
  readFiles,
  TYPES_DIR,
} from '@eb/compiler';
import { formatRef, isRecordId } from '@eb/core';
import type { FileChange } from '../editing/history.ts';
import { editJson, readJson } from '../editing/jsonText.ts';
import { type Catalog, readCatalog, recordFile } from '../forms/catalog.ts';
import { newFileText } from '../forms/recordEdits.ts';
import { guideMoved } from '../guide/guideSteps.ts';
import { EMPTY_INDEX, type RecordIndex, updateIndex } from '../records/recordIndex.ts';
import { NO_SCRIPTS } from '../scripts/gameState.ts';
import {
  placedOverrides,
  renameRecordInSpaces,
  renameTypeInSpaces,
  rewritePlacedRecords,
} from '../spaces/recordRenames.ts';
import { spaceProblems } from '../spaces/spaceChecks.ts';
import { compose, type Rewrite, refSites, renameAtPointers, renameRecordRefs, renameTypeRefs } from './rewrites.ts';
import { refersTo, renameTypeInFile } from './typeFileChanges.ts';

export const typeFilePath = (type: string): string => `${TYPES_DIR}/${type}.json`;

const encode = (text: string) => new TextEncoder().encode(text);

/** What a new type starts as: a name for its records, which New and Duplicate fill in (M2.5). */
export const newTypeFile = (title: string) => ({
  title,
  nameField: 'name',
  fields: { name: { kind: 'text', min: 1 } },
});

/** The record files of `type`, sorted. */
export async function recordFilesOf(source: ProjectSource, type: string): Promise<string[]> {
  const files = await source.files(`${RECORDS_DIR}/${type}`);
  return files
    .filter((path) => {
      const role = classifyRecordFile(path);
      return role.kind === 'record' && role.type === type;
    })
    .sort();
}

/** A file's JSON, or undefined when it isn't there or isn't JSON. */
function jsonOf(bytes: Uint8Array | undefined): unknown {
  if (bytes === undefined) return undefined;
  try {
    return readJson(bytes).value;
  } catch {
    return undefined;
  }
}

/** The bytes after `rewrite`, in the file's own layout; a file that isn't JSON stays as it is. */
function rewritten(bytes: Uint8Array, rewrite: Rewrite): Uint8Array {
  try {
    return editJson(bytes, rewrite);
  } catch {
    return bytes;
  }
}

/** The records of `files` changed by `rewrite`, each in its own layout; those it leaves alone aren't changes. */
export async function rewriteFiles(
  source: ProjectSource,
  files: readonly string[],
  rewrite: Rewrite,
): Promise<FileChange[]> {
  return rewriteRead(await readFiles(source, files), files, rewrite);
}

/** rewriteFiles, for files read already. */
function rewriteRead(read: ReadonlyMap<string, Uint8Array>, files: readonly string[], rewrite: Rewrite): FileChange[] {
  const changes: FileChange[] = [];
  for (const path of files) {
    const before = read.get(path);
    if (before === undefined) continue;
    const after = rewritten(before, rewrite);
    if (after !== before) changes.push({ path, before, after });
  }
  return changes;
}

export interface TypeFileRead {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly json: unknown;
}

/** Every type file that reads as JSON, by type, in name order. */
export async function typeFiles(source: ProjectSource): Promise<Map<string, TypeFileRead>> {
  const named = new Map<string, string>();
  for (const path of await source.files(TYPES_DIR)) {
    const role = classifyTypeFile(path);
    if (role.kind === 'type' && isRecordId(role.type)) named.set(role.type, path);
  }
  const read = await readFiles(source, [...named.values()]);
  const found = new Map<string, TypeFileRead>();
  for (const [type, path] of [...named].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const bytes = read.get(path);
    const json = jsonOf(bytes);
    if (bytes !== undefined && json !== undefined) found.set(type, { path, bytes, json });
  }
  return found;
}

/**
 * A new type file: `file`, or a new type's start. Throws when the type has one already: a new type
 * never overwrites one.
 */
export async function createTypeFile(
  source: ProjectSource,
  type: string,
  title: string,
  file: unknown = newTypeFile(title),
): Promise<FileChange[]> {
  const path = typeFilePath(type);
  if ((await source.read(path)) !== undefined) throw new Error(`${path} exists already`);
  return [{ path, before: null, after: encode(newFileText(file)) }];
}

/** What a change to a type file does: the file after it, and what it does to each of its records. */
export interface TypeChange {
  readonly file: unknown;
  readonly rewrite?: Rewrite;
  /** Throws, before anything changes, when the records hold what the change would lose. */
  readonly check?: (records: readonly unknown[]) => void;
}

/**
 * The type file changed by `change`, given its JSON as it is now, and its records rewritten to
 * match. The records are read only when the change rewrites or checks them: typing in a type's
 * title reads one file, however many records it has.
 */
export async function changeType(
  source: ProjectSource,
  type: string,
  change: (file: unknown) => TypeChange,
): Promise<FileChange[]> {
  const path = typeFilePath(type);
  const bytes = await source.read(path);
  const json = jsonOf(bytes);
  if (bytes === undefined || json === undefined) return [];
  const made = change(json);
  const after = editJson(bytes, () => made.file);
  const own: FileChange[] = after === bytes ? [] : [{ path, before: bytes, after }];
  if (!made.rewrite && !made.check) return own;
  // Read once for both: a rename both checks and rewrites every record.
  const files = await recordFilesOf(source, type);
  const read = await readFiles(source, files);
  // A placed record's overrides hold its fields too (M5.2): a rename onto one they set would lose it.
  if (made.check) made.check([...[...read.values()].map(jsonOf), ...(await placedOverrides(source, type))]);
  if (!made.rewrite) return own;
  return [
    ...own,
    ...rewriteRead(read, files, made.rewrite),
    ...(await rewritePlacedRecords(source, type, made.rewrite)),
  ];
}

/** A file moved: gone from `from`, at `to` with its bytes after `rewrite`. */
export function move(from: string, to: string, bytes: Uint8Array, rewrite: Rewrite): FileChange[] {
  return [
    { path: from, before: bytes, after: null },
    { path: to, before: null, after: rewritten(bytes, rewrite) },
  ];
}

/**
 * The type `from` named `to`: its file and its records' folder move, every `to` in the type files
 * that names it follows, and every "from:id" a record holds becomes "to:id". Bare ids stay: the
 * records keep their ids. Throws when `to` is taken.
 */
export async function renameType(source: ProjectSource, from: string, to: string): Promise<FileChange[]> {
  if ((await source.read(typeFilePath(to))) !== undefined || (await recordFilesOf(source, to)).length > 0) {
    throw new Error(`There is a type ${to} already`);
  }
  const types = await typeFiles(source);
  const own = types.get(from);
  if (!own) return [];
  const changes: FileChange[] = move(own.path, typeFilePath(to), own.bytes, (json) => renameTypeInFile(json, from, to));
  for (const [type, { path, bytes }] of types) {
    if (type === from) continue;
    const after = rewritten(bytes, (json) => renameTypeInFile(json, from, to));
    if (after !== bytes) changes.push({ path, before: bytes, after });
  }
  for (const [type, { json }] of types) {
    const rewrite = renameTypeRefs(json, from, to);
    if (type !== from) {
      // Only a field of several types holds "from:id"; the others need no reading.
      const qualified = refSites(json).some((site) => !site.single && site.to.includes(from));
      if (qualified) changes.push(...(await rewriteFiles(source, await recordFilesOf(source, type), rewrite)));
      continue;
    }
    const files = await recordFilesOf(source, from);
    const read = await readFiles(source, files);
    for (const path of files) {
      const bytes = read.get(path);
      const role = classifyRecordFile(path);
      if (bytes !== undefined && role.kind === 'record')
        changes.push(...move(path, recordFile(to, role.id), bytes, rewrite));
    }
  }
  // Every "from:id" in spaces and prefabs follows (M5.2): placements and refs in components and overrides.
  const { catalog, index } = await indexNow(source);
  const placed = await spaceReferences(source, catalog, index, (key) => key.startsWith(`${from}:`));
  return [...changes, ...(await renameTypeInSpaces(source, placed, from, to))];
}

/** The types whose files refer to `type`, other than its own: while there are any, it can't be deleted. */
export async function typesReferringTo(source: ProjectSource, type: string): Promise<string[]> {
  const types = await typeFiles(source);
  return [...types]
    .filter(([name, { json }]) => name !== type && refersTo(json, type).length > 0)
    .map(([name]) => name);
}

/** The type and its records deleted. Throws while other types refer to it, whose refs would break. */
export async function deleteType(source: ProjectSource, type: string): Promise<FileChange[]> {
  const users = await typesReferringTo(source, type);
  if (users.length > 0) throw new Error(`${users.join(', ')} refer to ${type}`);
  const paths = [typeFilePath(type), ...(await recordFilesOf(source, type))];
  const read = await readFiles(source, paths);
  return paths.flatMap((path) => {
    const before = read.get(path);
    return before === undefined ? [] : [{ path, before, after: null }];
  });
}

/**
 * The record `type:from` renamed `to`: its file moves, and every reference to it follows, in
 * records of every type whose fields may name it, itself included, and wherever else the record
 * index finds one in a record: the kits' and the engine's types, effects, map keys; and the
 * guide's steps that open it (M4.11).
 * Conditions aren't changed: the editor can't tell which of their words are ids (rewrites.ts);
 * nor are scenes, scripts or screens. Throws when `to` is taken.
 */
export async function renameRecord(
  source: ProjectSource,
  type: string,
  from: string,
  to: string,
): Promise<FileChange[]> {
  const was = recordFile(type, from);
  const now = recordFile(type, to);
  if ((await source.read(now)) !== undefined) throw new Error(`${now} exists already`);
  const bytes = await source.read(was);
  if (bytes === undefined) return [];
  const types = await typeFiles(source);
  const rewriteOf = (json: unknown) => renameRecordRefs(json, type, from, to);
  const own = types.get(type);
  const changes = move(was, now, bytes, own ? rewriteOf(own.json) : compose([]));
  for (const [other, { json }] of types) {
    if (refersTo(json, type).length === 0) continue;
    const files = (await recordFilesOf(source, other)).filter((path) => path !== was);
    changes.push(...(await rewriteFiles(source, files, rewriteOf(json))));
  }
  for (const [file, pointers] of await referencesTo(source, type, from)) {
    const path = file === was ? now : file;
    const rewrite = renameAtPointers(pointers, type, from, to);
    const at = changes.findIndex((change) => change.path === path && change.after !== null);
    const done = changes[at];
    if (done?.after) {
      changes[at] = { ...done, after: rewritten(done.after, rewrite) };
      continue;
    }
    const before = await source.read(path);
    if (before === undefined) continue;
    const after = rewritten(before, rewrite);
    if (after !== before) changes.push({ path, before, after });
  }
  const guide = await source.read(GUIDE_FILE);
  const guided = guide && rewritten(guide, (value) => guideMoved(value, was, now));
  if (guide && guided && guided !== guide) changes.push({ path: GUIDE_FILE, before: guide, after: guided });
  // Spaces and prefabs place it, or name it in a component or an override (M5.2).
  const { catalog, index } = await indexNow(source);
  const placed = await spaceReferences(source, catalog, index, (key) => key === formatRef(type, from));
  return [...changes, ...(await renameRecordInSpaces(source, placed, type, from, to))];
}

/** The copy's catalog and record index as they are now: never the open project's, which may be a step behind. */
async function indexNow(source: ProjectSource) {
  const catalog = await readCatalog(source);
  return { catalog, index: await updateIndex(EMPTY_INDEX, source, catalog, null) };
}

/** The pointers in spaces and prefabs at which a "type:id" `matches` names is named, by file (M5.2). */
async function spaceReferences(
  source: ProjectSource,
  catalog: Catalog,
  index: RecordIndex,
  matches: (key: string) => boolean,
): Promise<Map<string, string[]>> {
  const { users } = await spaceProblems(source, catalog, index, NO_SCRIPTS);
  const found = new Map<string, string[]>();
  for (const [key, uses] of users) {
    if (matches(key)) for (const use of uses) found.set(use.file, [...(found.get(use.file) ?? []), use.path]);
  }
  return found;
}

/**
 * The pointers at which records refer to `type:id`, by file, as the record index finds them in
 * the copy as it is now: never the open project's index, which may be a step behind.
 */
async function referencesTo(source: ProjectSource, type: string, id: string): Promise<Map<string, string[]>> {
  const index = await updateIndex(EMPTY_INDEX, source, await readCatalog(source), null);
  const found = new Map<string, string[]>();
  // A scene's usages come back too; its file isn't JSON, so rewriting leaves it as it is.
  for (const { file, path } of index.usedBy.get(formatRef(type, id)) ?? [])
    if (file) found.set(file, [...(found.get(file) ?? []), path]);
  return found;
}
