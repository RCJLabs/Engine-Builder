/** Where things live in a project folder (docs/specs/project-format.md). */
export const MANIFEST_FILE = 'project.json';
export const RECORDS_DIR = 'records';
/** The project's own record types, one file each (docs/specs/type-files.md, M2.4). */
export const TYPES_DIR = 'types';
export const ASSETS_DIR = 'assets';
/** The assets' provenance log (D34, M2.7): not an asset itself. */
export const ASSETS_LOG = `${ASSETS_DIR}/assets.json`;

/**
 * The folders a project owns: records/, types/ and assets/ now, and the ones later milestones fill
 * (architecture.md, Project format). Export, import and copies take project.json and these, so a
 * project at the root of a game's repo travels without the repo's README or node_modules.
 */
export const PROJECT_FOLDERS: readonly string[] = [
  RECORDS_DIR,
  TYPES_DIR,
  'scenes',
  'ui',
  'scripts',
  'dialogue',
  ASSETS_DIR,
  'locales',
  // A 3D world's places and their reusable parts (M5.1, D63).
  'spaces',
  'prefabs',
];

export type TypeFileRole =
  | { readonly kind: 'type'; readonly type: string }
  /** A .json file under types/ inside a folder: it looks like a type that would be lost. */
  | { readonly kind: 'misplaced' }
  | { readonly kind: 'ignored' };

/** What a file under types/ is. The file name is the type's name, as a record's is its id. */
export function classifyTypeFile(path: string): TypeFileRole {
  const parts = path.split('/');
  const name = parts[parts.length - 1] ?? '';
  if (!name.endsWith('.json')) return { kind: 'ignored' };
  if (parts.length !== 2 || parts[0] !== TYPES_DIR) return { kind: 'misplaced' };
  return { kind: 'type', type: name.slice(0, -'.json'.length) };
}

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
