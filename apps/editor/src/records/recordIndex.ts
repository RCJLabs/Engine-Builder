/**
 * Every record of the open project, read and checked (M2.5): each record's value, its problems
 * and what it refers to, and the other way round, what refers to it. The Records panel's rows and
 * the inspector's "used by" read it. The checks are the compiler's own (validateRecords), so a
 * table and `eb validate` never disagree.
 *
 * It is kept up to date by file. A record's problems depend on its own value, on which records
 * exist (for its references) and on the types and assets, nothing else. So an edit checks again
 * only the records it changed; creating or deleting a record also checks those that refer to it,
 * which "used by" already knows, references to missing records included; and a change to the
 * types or the assets checks them all.
 */
import { type ProjectSource, parseJsonFile, readFiles } from '@eb/compiler';
import { formatRef } from '@eb/core';
import { compareText, type Diagnostic, type RecordInput, type Usage, validateRecords } from '@eb/schema';
import { type Catalog, recordFile } from '../forms/catalog.ts';

/** A reference out of a record: the "type:id" it names, and where in the record. */
export interface Ref {
  readonly to: string;
  readonly path: string;
}

export interface IndexedRecord {
  /** "type:id". */
  readonly key: string;
  readonly type: string;
  readonly id: string;
  readonly file: string;
  /** The file as read, to tell whether it changed. */
  readonly bytes: Uint8Array;
  /** Undefined when the file isn't JSON; `unreadable` says why. */
  readonly value: unknown;
  readonly unreadable?: string;
  /** False when its type has no sound type file: the record is there, but nothing checks it. */
  readonly checked: boolean;
  readonly problems: readonly Diagnostic[];
  readonly refs: readonly Ref[];
}

export interface RecordIndex {
  /** By "type:id". */
  readonly records: ReadonlyMap<string, IndexedRecord>;
  /**
   * What refers to each "type:id", sorted by record, path and file as validateRecords sorts them.
   * References to records that aren't there are kept, so a deleted record's users can be found.
   */
  readonly usedBy: ReadonlyMap<string, readonly Usage[]>;
  /** The types and assets the records were checked against (groundsOf). */
  readonly grounds: string;
}

export const EMPTY_INDEX: RecordIndex = { records: new Map(), usedBy: new Map(), grounds: '' };

/** What a record's checks depend on besides the records: the sound types' files and the assets. */
const groundsOf = (catalog: Catalog): string =>
  JSON.stringify([[...catalog.types].map(([type, data]) => [type, data.file]), catalog.assets]);

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/** A record as its file reads, before it is checked. */
function readRecord(type: string, id: string, file: string, bytes: Uint8Array, catalog: Catalog): IndexedRecord {
  const parsed = parseJsonFile(bytes);
  const at = { key: formatRef(type, id), type, id, file, bytes, checked: catalog.types.has(type), refs: [] };
  return parsed.ok
    ? { ...at, value: parsed.value, problems: [] }
    : { ...at, value: undefined, unreadable: parsed.message, problems: [] };
}

/**
 * The index after `paths` changed, or after anything may have changed (`paths` null, as when the
 * project opens). Only files that are named, or not in the index yet, are read; a record whose
 * bytes come back the same keeps its entry, checks and all.
 */
