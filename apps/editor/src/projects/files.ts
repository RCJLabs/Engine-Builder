/**
 * The parts of the File System API the editor's storage uses, declared as shapes so the tests can
 * hand it an in-memory file system. OPFS (`navigator.storage.getDirectory()`) and a folder opened
 * with `showDirectoryPicker()` both give handles that fit; the tests check the real types do.
 */
export interface EntryLike {
  readonly kind: 'file' | 'directory';
  readonly name: string;
}

export interface FileLike extends EntryLike {
  readonly kind: 'file';
  getFile(): Promise<Blob>;
}

export interface DirectoryLike extends EntryLike {
  readonly kind: 'directory';
  entries(): AsyncIterable<[string, EntryLike]>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileLike>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}

/** A file to write: its path inside a project, with `/` between folders, and its bytes. */
export interface ProjectFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** A name a folder can hold that stays inside it: not empty, `.` or `..`, and no `/`, `\` or NUL. */
export function checkName(name: string): string {
  if (name === '' || name === '.' || name === '..' || /[/\\\0]/.test(name)) {
    throw new Error(`"${name}" can't be a file or folder name.`);
  }
  return name;
}

/** A path inside a project, split into names, each checked. A zip entry like `../x` stops here. */
export const pathParts = (path: string): string[] => path.split('/').map(checkName);

/** The API's way of saying a file or folder isn't there. */
export function isNotFound(error: unknown): boolean {
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
  return name === 'NotFoundError' || name === 'TypeMismatchError';
}
