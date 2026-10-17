/**
 * The editor's projects: what is stored, what is open, and the actions the Project panel offers.
 * One action runs at a time; each notes what happened in the console and leaves a failure in
 * `trouble` for the panel to show.
 */
import { directorySource, type ProjectSource, zipProject, zipSource } from '@eb/compiler';
import { signal } from '@preact/signals';
import { note } from '../app/state.ts';
import { saveFile } from './download.ts';
import type { DirectoryLike } from './files.ts';
import { idbFolderStore } from './folderStore.ts';
import {
  type FolderHandle,
  type FolderRecord,
  type FolderStore,
  folderAccess,
  pickFolder,
  recentFolders,
  rememberFolder,
} from './folders.ts';
import { createLibrary, type Library, type LibraryEntry, PROJECTS_DIR } from './library.ts';
import { opfsWorker } from './opfsClient.ts';
import { requestPersistence, type StorageState, sizeText, storageState } from './storage.ts';
import { type ProjectSummary, summarize } from './summary.ts';

/** The most a zip may hold to be imported: plenty for records, bounded for a phone's memory. */
export const ZIP_LIMITS = { maxFiles: 10_000, maxBytes: 100_000_000 } as const;

export interface OpenProject {
  readonly where: 'browser' | 'folder';
  /** The library folder, or the opened folder's name. */
  readonly label: string;
  readonly source: ProjectSource;
  readonly summary: ProjectSummary;
}

export const library = signal<readonly LibraryEntry[] | null>(null);
export const folders = signal<readonly FolderRecord[]>([]);
export const current = signal<OpenProject | null>(null);
export const storage = signal<StorageState | null>(null);
/** What is happening now, or null when the panel is free. */
export const busy = signal<string | null>(null);
export const trouble = signal<string | null>(null);

let stored: Library | null = null;
let remembered: FolderStore | null = null;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Opens OPFS and the folder list. A browser without OPFS (Firefox's private windows) still gets zips and folders. */
export async function startProjects(): Promise<void> {
  try {
    const opfs = (await navigator.storage.getDirectory()) as unknown as DirectoryLike;
    const root = await opfs.getDirectoryHandle(PROJECTS_DIR, { create: true });
    const worker = opfsWorker();
    stored = createLibrary(root, (folder, files) => worker.write([PROJECTS_DIR, folder], files));
  } catch (error) {
    trouble.value = `This browser can't store projects (${message(error)}). Zips and opened folders still work.`;
  }
  try {
    remembered = idbFolderStore();
  } catch {
    remembered = null;
  }
  await refresh().catch((error: unknown) => {
    library.value = [];
    trouble.value = `The stored projects couldn’t be listed: ${message(error)}`;
  });
}

async function refresh(): Promise<void> {
  library.value = stored ? await stored.list() : [];
  folders.value = remembered ? await recentFolders(remembered).catch(() => []) : [];
  storage.value = await storageState();
}

async function run(label: string, action: () => Promise<void>): Promise<void> {
  if (busy.value) return;
  busy.value = label;
  trouble.value = null;
  try {
    await action();
  } catch (error) {
    trouble.value = message(error);
    note(`${label} failed: ${message(error)}`);
  } finally {
    busy.value = null;
  }
}

const needLibrary = (): Library => {
  if (!stored) throw new Error('This browser can’t store projects.');
  return stored;
};

let askedToKeep = false;

/** Asks the browser to keep the editor's storage, once there is something in it to keep, once a session. */
async function keep(): Promise<void> {
  if (storage.value?.kept || askedToKeep) return;
  askedToKeep = true;
  if ((await requestPersistence()) !== 'granted') {
    note('The browser may clear stored projects when space runs low: export zips to keep copies.');
  }
}

async function openStored(folder: string): Promise<void> {
  const source = await needLibrary().open(folder);
  const summary = await summarize(source);
  current.value = { where: 'browser', label: folder, source, summary };
  note(`Opened ${summary.project?.name ?? folder} from this browser.`);
}

async function show(handle: FolderHandle): Promise<void> {
  const source = directorySource(handle);
  const summary = await summarize(source);
  current.value = { where: 'folder', label: handle.name, source, summary };
  note(`Opened the folder ${handle.name}.`);
  // The folder is open either way; failing to remember it only costs the shortcut next time.
  await rememberFolder(remembered ?? noStore, handle, Date.now()).catch((error: unknown) =>
    note(`The folder list couldn’t keep ${handle.name}: ${message(error)}`),
  );
}

const noStore: FolderStore = { all: async () => [], add: async () => undefined, remove: async () => undefined };

export const newProject = (name: string) =>
  run('Creating the project', async () => {
    const folder = await needLibrary().create(name);
    await keep();
    await refresh();
    await openStored(folder);
  });

export const importZip = (file: File) =>
  run(`Importing ${file.name}`, async () => {
    const folder = await needLibrary().copyIn(readZip(new Uint8Array(await file.arrayBuffer()), file.name));
    await keep();
    await refresh();
    await openStored(folder);
  });

function readZip(bytes: Uint8Array, name: string): ProjectSource {
  try {
    return zipSource(bytes, ZIP_LIMITS);
  } catch (error) {
    // The limits explain themselves; anything else means fflate couldn't read it as a zip.
    if (error instanceof RangeError) throw error;
    throw new Error(`${name} isn’t a zip this editor can read.`);
  }
}

export const openStoredProject = (folder: string) => run('Opening the project', () => openStored(folder));

export const deleteStoredProject = (folder: string) =>
  run('Deleting the project', async () => {
    await needLibrary().remove(folder);
    if (current.value?.where === 'browser' && current.value.label === folder) current.value = null;
    note(`Deleted ${folder} from this browser.`);
    await refresh();
  });

export const exportStoredProject = (folder: string) =>
  run('Exporting the project', async () => {
    const source = await needLibrary().open(folder);
    await exportSource(source, await summarize(source), folder);
  });

export const exportCurrent = () =>
  run('Exporting the project', async () => {
    const open = current.value;
    if (open) await exportSource(open.source, open.summary, open.label);
  });

async function exportSource(source: ProjectSource, summary: ProjectSummary, fallback: string): Promise<void> {
  const top = summary.project?.id ?? fallback;
  const bytes = await zipProject(source, top);
  const name = summary.project ? `${top}-${summary.project.version}.zip` : `${top}.zip`;
  saveFile(bytes, name);
  note(`Exported ${name} (${sizeText(bytes.byteLength)}).`);
}

export const openFolder = () =>
  run('Opening a folder', async () => {
    const handle = await pickFolder();
    if (handle) await show(handle);
    await refresh();
  });

export const reopenFolder = (record: FolderRecord) =>
  run(`Opening ${record.name}`, async () => {
    if ((await folderAccess(record.handle, true)) !== 'granted') {
      throw new Error(`The browser didn’t allow reading ${record.name}. Choose Open again to be asked again.`);
    }
    await show(record.handle);
    await refresh();
  });

export const forgetFolder = (record: FolderRecord) =>
  run(`Forgetting ${record.name}`, async () => {
    await remembered?.remove(record.key);
    await refresh();
  });

/** Copies the open folder's project into this browser, then opens the copy. */
export const copyCurrentIn = () =>
  run('Copying into this browser', async () => {
    const open = current.value;
    if (!open) return;
    const folder = await needLibrary().copyIn(open.source);
    await keep();
    await refresh();
    await openStored(folder);
  });

export function closeProject(): void {
  current.value = null;
  trouble.value = null;
}
