import { isHiddenName, type ProjectSource } from './source.ts';

/**
 * The parts of the File System API's directory handles the compiler uses. OPFS
 * (`navigator.storage.getDirectory()`) and a folder opened with `showDirectoryPicker()` both hand
 * out these handles, so one source covers both. Declared here because the package leaves out
 * DOM types; the tests check that the real handle type fits.
 */
export interface HandleLike {
  readonly kind: 'file' | 'directory';
  readonly name: string;
}

export interface FileHandleLike extends HandleLike {
  readonly kind: 'file';
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
}

export interface DirectoryHandleLike extends HandleLike {
  readonly kind: 'directory';
  entries(): AsyncIterable<[string, HandleLike]>;
  getDirectoryHandle(name: string): Promise<DirectoryHandleLike>;
  getFileHandle(name: string): Promise<FileHandleLike>;
}

export function directorySource(root: DirectoryHandleLike): ProjectSource {
  return {
    async files(dir) {
      const start = await openDirectory(root, dir === '' ? [] : dir.split('/'));
      const found: string[] = [];
      if (start) await walk(start, dir, found);
      return found;
    },
    async read(path) {
      const parts = path.split('/');
      const name = parts.pop() ?? '';
      const parent = await openDirectory(root, parts);
      const file = parent && (await orUndefined(() => parent.getFileHandle(name)));
      return file ? new Uint8Array(await (await file.getFile()).arrayBuffer()) : undefined;
    },
  };
}

async function walk(dir: DirectoryHandleLike, path: string, found: string[]): Promise<void> {
  for await (const [name, entry] of dir.entries()) {
    if (isHiddenName(name)) continue;
    const child = path === '' ? name : `${path}/${name}`;
    if (entry.kind === 'directory') await walk(entry as DirectoryHandleLike, child, found);
    else found.push(child);
  }
}

async function openDirectory(root: DirectoryHandleLike, parts: readonly string[]) {
  let dir: DirectoryHandleLike | undefined = root;
  for (const part of parts) {
    const parent: DirectoryHandleLike = dir;
    dir = await orUndefined(() => parent.getDirectoryHandle(part));
    if (!dir) return undefined;
  }
  return dir;
}

// The API rejects with a NotFoundError for a missing entry, and a TypeMismatchError when a
// file sits where a folder was expected (or the other way round). Both mean "not there".
async function orUndefined<T>(get: () => Promise<T>): Promise<T | undefined> {
  try {
    return await get();
  } catch (error) {
    const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
    if (name === 'NotFoundError' || name === 'TypeMismatchError') return undefined;
    throw error;
  }
}
