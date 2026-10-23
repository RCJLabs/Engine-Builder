/**
 * What the Problems panel shows of each problem (M2.8): where it is fixed, the words for its
 * file and its place there, and the panel's view, as plain functions.
 */
import {
  ASSETS_DIR,
  ASSETS_LOG,
  classifyRecordFile,
  classifyScene,
  classifyTypeFile,
  classifyUi,
  EXPORT_FILE,
  MANIFEST_FILE,
  RECORDS_DIR,
  SCENES_DIR,
  TYPES_DIR,
  UI_DIR,
} from '@eb/compiler';
import { pointerKeys } from '@eb/core';
import type { Diagnostic } from '@eb/schema';
import { classifyScript, SCRIPTS_DIR } from '@eb/script';
import type { Catalog } from '../forms/catalog.ts';
import { nameIn } from '../records/names.ts';
import { describePath } from '../records/paths.ts';
import type { RecordIndex } from '../records/recordIndex.ts';

/** Where the editor fixes a problem: a record's field, a type, an asset, a script's or a scene's line (M3.2, M3.11), or a panel. */
export type Place =
  | { readonly kind: 'record'; readonly type: string; readonly id: string; readonly at: string }
  | { readonly kind: 'type'; readonly type: string }
  | { readonly kind: 'asset'; readonly path: string }
  | { readonly kind: 'script'; readonly id: string; readonly line?: number; readonly column?: number }
  | { readonly kind: 'scene'; readonly id: string; readonly line?: number; readonly column?: number }
  | { readonly kind: 'ui'; readonly path: string; readonly line?: number; readonly column?: number }
  | { readonly kind: 'panel'; readonly panel: 'project' | 'assets' };

/** The script a file under scripts/ is, or undefined for one the compiler ignores or that is misplaced. */
const scriptOf = (file: string): string | undefined => {
  if (!file.startsWith(`${SCRIPTS_DIR}/`)) return undefined;
  const role = classifyScript(file);
  return role.kind === 'script' ? role.id : undefined;
};

/** What a file under ui/ is, when it is a screen or the theme (M4.1). */
const uiOf = (file: string) => {
  if (!file.startsWith(`${UI_DIR}/`)) return undefined;
  const role = classifyUi(file);
  return role.kind === 'ignored' ? undefined : role;
};

/** Where `problem` is fixed, or null for a file the editor has no place for (a misplaced file). */
export function placeOf(problem: Diagnostic, catalog: Catalog): Place | null {
  const file = problem.file ?? '';
  if (file === MANIFEST_FILE || file === EXPORT_FILE) return { kind: 'panel', panel: 'project' };
  if (file.startsWith(`${RECORDS_DIR}/`)) {
    const role = classifyRecordFile(file);
    return role.kind === 'record' ? { kind: 'record', type: role.type, id: role.id, at: problem.path } : null;
  }
  if (file.startsWith(`${TYPES_DIR}/`)) {
    const role = classifyTypeFile(file);
    return role.kind === 'type' ? { kind: 'type', type: role.type } : null;
  }
  if (file === ASSETS_LOG) {
    // An entry for a file that is there opens the file; the log's own problems, the panel.
    const [files, asset] = pointerKeys(problem.path);
    return files === 'files' && asset !== undefined && catalog.assets.includes(asset)
      ? { kind: 'asset', path: asset }
      : { kind: 'panel', panel: 'assets' };
  }
  if (file.startsWith(`${ASSETS_DIR}/`)) return { kind: 'asset', path: file.slice(ASSETS_DIR.length + 1) };
  const { line, column } = problem;
  const at = { ...(line !== undefined ? { line } : {}), ...(column !== undefined ? { column } : {}) };
  const script = scriptOf(file);
  if (script !== undefined) return { kind: 'script', id: script, ...at };
  const scene = file.startsWith(`${SCENES_DIR}/`) ? classifyScene(file) : undefined;
  if (scene?.kind === 'scene') return { kind: 'scene', id: scene.id, ...at };
  const ui = uiOf(file);
  if (ui !== undefined) return { kind: 'ui', path: file, ...at };
  return null;
}

