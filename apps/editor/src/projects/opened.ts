/**
 * The open project: its working copy, what the Project panel shows of it, and its editing
 * (editing/current.ts). Opening takes the project's lock when no other tab holds it; a stored
 * project saves through the OPFS worker's journal, an opened folder through writable streams
 * once the browser lets the editor change it. Its scripts are checked, and run when it is
 * trusted, in the script worker (M3.2, D38).
 */
import { directorySource, MANIFEST_FILE } from '@eb/compiler';
import { SCRIPTS_DIR } from '@eb/script';
import { signal } from '@preact/signals';
import { note, noteError } from '../app/state.ts';
import { editing } from '../editing/current.ts';
import { saveIntoFolder } from '../editing/folderSave.ts';
import { folderLockName, projectLockName } from '../editing/projectLock.ts';
import { type WorkingCopy, workingCopy } from '../editing/workingCopy.ts';
import { type Catalog, readCatalog } from '../forms/catalog.ts';
import { chosen } from '../forms/selection.ts';
import type { RecordIndex } from '../records/recordIndex.ts';
import { forgetTables } from '../records/viewState.ts';
import { type GameState, gameChecks, isScriptPath, NO_SCRIPTS, readGameState } from '../scripts/gameState.ts';
import { type ScriptWorker, scriptWorker } from '../scripts/scriptWorker.ts';
import { folderKey, libraryKey, pageKey, type TrustKey, trust } from '../scripts/trust.ts';
import { type FolderHandle, folderAccess } from './folders.ts';
import { type Library, PROJECTS_DIR } from './library.ts';
import type { OpfsWorker } from './opfsClient.ts';
import { coalesce, type Refresh } from './refresh.ts';
import { type ProjectSummary, summarize } from './summary.ts';

export interface OpenProject {
  readonly where: 'browser' | 'folder';
  /** The library folder, or the opened folder's name. */
  readonly label: string;
  /** The project as the editor sees it, unsaved edits included. */
  readonly source: WorkingCopy;
  readonly summary: ProjectSummary;
  /** Its types, records and assets, for forms (M2.4). */
  readonly catalog: Catalog;
  /** Every record read and checked, for tables and "used by" (M2.5); null until first read. */
  readonly index: RecordIndex | null;
  /** Its scripts and the game they make (M3.2): what records are checked against once it loads. */
  readonly game: GameState;
  /** What the answer to "run its scripts?" is kept by (D38). */
  readonly trustKey: TrustKey;
}

export const current = signal<OpenProject | null>(null);

/**
 * Counts every change to the open project's files: edits, undos, redos and other tabs' saves. A
 * form reads its record again on each, at once, while the summary, catalog and index follow.
 */
export const revision = signal(0);

/**
 * Counts the changes that may change the game rather than its screens: any naming a file outside
 * ui/, or naming none. The designer's game is compiled again only on these (M4.5).
 */
export const gameRevision = signal(0);

/** Whether a change may change the game: one naming no files, or any outside ui/. */
export const changesGame = (paths: readonly string[] | undefined): boolean =>
  !paths || paths.some((path) => !path.startsWith('ui/'));

// How many changes have named each file, and how many named none, which may have changed any.
const versions = new Map<string, number>();
let unnamed = 0;

/**
 * A key that changes whenever the file at `path` may have: what a view of its bytes, such as an
 * asset's thumbnail (M2.7), is keyed by, so a change to one file reads no other file again.
 */
export function fileVersion(path: string): string {
  void revision.value;
  return `${unnamed}.${versions.get(path) ?? 0}`;
}

/**
 * The record index and the checks it runs load with the first project opened, not with the
 * editor, as the record form does (M2.4).
 */
let indexModule: Promise<typeof import('../records/recordIndex.ts')> | null = null;
function loadIndex() {
  if (!indexModule) indexModule = import('../records/recordIndex.ts');
  return indexModule;
}

/** The screens' checks (M4.1) load with the index, after it. */
let screenChecks: Promise<typeof import('../screens/screenChecks.ts')> | null = null;
function loadScreenChecks() {
  if (!screenChecks) screenChecks = import('../screens/screenChecks.ts');
  return screenChecks;
}

/** Checks scripts, and runs them, for whichever project is open. Started by the first project with scripts. */
let checker: ScriptWorker | null = null;

