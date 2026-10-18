/**
 * The Assets panel's steps as file changes (M2.7): files imported with their provenance, an entry
 * changed, an asset renamed or moved with every asset field that names it, replaced, deleted, and
 * a stand-in made. Each reads what it changes from the working copy as the step runs, and is one
 * step of the command log (D30): undo takes back the files and the log together.
 */
import { ASSETS_DIR, ASSETS_LOG, type ProjectSource, readFiles } from '@eb/compiler';
import { ASSET_PATH_PATTERN, type Provenance } from '@eb/schema';
import type { FileChange } from '../editing/history.ts';
import { editJson } from '../editing/jsonText.ts';
import { newFileText } from '../forms/recordEdits.ts';
import type { Path } from '../forms/values.ts';
import { assetSites, compose, renameAssetRefs } from '../types/rewrites.ts';
import { move, recordFilesOf, rewriteFiles, typeFiles } from '../types/typeEdits.ts';
import { movedEntry, setInLog, withEntry } from './assetLog.ts';
import { standInSvg } from './standIn.ts';

/** A file inside assets/, as the project holds it. */
export const assetFile = (path: string): string => `${ASSETS_DIR}/${path}`;

const encode = (text: string) => new TextEncoder().encode(text);

/**
 * The log changed by `change`, in its own layout, or made when there is none. Throws when the
 * log isn't JSON: fixing it by hand comes first, and nothing else changes.
 */
async function logChange(source: ProjectSource, change: (log: unknown) => unknown): Promise<FileChange[]> {
  const before = await source.read(ASSETS_LOG);
  if (before === undefined) return [{ path: ASSETS_LOG, before: null, after: encode(newFileText(change(undefined))) }];
  let after: Uint8Array;
  try {
    after = editJson(before, change);
  } catch {
    throw new Error(`${ASSETS_LOG} isn’t JSON: fix it first`);
  }
  return after === before ? [] : [{ path: ASSETS_LOG, before, after }];
}

const LOG_NAME = ASSETS_LOG.slice(ASSETS_DIR.length + 1);

/**
 * Throws unless every path is one the format takes and no file has it, case aside: a Mac's or
 * Windows's disk sees "Hero.png" and "hero.png" as one file, so an opened folder or an unpacked
 * zip would lose one. Nothing is ever written over. `self` is a file moving away, which doesn't
 * count, except that a move changing only its case is refused for the same reason.
 */
async function mustBeFree(source: ProjectSource, paths: readonly string[], self?: string): Promise<void> {
  const taken = new Set((await source.files(ASSETS_DIR)).map((path) => path.toLowerCase()));
  const wanted = new Set<string>();
  for (const path of paths) {
    if (!ASSET_PATH_PATTERN.test(path)) throw new Error(`"${path}" isn’t a path inside assets/ the format takes`);
    if (path.toLowerCase() === LOG_NAME) throw new Error(`${ASSETS_LOG} is the provenance log`);
    const key = assetFile(path).toLowerCase();
    if (self !== undefined && key === assetFile(self).toLowerCase()) {
      throw new Error(
        'Only its case changes, which a Mac’s or Windows’s disk can’t see: rename it to another name first',
      );
    }
    if (taken.has(key) || wanted.has(key)) throw new Error(`assets/${path} is there already`);
    wanted.add(key);
  }
}

export interface Incoming {
  /** Where it goes inside assets/. */
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** Files imported, each with the same provenance: one step. */
export async function importAssets(
  source: ProjectSource,
  files: readonly Incoming[],
  entry: Provenance,
): Promise<FileChange[]> {
  await mustBeFree(
    source,
    files.map((file) => file.path),
  );
  const made = files.map((file) => ({ path: assetFile(file.path), before: null, after: file.bytes }));
  const log = await logChange(source, (now) => files.reduce((acc, file) => withEntry(acc, file.path, entry), now));
  return [...made, ...log];
}

/** One key of an entry set, or taken out when `value` is undefined: what the provenance form writes. */
export const setProvenance = (source: ProjectSource, path: Path, value: unknown): Promise<FileChange[]> =>
  logChange(source, (log) => setInLog(log, path, value));

/** Every asset field in every record that names `from`, made to name `to`. */
async function moveRefs(source: ProjectSource, from: string, to: string): Promise<FileChange[]> {
  const changes: FileChange[] = [];
  for (const [type, { json }] of await typeFiles(source)) {
    // A type with no asset fields names no asset: its records need no reading.
    if (assetSites(json).length === 0) continue;
    changes.push(...(await rewriteFiles(source, await recordFilesOf(source, type), renameAssetRefs(json, from, to))));
  }
  return changes;
}

/**
 * The asset at `from` moved to `to`, inside assets/: its file, its log entry, and every asset field
 * that names it (D33's renames carry the records). Throws when `to` is taken.
 */
export async function renameAsset(source: ProjectSource, from: string, to: string): Promise<FileChange[]> {
  if (to === from) return [];
  const bytes = await source.read(assetFile(from));
  if (bytes === undefined) return [];
  await mustBeFree(source, [to], from);
  return [
    ...move(assetFile(from), assetFile(to), bytes, compose([])),
    ...(await logChange(source, (log) => movedEntry(log, from, to))),
    ...(await moveRefs(source, from, to)),
  ];
}

/** Assets deleted with their log entries. Records that name them are left, and show E018. */
export async function deleteAssets(source: ProjectSource, paths: readonly string[]): Promise<FileChange[]> {
  const read = await readFiles(source, paths.map(assetFile));
  const gone = paths.flatMap((path) => {
    const before = read.get(assetFile(path));
    return before === undefined ? [] : [{ path: assetFile(path), before, after: null }];
  });
  const log = await logChange(source, (now) => paths.reduce((acc, path) => withEntry(acc, path, undefined), now));
  return [...gone, ...log];
}

/**
 * The asset at `path` replaced by new bytes with their own provenance. A file of another kind of
 * extension lands at `to`, and every asset field that named the old path follows it.
 */
export async function replaceAsset(
  source: ProjectSource,
  path: string,
  bytes: Uint8Array,
  entry: Provenance,
  to: string = path,
): Promise<FileChange[]> {
  const before = await source.read(assetFile(path));
  if (before === undefined) return [];
  if (to !== path) await mustBeFree(source, [to], path);
  const file: FileChange[] =
    to === path
      ? [{ path: assetFile(path), before, after: bytes }]
      : [
          { path: assetFile(path), before, after: null },
          { path: assetFile(to), before: null, after: bytes },
        ];
  const log = await logChange(source, (now) => withEntry(withEntry(now, path, undefined), to, entry));
  return [...file, ...log, ...(to === path ? [] : await moveRefs(source, path, to))];
}

/** A stand-in for `label` at `path`, logged as one (D34). */
export async function createStandIn(
  source: ProjectSource,
  path: string,
  label: string,
  date: string,
): Promise<FileChange[]> {
  const entry: Provenance = { licence: 'own', source: 'A stand-in the editor made', date, standIn: true };
  return importAssets(source, [{ path, bytes: encode(standInSvg(label)) }], entry);
}
