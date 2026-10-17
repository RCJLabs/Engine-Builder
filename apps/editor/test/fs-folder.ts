/**
 * A real folder on disk behind the File System API's directory shape, read only: what
 * showDirectoryPicker gives the editor, for tests that start from a git checkout.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
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

function fsFile(path: string): FileLike {
  return { kind: 'file', name: basename(path), getFile: async () => new Blob([await readFile(path)]) };
}

export function fsFolder(path: string): DirectoryLike {
  const open = async (name: string, want: 'file' | 'directory') => {
    const found = await kindAt(join(path, name));
    if (found === null) throw new DOMException(`${name} not found`, 'NotFoundError');
    if (found !== want) throw new DOMException(`${name} is not a ${want}`, 'TypeMismatchError');
    return join(path, name);
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
    getDirectoryHandle: async (name) => fsFolder(await open(name, 'directory')),
    getFileHandle: async (name) => fsFile(await open(name, 'file')),
    removeEntry: async () => {
      throw new DOMException('This folder is read only', 'NoModificationAllowedError');
    },
  };
}