/**
 * Reads the summary, the catalog and the record index again after changes to `copy`, one read
 * at a time (refresh.ts). The summary and catalog show first; then the game, when a script may
 * have changed; the index, slower, follows, checked against the game.
 */
function refresher(copy: WorkingCopy): Refresh {
  return coalesce(
    async (paths) => {
      const [summary, catalog] = await Promise.all([summarize(copy), readCatalog(copy)]);
      let open = current.value;
      if (open?.source !== copy) return false;
      current.value = { ...open, summary, catalog };
      let { game } = open;
      // project.json too: its kits join the game the scripts make (M3.3).
      if (paths === null || paths.some((path) => isScriptPath(path) || path === MANIFEST_FILE)) {
        checker ??= scriptWorker();
        game = await readGameState(copy, checker, trust.trusted(open.trustKey));
        open = current.value;
        if (open?.source !== copy) return false;
        current.value = { ...open, game };
      }
      const { EMPTY_INDEX, updateIndex } = await loadIndex();
      const checks = gameChecks(game);
      const updated = await updateIndex(open.index ?? EMPTY_INDEX, copy, catalog, open.index ? paths : null, checks);
      const { screenProblems } = await loadScreenChecks();
      const index = { ...updated, screens: await screenProblems(copy, catalog, updated, game) };
      open = current.value;
      if (open?.source !== copy) return false;
      current.value = { ...open, index };
      return true;
    },
    (error) => noteError(`The project couldn’t be read again: ${String(error)}`),
  );
}

/** The open project's refresh, for a change that isn't to its files: trust given (runScripts). */
let refreshOpen: Refresh | null = null;

async function show(where: OpenProject['where'], label: string, copy: WorkingCopy, refresh: Refresh, key: TrustKey) {
  const [summary, catalog] = await Promise.all([summarize(copy), readCatalog(copy)]);
  chosen.value = null;
  forgetTables();
  current.value = { where, label, source: copy, summary, catalog, index: null, game: NO_SCRIPTS, trustKey: key };
  refreshOpen = refresh;
  refresh(null);
  return summary.project?.name;
}

/** Lets the open project's scripts run here from now on (D38), and runs them. */
export function runScripts(): void {
  const open = current.value;
  if (!open) return;
  trust.trust(open.trustKey);
  note(`${open.summary.project?.name ?? open.label} may run its scripts in this browser now.`);
  refreshOpen?.([SCRIPTS_DIR]);
}

/** What a change to the files tells everything that shows them. */
function changed(refresh: Refresh, paths: readonly string[] | undefined): void {
  if (paths) for (const path of paths) versions.set(path, (versions.get(path) ?? 0) + 1);
  else unnamed++;
  if (changesGame(paths)) gameRevision.value++;
  revision.value++;
  refresh(paths ?? null);
}

export async function openStored(library: Library, worker: OpfsWorker, folder: string): Promise<void> {
  const base = [PROJECTS_DIR, folder];
  const copy = workingCopy(await library.open(folder));
  const refresh = refresher(copy);
  note(`Opened ${(await show('browser', folder, copy, refresh, libraryKey(folder))) ?? folder} from this browser.`);
  await editing.open({
    lockName: projectLockName(folder),
    copy,
    write: (files) => worker.save(base, files),
    recover: () => worker.recover(base),
    changed: (paths) => changed(refresh, paths),
  });
}

/** `key` is the folder's in the recent list, shared by every tab that opens it; null without the list. */
export async function openFolderProject(handle: FolderHandle, key: number | null): Promise<void> {
  const copy = workingCopy(directorySource(handle));
  const refresh = refresher(copy);
  await show('folder', handle.name, copy, refresh, key === null ? pageKey(handle.name) : folderKey(key));
  note(`Opened the folder ${handle.name}.`);
  await editing.open({
    lockName: folderLockName(key ?? `name:${handle.name}`),
    copy,
    write: (files) => saveIntoFolder(handle, files),
    writable: {
      allowed: async () => (await folderAccess(handle, false, 'readwrite')) === 'granted',
      ask: async () => (await folderAccess(handle, true, 'readwrite')) === 'granted',
    },
    changed: (paths) => changed(refresh, paths),
  });
}

/** Saves what it can and lets the project go. The panel goes back to the library at once. */
export function closeOpen(): Promise<void> {
  current.value = null;
  refreshOpen = null;
  chosen.value = null;
  forgetTables();
  return editing.close();
}
