/**
 * Saving a stored project so that a crash can't leave it half written. The save goes into a
 * journal first, written whole and flushed; then into the project's files; the journal goes
 * last. A journal found later is from a save cut short. Written whole, it is applied again,
 * which is safe to repeat; torn, it is dropped, since no file is touched before it is whole.
 * A save of many files is all or nothing this way, which renames (M2.5) need. Runs in the OPFS
 * worker, where sync access handles are.
 */
import { fnv1a64 } from '@eb/core';
import { type DirectoryLike, isNotFound, pathParts } from '../projects/files.ts';
import { writeFiles } from '../projects/opfsWrite.ts';

/** Hidden, so the compiler, zips and the library never take it for part of the project. */
export const JOURNAL = '.eb-journal';

/** A file as a save leaves it: its bytes, or null when the save removes it. */
export interface SavedFile {
  readonly path: string;
  readonly bytes: Uint8Array | null;
}

// Base64 in parts of whole three-byte groups, so the parts join into the whole's base64; each part
// built from slices small enough to pass as arguments. One string of every byte took 1.3 s for a
// 25 MB asset (M2.7, Readings); the parts take 0.2 s, and write the same text.
const PART = 3 * 0x10000;
const SLICE = 0x2000;

function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let at = 0; at < bytes.length; at += PART) {
    const part = bytes.subarray(at, at + PART);
    let binary = '';
    for (let i = 0; i < part.length; i += SLICE) {
      binary += String.fromCharCode.apply(null, part.subarray(i, i + SLICE) as unknown as number[]);
    }
    parts.push(btoa(binary));
  }
  return parts.join('');
}

// A plain loop: Uint8Array.from with a function to map each character took 2.3 s for 25 MB, this 0.1 s.
function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The journal: one line of JSON, then a line with its hash, so a cut-short write shows. */
export function journalText(files: readonly SavedFile[]): string {
  const body = JSON.stringify({
    journal: 1,
    files: files.map((file) => ({ path: file.path, bytes: file.bytes === null ? null : toBase64(file.bytes) })),
  });
  return `${body}\n${fnv1a64(body)}\n`;
}

/** The files a journal holds, or null when it is torn or isn't one. */
export function readJournal(text: string): SavedFile[] | null {
  const [body, hash, rest] = text.split('\n');
  if (body === undefined || hash !== fnv1a64(body) || rest !== '') return null;
  try {
    const parsed = JSON.parse(body) as { journal?: unknown; files?: unknown };
    if (parsed.journal !== 1 || !Array.isArray(parsed.files)) return null;
    return parsed.files.map((file: { path: string; bytes: string | null }) => ({
      path: file.path,
      bytes: file.bytes === null ? null : fromBase64(file.bytes),
    }));
  } catch {
    return null;
  }
}

async function folderAt(root: DirectoryLike, parts: readonly string[]): Promise<DirectoryLike> {
  let dir = root;
  for (const part of parts) dir = await dir.getDirectoryHandle(part);
  return dir;
}

async function removeIfThere(dir: DirectoryLike, name: string): Promise<void> {
  try {
    await dir.removeEntry(name);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

/** Writes and removes the files, then the journal. Safe to run twice: that is what recovery does. */
async function apply(root: DirectoryLike, base: readonly string[], files: readonly SavedFile[]): Promise<void> {
  const written = files.flatMap((file) => (file.bytes === null ? [] : [{ path: file.path, bytes: file.bytes }]));
  await writeFiles(root, base, written);
  for (const file of files) {
    if (file.bytes !== null) continue;
    const parts = [...base, ...pathParts(file.path)];
    const name = parts.pop() as string;
    try {
      await removeIfThere(await folderAt(root, parts), name);
    } catch (error) {
      // A folder that isn't there holds no file to remove.
      if (!isNotFound(error)) throw error;
    }
  }
  await removeIfThere(await folderAt(root, base), JOURNAL);
}

export async function saveFiles(
  root: DirectoryLike,
  base: readonly string[],
  files: readonly SavedFile[],
): Promise<void> {
  await writeFiles(root, base, [{ path: JOURNAL, bytes: new TextEncoder().encode(journalText(files)) }]);
  await apply(root, base, files);
}

/** Finishes a save cut short in the project at `base`. Returns how many files it put right. */
export async function recoverJournal(root: DirectoryLike, base: readonly string[]): Promise<number> {
  let text: string;
  try {
    const journal = await (await folderAt(root, base)).getFileHandle(JOURNAL);
    text = await (await journal.getFile()).text();
  } catch (error) {
    if (isNotFound(error)) return 0;
    throw error;
  }
  const files = readJournal(text);
  if (files === null) {
    await removeIfThere(await folderAt(root, base), JOURNAL);
    return 0;
  }
  await apply(root, base, files);
  return files.length;
}
