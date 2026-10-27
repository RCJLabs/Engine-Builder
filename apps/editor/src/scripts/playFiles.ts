/**
 * What Run, Play and Export game send the worker (M3.2): the project's own files as export zips
 * them, so Run plays what `eb sim` plays from the zip. Assets go as names alone, so a phone needn't
 * copy its art to play twenty games, except audio: a music's stems are packed into the game file
 * (M4.8, format 8), and an empty one plays nothing; models, with a .gltf's buffers and images,
 * which a space draws in play (M5.8, format 9) and E070 reads; and the sheets sprite records name,
 * which a 2D space draws (M7.1, format 17) and E091 reads.
 */
import { ASSETS_DIR, ASSETS_LOG, gltfSummary, type ProjectSource, projectFiles, readFiles } from '@eb/compiler';
import { isAssetOf } from '@eb/schema';
import type { SentFile } from './protocol.ts';

const inAssets = (path: string) => path.slice(ASSETS_DIR.length + 1);
const isAsset = (path: string) => path.startsWith(`${ASSETS_DIR}/`) && path !== ASSETS_LOG;
const sentWhole = (path: string) => isAssetOf(inAssets(path), 'audio') || isAssetOf(inAssets(path), 'model');
const SPRITES = 'records/sprite/';

/** A sprite record's sheet, when its file is JSON that names one. */
function sheetOf(bytes: Uint8Array): string | undefined {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as { sheet?: unknown };
    return typeof value.sheet === 'string' ? value.sheet : undefined;
  } catch {
    return undefined;
  }
}

export async function playFiles(source: ProjectSource): Promise<SentFile[]> {
  const paths = await projectFiles(source);
  const read = await readFiles(
    source,
    paths.filter((path) => !isAsset(path) || sentWhole(path)),
  );
  // A .gltf's own files beside it, as the world packs them; and each sprite's sheet.
  const beside = new Set<string>();
  for (const [path, bytes] of read) {
    if (!path.startsWith(SPRITES)) continue;
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
