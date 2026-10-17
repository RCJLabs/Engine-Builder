/**
 * Writing project files into OPFS. It runs in a worker (opfs.worker.ts) because sync access
 * handles exist only there, and they are the one way to write an OPFS file that every engine has:
 * Chrome 102, Firefox 111 and Safari 15.2. `createWritable` reached Safari only in 26.
 */
import { checkName, type DirectoryLike, type FileLike, type ProjectFile, pathParts } from './files.ts';

interface SyncAccess {
  // Chrome before 108 returned promises from all but read and write, as early Safari may; awaiting covers both.
  truncate(size: number): unknown;
  write(data: Uint8Array, options: { at: number }): number;
  flush(): unknown;
  close(): unknown;
}

interface SyncFileLike extends FileLike {
  createSyncAccessHandle(): Promise<SyncAccess>;
}

export interface WriteRequest {
  readonly id: number;
  /** Folder names from the OPFS root to where the paths start, such as ["projects", "salvage-run"]. */
  readonly base: readonly string[];
  readonly files: readonly ProjectFile[];
}

export type WriteReply =
  | { readonly id: number; readonly ok: true }
  | { readonly id: number; readonly ok: false; readonly error: string };

/** Writes each file under `base`, making folders as needed and replacing any file already there. */
export async function writeFiles(
  root: DirectoryLike,
  base: readonly string[],
  files: readonly ProjectFile[],
): Promise<void> {
  const folders = new Map<string, Promise<DirectoryLike>>();
  const folder = (parts: readonly string[]): Promise<DirectoryLike> => {
    const key = parts.join('/');
    let found = folders.get(key);
    if (!found) {
      const name = parts[parts.length - 1];
      found =
        name === undefined
          ? Promise.resolve(root)
          : folder(parts.slice(0, -1)).then((parent) => parent.getDirectoryHandle(name, { create: true }));
      folders.set(key, found);
    }
    return found;
  };
  const start = base.map(checkName);
  for (const file of files) {
    const parts = [...start, ...pathParts(file.path)];
    const name = parts.pop() as string;
    const handle = (await (await folder(parts)).getFileHandle(name, { create: true })) as SyncFileLike;
    const access = await handle.createSyncAccessHandle();
    try {
      await access.truncate(0);
      const written = access.write(file.bytes, { at: 0 });
      if (written !== file.bytes.byteLength) {
        throw new Error(`Wrote ${written} of ${file.bytes.byteLength} bytes to ${file.path}.`);
      }
      await access.flush();
    } finally {
      await access.close();
    }
  }
}
