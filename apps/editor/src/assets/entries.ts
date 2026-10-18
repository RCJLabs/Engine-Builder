/**
 * A provenance entry written before it goes into the log (M2.7): set key by key in the format's
 * order, and checked as the compiler checks it, for every file it will cover.
 */
import { checkProvenance, type Diagnostic } from '@eb/schema';
import { type Path, setInOrder } from '../forms/values.ts';
import { logPointer } from './assetList.ts';
import { ENTRY_KEYS } from './assetLog.ts';

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** An entry with the value at `at` set, or taken out; keys in the format's order. */
export const entryWith = (entry: unknown, at: Path, next: unknown): Json =>
  setInOrder(isObject(entry) ? entry : {}, at, next, (where) => (where.length === 0 ? ENTRY_KEYS : [])) as Json;

/** What a new entry's boxes say while they are empty. */
const ASKS: Record<string, string> = {
  licence: 'Choose a licence',
  source: 'Say where it came from: a link, or words',
  date: 'Write the date, like 2026-10-18',
};

/**
 * The problems an entry would have for each of `paths`, as the compiler would give them, by
 * pointer into the entry: each once, however many files share it. Until `tried`, only boxes
 * with something in them show theirs, so a new form doesn't open on a list of what it lacks.
 */
export function entryProblems(entry: unknown, paths: readonly string[], tried: boolean): Diagnostic[] {
  const found = new Map<string, Diagnostic>();
  const given = isObject(entry) ? entry : {};
  for (const path of paths) {
    const prefix = logPointer(path, '');
    for (const issue of checkProvenance({ files: { [path]: entry } }, new Set([path]))) {
      const pointer = issue.path.startsWith(prefix) ? issue.path.slice(prefix.length) : '';
      const key = pointer.split('/')[1] ?? '';
      if (!tried && given[key] === undefined) continue;
      // A blank form asks in its own words; the code and place are the compiler's.
      const message = issue.message.startsWith('Missing field') ? (ASKS[key] ?? issue.message) : issue.message;
      const said = `${pointer} ${message}`;
      if (!found.has(said)) found.set(said, { code: issue.code, severity: 'error', message, path: pointer });
    }
  }
  return [...found.values()];
}
