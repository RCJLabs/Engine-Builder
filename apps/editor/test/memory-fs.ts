/**
 * An in-memory file system with the File System API's shape and errors, for the editor's storage
 * tests. Folders and files are made on demand, listing follows insertion order, removal can be
 * recursive, and a sync access handle locks its file while open, as OPFS's do.
 */
import type { DirectoryLike, EntryLike, FileLike } from '../src/projects/files.ts';

const failure = (name: string, message: string) => new DOMException(message, name);

// What browsers refuse as a name, with a TypeError, before anything else.
function checkFsName(name: string): void {
  if (name === '' || name === '.' || name === '..' || /[/\\]/.test(name)) throw new TypeError(`Bad name: "${name}"`);
}

export class MemoryFile implements FileLike {
  readonly kind = 'file';
  readonly name: string;
  bytes: Uint8Array = new Uint8Array();
  locked = false;

  constructor(name: string) {
    this.name = name;
  }

  async getFile(): Promise<Blob> {
    if (this.locked) throw failure('NoModificationAllowedError', `${this.name} is open for writing`);
    return new Blob([this.bytes.slice()]);
  }

  async createSyncAccessHandle() {
    if (this.locked) throw failure('NoModificationAllowedError', `${this.name} is already open`);
    this.locked = true;
    return {
      truncate: (size: number) => {
        const next = new Uint8Array(size);
        next.set(this.bytes.subarray(0, size));
        this.bytes = next;
      },
      write: (data: Uint8Array, { at }: { at: number }) => {
        if (at + data.byteLength > this.bytes.byteLength) {
          const grown = new Uint8Array(at + data.byteLength);
          grown.set(this.bytes);
          this.bytes = grown;
        }
        this.bytes.set(data, at);
        return data.byteLength;
      },
      flush: () => undefined,
      close: () => {
        this.locked = false;
      },
    };
  }
}

export class MemoryDirectory implements DirectoryLike {
  readonly kind = 'directory';
  readonly name: string;
  readonly children = new Map<string, MemoryFile | MemoryDirectory>();

  constructor(name = '') {
    this.name = name;
  }

  /** A folder holding `files`, keyed by path with `/` between folders. */
  static of(files: Readonly<Record<string, string | Uint8Array>>, name = ''): MemoryDirectory {
    const root = new MemoryDirectory(name);
    for (const [path, content] of Object.entries(files)) {
      const parts = path.split('/');
      const file = parts.pop() as string;
      let dir: MemoryDirectory = root;
      for (const part of parts) dir = dir.folder(part);
      const made = new MemoryFile(file);
      made.bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
      dir.children.set(file, made);
    }
    return root;
  }

  async *entries(): AsyncGenerator<[string, EntryLike]> {
    for (const entry of [...this.children]) yield entry;
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MemoryDirectory> {
    checkFsName(name);
    const found = this.children.get(name);
    if (found?.kind === 'directory') return found;
    if (found) throw failure('TypeMismatchError', `${name} is a file`);
    if (!options?.create) throw failure('NotFoundError', `${name} not found`);
    return this.folder(name);
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MemoryFile> {
    checkFsName(name);
    const found = this.children.get(name);
    if (found?.kind === 'file') return found;
    if (found) throw failure('TypeMismatchError', `${name} is a folder`);
    if (!options?.create) throw failure('NotFoundError', `${name} not found`);
    const made = new MemoryFile(name);
    this.children.set(name, made);
    return made;
  }

  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    const found = this.children.get(name);
    if (!found) throw failure('NotFoundError', `${name} not found`);
    if (found.kind === 'directory' && found.children.size > 0 && !options?.recursive) {
      throw failure('InvalidModificationError', `${name} is not empty`);
    }
    if (found.kind === 'file' && found.locked) throw failure('NoModificationAllowedError', `${name} is open`);
    this.children.delete(name);
  }

  /** Every file under this folder, as `{ path: bytes }`. */
  files(prefix = ''): Record<string, Uint8Array> {
    const out: Record<string, Uint8Array> = {};
    for (const [name, child] of this.children) {
      if (child.kind === 'file') out[`${prefix}${name}`] = child.bytes;
      else Object.assign(out, child.files(`${prefix}${name}/`));
    }
    return out;
  }

  private folder(name: string): MemoryDirectory {
    const found = this.children.get(name);
    if (found?.kind === 'directory') return found;
    const made = new MemoryDirectory(name);
    this.children.set(name, made);
    return made;
  }
}
