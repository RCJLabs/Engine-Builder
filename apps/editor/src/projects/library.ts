/**
 * The projects stored in this browser: a folder each under OPFS's projects/, holding the project's
 * own files as they would sit on disk. Reads happen on the page; writes go through the worker.
 */
import { directorySource, isHiddenName, MANIFEST_FILE, type ProjectSource, projectFiles } from '@eb/compiler';
import { type DirectoryLike, isNotFound, type ProjectFile } from './files.ts';
import { newManifest, readManifest } from './manifest.ts';

/** The folder under OPFS's root that holds the projects. */
export const PROJECTS_DIR = 'projects';
/** Written first and removed last, so a copy cut short shows as unfinished, never as a project. */
export const UNFINISHED = '.unfinished';

export interface LibraryEntry {
  readonly folder: string;
  /** From project.json, or the folder's name when that can't be read. */
  readonly name: string;
  readonly id: string | null;
  readonly version: string | null;
  /** Why the folder isn't a usable project, or null when it is. */
  readonly trouble: string | null;
}

/** Writes files under one project's folder. */
export type WriteInto = (folder: string, files: readonly ProjectFile[]) => Promise<void>;

export interface Library {
  list(): Promise<LibraryEntry[]>;
  open(folder: string): Promise<ProjectSource>;
  /** A new project holding only project.json. Returns its folder. */
  create(name: string): Promise<string>;
  /** Copies a project's own files in, from a zip or an opened folder. Returns its folder. */
  copyIn(from: ProjectSource): Promise<string>;
  remove(folder: string): Promise<void>;
}

export function createLibrary(root: DirectoryLike, write: WriteInto): Library {
  const copy = async (base: string, files: readonly ProjectFile[]) => {
    const folder = await freeName(root, base);
    await write(folder, [{ path: UNFINISHED, bytes: new Uint8Array() }]);
    await write(folder, files);
    await (await root.getDirectoryHandle(folder)).removeEntry(UNFINISHED);
    return folder;
  };
  return {
    list: () => listProjects(root),
    open: async (folder) => directorySource(await root.getDirectoryHandle(folder)),
    create: (name) => {
      const { id, bytes } = newManifest(name);
      return copy(id, [{ path: MANIFEST_FILE, bytes }]);
    },
    copyIn: async (from) => {
      const { id, files } = await ownFiles(from);
      return copy(id, files);
    },
    remove: (folder) => root.removeEntry(folder, { recursive: true }),
  };
}

/** A project's own files, refusing a source without a usable project.json. */
async function ownFiles(from: ProjectSource): Promise<{ id: string; files: ProjectFile[] }> {
  const manifest = await from.read(MANIFEST_FILE);
  if (manifest === undefined) throw new Error('There is no project.json, so this isn’t a project.');
  const { project, trouble } = readManifest(manifest);
  if (!project) throw new Error(trouble ?? 'project.json can’t be read.');
  const files: ProjectFile[] = [];
  for (const path of await projectFiles(from)) {
    const bytes = await from.read(path);
    if (bytes !== undefined) files.push({ path, bytes });
  }
  return { id: project.id, files };
}

async function listProjects(root: DirectoryLike): Promise<LibraryEntry[]> {
  const found: LibraryEntry[] = [];
  for await (const [folder, entry] of root.entries()) {
    if (entry.kind !== 'directory' || isHiddenName(folder)) continue;
    found.push(await describe(folder, await root.getDirectoryHandle(folder)));
  }
  return found.sort((a, b) => a.name.localeCompare(b.name) || (a.folder < b.folder ? -1 : 1));
}

async function describe(folder: string, dir: DirectoryLike): Promise<LibraryEntry> {
  const blank = { folder, name: folder, id: null, version: null };
  if (await hasFile(dir, UNFINISHED)) {
    return { ...blank, trouble: 'Copying it in stopped before the end. Delete it and copy it again.' };
  }
  const bytes = await directorySource(dir).read(MANIFEST_FILE);
  if (bytes === undefined) return { ...blank, trouble: 'It has no project.json.' };
  const { project, trouble } = readManifest(bytes);
  if (!project) return { ...blank, trouble };
  return { folder, name: project.name, id: project.id, version: project.version, trouble: null };
}

/** `base`, or `base-2`, `base-3`… when the library already has a folder of that name. */
async function freeName(root: DirectoryLike, base: string): Promise<string> {
  const taken = new Set<string>();
  for await (const [name] of root.entries()) taken.add(name);
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
  return name;
}

async function hasFile(dir: DirectoryLike, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}
