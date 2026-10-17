/**
 * Folders opened from disk with showDirectoryPicker (desktop Chromium), remembered so they can be
 * reopened. A remembered handle keeps its folder but not always its permission: Chrome asks again
 * after a reload unless the user chose "Allow on every visit" or installed the app.
 */
import type { DirectoryLike } from './files.ts';

/** A handle as showDirectoryPicker gives it. TypeScript's DOM types leave out the permission methods. */
export interface FolderHandle extends DirectoryLike {
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  isSameEntry(other: FolderHandle): Promise<boolean>;
}

export interface FolderRecord {
  readonly key: number;
  readonly name: string;
  /** When it was last opened, in ms since 1970. */
  readonly opened: number;
  readonly handle: FolderHandle;
}

export interface FolderStore {
  all(): Promise<FolderRecord[]>;
  add(record: Omit<FolderRecord, 'key'>): Promise<void>;
  remove(key: number): Promise<void>;
}

/** M2.1 only reads an opened folder. Editing (M2.3) asks for readwrite, once, when it first saves. */
const MODE = { mode: 'read' } as const;
export const RECENT_FOLDERS = 8;

type Picker = (options: { id: string; mode: 'read' | 'readwrite' }) => Promise<FolderHandle>;
const picker = () => (globalThis as { showDirectoryPicker?: Picker }).showDirectoryPicker;

export const canOpenFolders = (): boolean => typeof picker() === 'function';

/** The folder the user picks, or null when they cancel. */
export async function pickFolder(): Promise<FolderHandle | null> {
  const pick = picker();
  if (!pick) return null;
  try {
    return await pick({ id: 'eb-project', ...MODE });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') return null;
    throw error;
  }
}

/** Whether the editor may read the folder. With `ask`, the browser may show its prompt, which needs a tap. */
export async function folderAccess(handle: FolderHandle, ask: boolean): Promise<PermissionState> {
  if (!handle.queryPermission) return 'granted';
  const state = await handle.queryPermission(MODE);
  if (state === 'granted' || !ask || !handle.requestPermission) return state;
  return handle.requestPermission(MODE);
}

/** Puts the folder first among the recent ones, once, keeping the newest RECENT_FOLDERS. */
export async function rememberFolder(store: FolderStore, handle: FolderHandle, now: number): Promise<void> {
  for (const record of await store.all()) {
    if (await record.handle.isSameEntry(handle)) await store.remove(record.key);
  }
  await store.add({ name: handle.name, opened: now, handle });
  const newest = (await store.all()).sort((a, b) => b.opened - a.opened);
  for (const old of newest.slice(RECENT_FOLDERS)) await store.remove(old.key);
}

/** Newest first. */
export const recentFolders = async (store: FolderStore): Promise<FolderRecord[]> =>
  (await store.all()).sort((a, b) => b.opened - a.opened);
