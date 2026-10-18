/**
 * The open project: its working copy, what the Project panel shows of it, and its editing
 * (editing/current.ts). Opening takes the project's lock when no other tab holds it; a stored
 * project saves through the OPFS worker's journal, an opened folder through writable streams
 * once the browser lets the editor change it.
 */
import { directorySource } from '@eb/compiler';
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
}

export const current = signal<OpenProject | null>(null);

/**
 * Counts every change to the open project's files: edits, undos, redos and other tabs' saves. A
 * form reads its record again on each, at once, while the summary, catalog and index follow.
 */
export const revision = signal(0);

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

/**
 * Reads the summary, the catalog and the record index again after changes to `copy`, one read
 * at a time (refresh.ts). The summary and catalog show first; the index, slower, follows.
 */
function refresher(copy: WorkingCopy): Refresh {
  return coalesce(
    async (paths) => {
      const [summary, catalog] = await Promise.all([summarize(copy), readCatalog(copy)]);
      let open = current.value;
      if (open?.source !== copy) return false;
      current.value = { ...open, summary, catalog };
      const { EMPTY_INDEX, updateIndex } = await loadIndex();
      const index = await updateIndex(open.index ?? EMPTY_INDEX, copy, catalog, open.index ? paths : null);
      open = current.value;
      if (open?.source !== copy) return false;
      current.value = { ...open, index };
      return true;
    },
    (error) => noteError(`The project couldn’t be read again: ${String(error)}`),
  );
}

async function show(where: OpenProject['where'], label: string, copy: WorkingCopy, refresh: Refresh) {
  const [summary, catalog] = await Promise.all([summarize(copy), readCatalog(copy)]);
  chosen.value = null;
  forgetTables();
  current.value = { where, label, source: copy, summary, catalog, index: null };
  refresh(null);
  return summary.project?.name;
}

/** What a change to the files tells everything that shows them. */
function changed(refresh: Refresh, paths: readonly string[] | undefined): void {
  if (paths) for (const path of paths) versions.set(path, (versions.get(path) ?? 0) + 1);
  else unnamed++;
  revision.value++;
  refresh(paths ?? null);
}

export async function openStored(library: Library, worker: OpfsWorker, folder: string): Promise<void> {
  const base = [PROJECTS_DIR, folder];
  const copy = workingCopy(await library.open(folder));
  const refresh = refresher(copy);
  note(`Opened ${(await show('browser', folder, copy, refresh)) ?? folder} from this browser.`);
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
  await show('folder', handle.name, copy, refresh);
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
  chosen.value = null;
  forgetTables();
  return editing.close();
}
