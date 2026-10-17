import { zipSync } from 'fflate';
import { MANIFEST_FILE, PROJECT_FOLDERS } from './layout.ts';
import type { ProjectSource } from './source.ts';

/** The project's own files, sorted: project.json and everything in PROJECT_FOLDERS, hidden entries left out. */
export async function projectFiles(source: ProjectSource): Promise<string[]> {
  const found: string[] = [];
  if ((await source.read(MANIFEST_FILE)) !== undefined) found.push(MANIFEST_FILE);
  for (const folder of PROJECT_FOLDERS) found.push(...(await source.files(folder)));
  return found.sort();
}

// Midnight on 1 January 1980, zip's earliest date. Zip stores local time, so the date is built
// from local parts, at each call: every machine then writes the same bytes, whatever its time zone
// (one built at load, then read in a zone further west, falls in 1979 and is refused).
const zipEpoch = () => new Date(1980, 0, 1);

/**
 * The project's own files in a zip, inside one folder named `top`. The same files always give the
 * same bytes: paths sorted, every entry dated 1 January 1980, one compression level.
 */
export async function zipProject(source: ProjectSource, top: string): Promise<Uint8Array> {
  if (top === '' || /[/\\]/.test(top)) throw new RangeError(`zipProject(): "${top}" is not a folder name`);
  const entries: Record<string, Uint8Array> = {};
  for (const path of await projectFiles(source)) {
    const bytes = await source.read(path);
    if (bytes !== undefined) entries[`${top}/${path}`] = bytes;
  }
  return zipSync(entries, { level: 6, mtime: zipEpoch() });
}
