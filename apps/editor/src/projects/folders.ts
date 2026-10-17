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
  /** Replaces the record with the same key. */
  put(record: FolderRecord): Promise<void>;
  remove(key: number): Promise<void>;
}

/** Folders open to be read. Changing one is asked for separately, with a tap, before its first edit (M2.3). */
type Mode = 'read' | 'readwrite';
export const RECENT_FOLDERS = 8;

type Picker = (options: { id: string; mode: 'read' | 'readwrite' }) => Promise<FolderHandle>;
const picker = () => (globalThis as { showDirectoryPicker?: Picker }).showDirectoryPicker;

export const canOpenFolders = (): boolean => typeof picker() === 'function';

/** The folder the user picks, or null when they cancel. */
export async function pickFolder(): Promise<FolderHandle | null> {
  const pick = picker();
  if (!pick) return null;
  try {
    return await pick({ id: 'eb-project', mode: 'read' });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') return null;
    throw error;
  }
}

/**
 * Whether the editor may read the folder, or with `readwrite` change it. With `ask`, the browser
 * may show its prompt, which needs a tap.
 */
export async function folderAccess(handle: FolderHandle, ask: boolean, mode: Mode = 'read'): Promise<PermissionState> {
  if (!handle.queryPermission) return 'granted';
  const state = await handle.queryPermission({ mode });
  if (state === 'granted' || !ask || !handle.requestPermission) return state;
  return handle.requestPermission({ mode });
}

/**
 * Puts the folder first among the recent ones, once, keeping the newest RECENT_FOLDERS. Returns
 * its key, which stays the same each time the folder is opened again, so every tab that opens it
 * names its lock alike.
 */
export async function rememberFolder(store: FolderStore, handle: FolderHandle, now: number): Promise<number | null> {
  let kept: FolderRecord | null = null;
  for (const record of await store.all()) {
    if (!(await record.handle.isSameEntry(handle))) continue;
    // A second record of the same folder comes from M2.1, which added one each time it opened.
    if (kept) await store.remove(record.key);
    else kept = record;
  }
  if (kept) await store.put({ ...kept, name: handle.name, opened: now, handle });
  else await store.add({ name: handle.name, opened: now, handle });
  const newest = (await store.all()).sort((a, b) => b.opened - a.opened);
  for (const old of newest.slice(RECENT_FOLDERS)) await store.remove(old.key);
  for (const record of newest.slice(0, RECENT_FOLDERS)) if (await record.handle.isSameEntry(handle)) return record.key;
  return null;
}

/** Newest first. */
export const recentFolders = async (store: FolderStore): Promise<FolderRecord[]> =>
  (await store.all()).sort((a, b) => b.opened - a.opened);
