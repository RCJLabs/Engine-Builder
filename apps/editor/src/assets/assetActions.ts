/**
 * What the Assets panel and the asset inspector do (M2.7), each as one step undo takes back:
 * files imported, entries logged, an asset renamed, replaced or deleted, a stand-in made. What
 * shows an asset follows a rename, so the inspector stays on it.
 */
import type { Provenance } from '@eb/schema';
import { note } from '../app/state.ts';
import { step } from '../editing/step.ts';
import { chosen } from '../forms/selection.ts';
import { current } from '../projects/opened.ts';
import {
  createStandIn,
  deleteAssets,
  type Incoming,
  importAssets,
  logProvenance,
  renameAsset,
  replaceAsset,
} from './assetEdits.ts';
import { fileName, folderOf, freePath } from './assetPaths.ts';
import { openAsset } from './open.ts';
import { standInPath } from './standIn.ts';

const files = (count: number) => (count === 1 ? '1 file' : `${count} files`);

const showing = (path: string) => chosen.value?.kind === 'asset' && chosen.value.path === path;

/** Files imported with one provenance; one file opens in the inspector. Resolves to whether they were. */
export async function importAction(incoming: readonly Incoming[], entry: Provenance): Promise<boolean> {
  const [first] = incoming;
  const label = incoming.length === 1 && first ? `Import ${first.path}` : `Import ${files(incoming.length)}`;
  if (!(await step(label, (copy) => importAssets(copy, incoming, entry)))) return false;
  note(incoming.length === 1 && first ? `Imported assets/${first.path}.` : `Imported ${files(incoming.length)}.`);
  if (incoming.length === 1 && first) openAsset(first.path);
  return true;
}

/** Entries for files already there, each with the same provenance. */
export const logAction = (paths: readonly string[], entry: Provenance): Promise<boolean> =>
  step(`Log provenance for ${paths.length === 1 ? paths[0] : files(paths.length)}`, (copy) =>
    logProvenance(copy, paths, entry),
  );

export async function renameAssetAction(from: string, to: string): Promise<void> {
  if (!(await step(`Move ${from} to ${to}`, (copy) => renameAsset(copy, from, to)))) return;
  if (showing(from)) chosen.value = { kind: 'asset', path: to };
}

/** Files and their entries deleted: records that name them keep the name, and show E018. */
export async function deleteAssetsAction(paths: readonly string[]): Promise<void> {
  const label = paths.length === 1 ? `Delete ${paths[0]}` : `Delete ${files(paths.length)}`;
  if (!(await step(label, (copy) => deleteAssets(copy, paths)))) return;
  if (chosen.value?.kind === 'asset' && paths.includes(chosen.value.path)) chosen.value = null;
}

/** The file's bytes replaced, with their own provenance; at `to` when the extension changes. */
export async function replaceAssetAction(
  path: string,
  bytes: Uint8Array,
  entry: Provenance,
  to: string,
): Promise<boolean> {
  if (!(await step(`Replace ${path}`, (copy) => replaceAsset(copy, path, bytes, entry, to)))) return false;
  if (showing(path)) chosen.value = { kind: 'asset', path: to };
  return true;
}

/** A stand-in for `label` in stand-ins/, under a name no file has, shown in the inspector. */
export async function standInAction(label: string, date: string): Promise<boolean> {
  const wanted = standInPath(label);
  const path = freePath(folderOf(wanted), fileName(wanted), current.value?.catalog.assets ?? []);
  if (!(await step(`New stand-in ${path}`, (copy) => createStandIn(copy, path, label.trim(), date)))) return false;
  openAsset(path);
  return true;
}
