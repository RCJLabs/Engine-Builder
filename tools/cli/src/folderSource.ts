import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isHiddenName, type ProjectSource } from '@eb/compiler';

/**
 * A project folder on disk. Hidden folders such as `.git` are never entered. Symbolic links are
 * not followed, so a link can't pull files from outside the project or loop.
 */
export function folderSource(root: string): ProjectSource {
  return {
    async files(dir) {
      const found: string[] = [];
      await walk(root, dir, found);
      return found;
    },
    async read(path) {
      try {
        return new Uint8Array(await readFile(join(root, ...path.split('/'))));
      } catch (error) {
        if (isMissing(error)) return undefined;
        throw error;
      }
    },
  };
}

async function walk(root: string, dir: string, found: string[]): Promise<void> {
  let entries: Awaited<ReturnType<typeof listFolder>>;
  try {
    entries = await listFolder(join(root, ...dir.split('/')));
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  for (const entry of entries) {
    if (isHiddenName(entry.name)) continue;
    const path = dir === '' ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) await walk(root, path, found);
    else if (entry.isFile()) found.push(path);
  }
}

const listFolder = (path: string) => readdir(path, { withFileTypes: true });

const isMissing = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
};
