/**
 * What Run, Play and Export game send the worker (M3.2): the project's own files as export zips
 * them, so Run plays what `eb sim` plays from the zip. Assets go as names alone, so a phone needn't
 * copy its art to play twenty games, except audio: a music's stems are packed into the game file
 * (M4.8, format 8), and an empty one plays nothing; models, with a .gltf's buffers and images,
 * which a space draws in play (M5.8, format 9) and E070 reads; and the sheets sprite records name,
 * which a 2D space draws (M7.1, format 17) and E091 reads, and tileset records (M7.2, E092); and the
 * images screens' image widgets show (M7.4, format 20).
 */
import {
  ASSETS_DIR,
  ASSETS_LOG,
  gltfSummary,
  imageAssetsOf,
  type ProjectSource,
  projectFiles,
  readFiles,
  UI_DIR,
} from '@eb/compiler';
import { isAssetOf } from '@eb/schema';
import type { SentFile } from './protocol.ts';

const inAssets = (path: string) => path.slice(ASSETS_DIR.length + 1);
const isAsset = (path: string) => path.startsWith(`${ASSETS_DIR}/`) && path !== ASSETS_LOG;
const sentWhole = (path: string) => isAssetOf(inAssets(path), 'audio') || isAssetOf(inAssets(path), 'model');
/** The record types whose sheets a 2D space draws: their records name them, and their checks read them. */
const SHEETED = ['records/sprite/', 'records/tileset/'];

const jsonOf = (bytes: Uint8Array): unknown => {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
};

/** A sprite's or a tileset's sheet, when its file is JSON that names one. */
function sheetOf(bytes: Uint8Array): string | undefined {
  const sheet = (jsonOf(bytes) as { sheet?: unknown } | undefined)?.sheet;
  return typeof sheet === 'string' ? sheet : undefined;
}

export async function playFiles(source: ProjectSource): Promise<SentFile[]> {
  const paths = await projectFiles(source);
  const read = await readFiles(
    source,
    paths.filter((path) => !isAsset(path) || sentWhole(path)),
  );
  // A .gltf's own files beside it, as the world packs them; each sprite's and tileset's sheet; and
  // the images screens show, packed as data URLs (M7.4): sent by name alone, they were packed empty.
  const beside = new Set<string>();
  for (const [path, bytes] of read) {
    if (path.startsWith(`${UI_DIR}/`) && path.endsWith('.json'))
      for (const image of imageAssetsOf({ [path]: jsonOf(bytes) })) beside.add(`${ASSETS_DIR}/${image}`);
    if (!SHEETED.some((dir) => path.startsWith(dir))) continue;
    const sheet = sheetOf(bytes);
    if (sheet !== undefined) beside.add(`${ASSETS_DIR}/${sheet}`);
  }
  for (const [path, bytes] of read) {
    if (!isAsset(path) || !path.toLowerCase().endsWith('.gltf')) continue;
    const summary = gltfSummary(inAssets(path), bytes, new Set());
    for (const { path: file } of typeof summary === 'object' ? summary.external : [])
      beside.add(`${ASSETS_DIR}/${file}`);
  }
  const named = paths.filter((path) => isAsset(path) && !sentWhole(path));
  const more = await readFiles(
    source,
    named.filter((path) => beside.has(path)),
  );
  return [
    ...read,
    ...more,
    ...named.filter((path) => !beside.has(path)).map((path): SentFile => [path, new Uint8Array()]),
  ];
}
