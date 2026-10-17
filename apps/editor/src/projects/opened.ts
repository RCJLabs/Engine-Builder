/**
 * The open project: its working copy, what the Project panel shows of it, and its editing
 * (editing/current.ts). Opening takes the project's lock when no other tab holds it; a stored
 * project saves through the OPFS worker's journal, an opened folder through writable streams
 * once the browser lets the editor change it.
 */
import { directorySource } from '@eb/compiler';
import { signal } from '@preact/signals';
import { note } from '../app/state.ts';
import { editing } from '../editing/current.ts';
import { saveIntoFolder } from '../editing/folderSave.ts';
import { folderLockName, projectLockName } from '../editing/projectLock.ts';
import { type WorkingCopy, workingCopy } from '../editing/workingCopy.ts';
import { type Catalog, readCatalog } from '../forms/catalog.ts';
import { chosen } from '../forms/selection.ts';
import { type FolderHandle, folderAccess } from './folders.ts';
import { type Library, PROJECTS_DIR } from './library.ts';
import type { OpfsWorker } from './opfsClient.ts';
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
}

export const current = signal<OpenProject | null>(null);

/**
 * Counts every change to the open project's files: edits, undos, redos and other tabs' saves. A
 * form reads its record again on each, at once, while the summary and catalog follow a moment later.
 */
export const revision = signal(0);

let refreshing: Promise<void> | null = null;
let again = false;

/**
 * Reads the summary again after an edit or another tab's save. One read runs at a time, and a
 * burst of edits during it costs one more read, not one each.
 */
function refreshOpen(copy: WorkingCopy): void {
  if (refreshing) {
    again = true;
    return;
  }
  refreshing = (async () => {
    do {
      again = false;
      const [summary, catalog] = await Promise.all([summarize(copy), readCatalog(copy)]);
      const open = current.value;
      if (open?.source === copy) current.value = { ...open, summary, catalog };
    } while (again);
  })()
    .catch((error: unknown) => note(`The project couldn’t be read again: ${String(error)}`))
    .finally(() => {
      refreshing = null;
    });
}

async function show(where: OpenProject['where'], label: string, copy: WorkingCopy): Promise<string | undefined> {
  const [summary, catalog] = await Promise.all([summarize(copy), readCatalog(copy)]);
  chosen.value = null;
  current.value = { where, label, source: copy, summary, catalog };
  return summary.project?.name;
}

/** What a change to the files tells everything that shows them. */
function changed(copy: WorkingCopy): void {
  revision.value++;
  refreshOpen(copy);
}

export async function openStored(library: Library, worker: OpfsWorker, folder: string): Promise<void> {
  const base = [PROJECTS_DIR, folder];
  const copy = workingCopy(await library.open(folder));
  note(`Opened ${(await show('browser', folder, copy)) ?? folder} from this browser.`);
  await editing.open({
    lockName: projectLockName(folder),
    copy,
    write: (files) => worker.save(base, files),
    recover: () => worker.recover(base),
    changed: () => changed(copy),
  });
}

/** `key` is the folder's in the recent list, shared by every tab that opens it; null without the list. */
export async function openFolderProject(handle: FolderHandle, key: number | null): Promise<void> {
  const copy = workingCopy(directorySource(handle));
  await show('folder', handle.name, copy);
  note(`Opened the folder ${handle.name}.`);
  await editing.open({
    lockName: folderLockName(key ?? `name:${handle.name}`),
    copy,
    write: (files) => saveIntoFolder(handle, files),
    writable: {
      allowed: async () => (await folderAccess(handle, false, 'readwrite')) === 'granted',
      ask: async () => (await folderAccess(handle, true, 'readwrite')) === 'granted',
    },
    changed: () => changed(copy),
  });
}

/** Saves what it can and lets the project go. The panel goes back to the library at once. */
export function closeOpen(): Promise<void> {
  current.value = null;
  chosen.value = null;
  return editing.close();
}
