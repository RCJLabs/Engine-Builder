/** Where things live in a project folder (docs/specs/project-format.md). */
export const MANIFEST_FILE = 'project.json';
export const RECORDS_DIR = 'records';

export type RecordFile =
  | { readonly kind: 'record'; readonly type: string; readonly id: string }
  /** A .json file under records/ at the wrong depth: it looks like a record that would be lost. */
  | { readonly kind: 'misplaced' }
  /** Anything else under records/, such as notes or a backup. */
  | { readonly kind: 'ignored' };

/**
 * What a file under records/ is. The folder names the type and the file name the id, so a
 * record's JSON never repeats them and can't disagree with them.
 */
export function classifyRecordFile(path: string): RecordFile {
  const parts = path.split('/');
  const name = parts[parts.length - 1] ?? '';
  if (!name.endsWith('.json')) return { kind: 'ignored' };
  if (parts.length !== 3 || parts[0] !== RECORDS_DIR) return { kind: 'misplaced' };
  return { kind: 'record', type: parts[1] ?? '', id: name.slice(0, -'.json'.length) };
}
