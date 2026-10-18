/**
 * The provenance log's JSON (D34, M2.7) changed by plain functions: an entry set, changed, taken
 * out or moved with its file. Entries stay in the order of their paths, and an entry's keys in
 * the format's order, so a diff shows the change and nothing else.
 */
import type { Provenance } from '@eb/schema';
import { type Path, setInOrder } from '../forms/values.ts';

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The order the format lists an entry's keys in (editor-assets.md). */
export const ENTRY_KEYS = ['licence', 'author', 'source', 'date', 'tool', 'prompt', 'edits', 'standIn'];

/** The entries the log holds, by path inside assets/: none when there is no log, or it isn't one. */
export function logEntries(log: unknown): Json {
  return isObject(log) && isObject(log.files) ? log.files : {};
}

/** The entry for `path`, if the log holds one. */
export function entryOf(log: unknown, path: string): unknown {
  const files = logEntries(log);
  return Object.hasOwn(files, path) ? files[path] : undefined;
}

/** An entry with its keys in the format's order; keys it doesn't list keep their place after them. */
function ordered(entry: Provenance | Json): Json {
  const given = entry as Json;
  const known = ENTRY_KEYS.filter((key) => given[key] !== undefined).map((key) => [key, given[key]] as const);
  const others = Object.entries(given).filter(([key, value]) => !ENTRY_KEYS.includes(key) && value !== undefined);
  return Object.fromEntries([...known, ...others]);
}

/**
 * The log with `value` at `path` (a JSON path into it, starting with 'files'), or taken out when
 * undefined. A new file's entry goes where its path sorts; a new key where the format lists it.
 */
export function setInLog(log: unknown, path: Path, value: unknown): unknown {
  const files = Object.keys(logEntries(log));
  return setInOrder(isObject(log) ? log : { files: {} }, path, value, (at) => {
    if (at.length === 0) return ['files'];
    if (at.length === 1) return [...new Set([...files, String(path[1])])].sort(byText);
    return at.length === 2 ? ENTRY_KEYS : [];
  });
}

/** The log with the entry for `path` set to `entry`, or taken out when undefined. */
export const withEntry = (log: unknown, path: string, entry: Provenance | undefined): unknown =>
  setInLog(log, ['files', path], entry === undefined ? undefined : ordered(entry));

/** The log with `from`'s entry moved to `to`, where `to` sorts. A log with no entry for `from` stays as it is. */
export function movedEntry(log: unknown, from: string, to: string): unknown {
  const entry = entryOf(log, from);
  if (entry === undefined) return log;
  const without = setInLog(log, ['files', from], undefined);
  return setInLog(without, ['files', to], entry);
}
