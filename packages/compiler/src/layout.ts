/** Where things live in a project folder (docs/specs/project-format.md). */
export const MANIFEST_FILE = 'project.json';
export const RECORDS_DIR = 'records';

/**
 * The folders a project owns: records/ now, and the ones later milestones fill (architecture.md,
 * Project format). Export, import and copies take project.json and these, so a project at the root
 * of a game's repo travels without the repo's README or node_modules.
 */
export const PROJECT_FOLDERS: readonly string[] = [
  RECORDS_DIR,
  'scenes',
  'ui',
  'scripts',
  'dialogue',
  'assets',
  'locales',
];

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