/** What a file's problems are listed under: the record's type and name, a type's title, or the path. */
export function fileTitle(file: string, catalog: Catalog, index: RecordIndex | null): string {
  if (file === MANIFEST_FILE) return 'Project settings (project.json)';
  if (file === ASSETS_LOG) return 'Provenance log (assets/assets.json)';
  const record = file.startsWith(`${RECORDS_DIR}/`) ? classifyRecordFile(file) : null;
  if (record?.kind === 'record') {
    const typeFile = catalog.types.get(record.type)?.file;
    const name = nameIn(typeFile, index?.records.get(`${record.type}:${record.id}`)?.value);
    return `${typeFile?.title ?? record.type} ${name ?? record.id}`;
  }
  const type = file.startsWith(`${TYPES_DIR}/`) ? classifyTypeFile(file) : null;
  if (type?.kind === 'type') return `Type ${catalog.types.get(type.type)?.file.title ?? type.type}`;
  const script = scriptOf(file);
  if (script !== undefined) return `Script ${script}.ts`;
  const scene = file.startsWith(`${SCENES_DIR}/`) ? classifyScene(file) : null;
  if (scene?.kind === 'scene') return `Scene ${scene.id}.ink`;
  const ui = uiOf(file);
  if (ui !== undefined) {
    if (ui.kind === 'theme') return 'Theme (ui/theme.json)';
    if (ui.kind === 'shell') return 'Shell (ui/shell.json)';
    return ui.kind === 'feedback' ? 'Feedback (ui/feedback.json)' : `Screen ${ui.id}`;
  }
  if (file === '') return 'The game';
  return file;
}

/** Where in its file a problem is, in words; '' for the file as a whole. */
export function whereOf(problem: Diagnostic, catalog: Catalog): string {
  const file = problem.file ?? '';
  // A script's and a scene's problems are at lines (M3.2, M3.11).
  if (problem.line !== undefined)
    return `line ${problem.line}${problem.column !== undefined ? `, column ${problem.column}` : ''}`;
  const keys = pointerKeys(problem.path);
  if (problem.type !== undefined && file.startsWith(`${RECORDS_DIR}/`)) {
    return describePath(catalog.types.get(problem.type)?.file, problem.path);
  }
  // A type file's path runs through "fields" and "of"; its field names say where.
  if (file.startsWith(`${TYPES_DIR}/`)) return keys.filter((key) => key !== 'fields' && key !== 'of').join(' › ');
  if (file === ASSETS_LOG && keys[0] === 'files') return keys.slice(1).join(' › ');
  return keys.join(' › ');
}

export interface ProblemGroup {
  readonly file: string;
  readonly title: string;
  readonly problems: readonly Diagnostic[];
}

/** The problems by file, in the compiler's order: they are sorted by file first. */
export function groupProblems(
  problems: readonly Diagnostic[],
  catalog: Catalog,
  index: RecordIndex | null,
): ProblemGroup[] {
  const groups: ProblemGroup[] = [];
  for (const problem of problems) {
    const file = problem.file ?? '';
    const last = groups.at(-1);
    if (last && last.file === file) (last.problems as Diagnostic[]).push(problem);
    else groups.push({ file, title: fileTitle(file, catalog, index), problems: [problem] });
  }
  return groups;
}

export interface ProblemView {
  readonly severity: 'all' | 'error' | 'warning';
  readonly search: string;
}

export const ALL_PROBLEMS: ProblemView = { severity: 'all', search: '' };

/** The groups a view shows: problems of its severity whose words hold every word searched, empty groups left out. */
export function shownGroups(groups: readonly ProblemGroup[], view: ProblemView, catalog: Catalog): ProblemGroup[] {
  const words = view.search.toLowerCase().split(/\s+/).filter(Boolean);
  const fits = (group: ProblemGroup, problem: Diagnostic) => {
    if (view.severity !== 'all' && problem.severity !== view.severity) return false;
    const text = [problem.code, problem.message, group.file, group.title, whereOf(problem, catalog)]
      .join('\n')
      .toLowerCase();
    return words.every((word) => text.includes(word));
  };
  return groups
    .map((group) => ({ ...group, problems: group.problems.filter((problem) => fits(group, problem)) }))
    .filter((group) => group.problems.length > 0);
}
