/**
 * Saving into a folder opened from disk (desktop Chromium). Each file goes through a writable
 * stream, which Chrome fills in a swap file and moves into place when it closes, so a crash
 * leaves the old file whole. A save of several files isn't all or nothing here, unlike the
 * journal's in the browser's storage; the spec's open questions say when that starts to matter.
 */
import { type DirectoryLike, type FileLike, isNotFound, pathParts } from '../projects/files.ts';
import type { SavedFile } from './journal.ts';

interface Writable {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

interface WritableFile extends FileLike {
  createWritable(): Promise<Writable>;
}

async function removeFile(root: DirectoryLike, parts: readonly string[], name: string): Promise<void> {
  let dir = root;
  try {
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    await dir.removeEntry(name);
  } catch (error) {
    // No folder, or no file: nothing to remove.
    if (!isNotFound(error)) throw error;
  }
}

async function writeFile(
  root: DirectoryLike,
  parts: readonly string[],
  name: string,
  bytes: Uint8Array,
): Promise<void> {
  let dir = root;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
  const stream = await ((await dir.getFileHandle(name, { create: true })) as WritableFile).createWritable();
  try {
    await stream.write(bytes);
    await stream.close();
  } catch (error) {
    // Abandoning the stream drops the swap file and keeps the old file.
    await stream.abort().catch(() => undefined);
    throw error;
  }
}

export async function saveIntoFolder(root: DirectoryLike, files: readonly SavedFile[]): Promise<void> {
  for (const file of files) {
    const parts = pathParts(file.path);
    const name = parts.pop() as string;
    if (file.bytes === null) await removeFile(root, parts, name);
    else await writeFile(root, parts, name, file.bytes);
  }
}
