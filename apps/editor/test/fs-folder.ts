/**
 * A real folder on disk behind the File System API's directory shape: what showDirectoryPicker
 * gives the editor, for tests that start from a git checkout. Writes go through a writable
 * stream that lands whole on close, as Chrome's do.
 */
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { DirectoryLike, EntryLike, FileLike } from '../src/projects/files.ts';

async function kindAt(path: string): Promise<'file' | 'directory' | null> {
  try {
    const found = await stat(path);
    return found.isDirectory() ? 'directory' : 'file';
  } catch {
    return null;
  }
}

function fsFile(path: string): FileLike & { createWritable(): Promise<unknown> } {
  return {
    kind: 'file',
    name: basename(path),
    getFile: async () => new Blob([await readFile(path)]),
    createWritable: async () => {
      const parts: Uint8Array[] = [];
      return {
        write: async (data: Uint8Array) => void parts.push(data.slice()),
        // Written beside the file and renamed over it, so the file is old or new, never half.
        close: async () => {
          await writeFile(`${path}.crswap`, Buffer.concat(parts));
          await rename(`${path}.crswap`, path);
        },
        abort: async () => undefined,
      };
    },
  };
}

export function fsFolder(path: string): DirectoryLike {
  const open = async (name: string, want: 'file' | 'directory', create = false) => {
    const full = join(path, name);
    const found = await kindAt(full);
    if (found === null && create) {
      if (want === 'directory') await mkdir(full);
      else await writeFile(full, new Uint8Array());
      return full;
    }
    if (found === null) throw new DOMException(`${name} not found`, 'NotFoundError');
    if (found !== want) throw new DOMException(`${name} is not a ${want}`, 'TypeMismatchError');
    return full;
  };
  return {
    kind: 'directory',
    name: basename(path),
    async *entries(): AsyncGenerator<[string, EntryLike]> {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const full = join(path, entry.name);
        yield [entry.name, entry.isDirectory() ? fsFolder(full) : fsFile(full)];
      }
    },
    getDirectoryHandle: async (name, options) => fsFolder(await open(name, 'directory', options?.create)),
    getFileHandle: async (name, options) => fsFile(await open(name, 'file', options?.create)),
    removeEntry: async (name, options) => {
      if ((await kindAt(join(path, name))) === null) throw new DOMException(`${name} not found`, 'NotFoundError');
      await rm(join(path, name), { recursive: options?.recursive ?? false });
    },
  };
}