export async function updateIndex(
  before: RecordIndex,
  source: ProjectSource,
  catalog: Catalog,
  paths: readonly string[] | null,
): Promise<RecordIndex> {
  const named = new Set(paths ?? []);
  const listed: { type: string; id: string; file: string; key: string }[] = [];
  for (const [type, ids] of catalog.records) {
    for (const id of ids) listed.push({ type, id, file: recordFile(type, id), key: formatRef(type, id) });
  }
  const stale = listed.filter(({ file, key }) => paths === null || named.has(file) || !before.records.has(key));
  const read = await readFiles(
    source,
    stale.map(({ file }) => file),
  );
  const reading = new Set(stale.map(({ key }) => key));
  const records = new Map<string, IndexedRecord>();
  const dirty = new Set<string>();
  for (const { type, id, file, key } of listed) {
    const known = before.records.get(key);
    // A type file that came or went since: checked again below, with everything else.
    const old = known && known.checked !== catalog.types.has(type) ? { ...known, checked: !known.checked } : known;
    const bytes = read.get(file);
    if (!reading.has(key) && old) records.set(key, old);
    // Read again and the same: nothing about it changed.
    else if (bytes !== undefined && old && sameBytes(old.bytes, bytes)) records.set(key, old);
    // Gone between the listing and the read: left out, like a file deleted.
    else if (bytes !== undefined) {
      records.set(key, readRecord(type, id, file, bytes, catalog));
      dirty.add(key);
    }
  }
  // A record created or deleted changes the problems of those that refer to it.
  const appeared = [...records.keys()].filter((key) => !before.records.has(key));
  const went = [...before.records.keys()].filter((key) => !records.has(key));
  for (const key of [...appeared, ...went]) {
    for (const usage of before.usedBy.get(key) ?? []) if (records.has(usage.from)) dirty.add(usage.from);
  }
  const grounds = groundsOf(catalog);
  check(records, grounds === before.grounds ? dirty : new Set(records.keys()), catalog);
  return { records, usedBy: usedByOf(records), grounds };
}

/**
 * Checks the `dirty` records, in place. Every other record goes to validateRecords as there but
 * unread, so references to it resolve and nothing about it is checked again.
 */
function check(records: Map<string, IndexedRecord>, dirty: ReadonlySet<string>, catalog: Catalog): void {
  if (dirty.size === 0) return;
  const inputs: RecordInput[] = [];
  for (const record of records.values()) {
    const { type, id, file, value } = record;
    const checks = dirty.has(record.key) && record.checked && record.unreadable === undefined;
    inputs.push(checks ? { type, id, file, value } : { type, id, file, value: undefined, unreadable: true });
  }
  const { diagnostics, usedBy } = validateRecords(catalog.recordTypes, inputs, { assets: new Set(catalog.assets) });
  const problems = new Map<string, Diagnostic[]>();
  for (const diagnostic of diagnostics)
    push(problems, formatRef(diagnostic.type ?? '', diagnostic.id ?? ''), diagnostic);
  const refs = new Map<string, Ref[]>();
  for (const [to, usages] of usedBy) for (const { from, path } of usages) push(refs, from, { to, path });
  for (const key of dirty) {
    const record = records.get(key) as IndexedRecord;
    const checked = record.checked && record.unreadable === undefined;
    records.set(key, {
      ...record,
      problems: record.unreadable === undefined ? (checked ? (problems.get(key) ?? []) : []) : [unreadable(record)],
      refs: checked ? (refs.get(key) ?? []) : [],
    });
  }
}

function push<T>(map: Map<string, T[]>, key: string, item: T): void {
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
}

/** The diagnostic the compiler gives a record file that isn't JSON. */
const unreadable = ({ type, id, file, unreadable }: IndexedRecord): Diagnostic => ({
  code: 'E007',
  severity: 'error',
  message: unreadable ?? '',
  type,
  id,
  file,
  path: '',
});

const byUsage = (a: Usage, b: Usage) =>
  compareText(a.from, b.from) || compareText(a.path, b.path) || compareText(a.file ?? '', b.file ?? '');

/** "Used by" from every record's references, in validateRecords's order. */
function usedByOf(records: ReadonlyMap<string, IndexedRecord>): Map<string, readonly Usage[]> {
  const found = new Map<string, Usage[]>();
  for (const record of records.values()) {
    for (const { to, path } of record.refs) push(found, to, { from: record.key, file: record.file, path });
  }
  for (const list of found.values()) list.sort(byUsage);
  return found;
}

/** The records that refer to `key`, each once, in order. */
export const usersOf = (index: RecordIndex, key: string): string[] => [
  ...new Set((index.usedBy.get(key) ?? []).map((usage) => usage.from)),
];
