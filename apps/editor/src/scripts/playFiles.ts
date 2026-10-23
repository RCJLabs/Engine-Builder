/**
 * What Run, Play and Export game send the worker (M3.2): the project's own files as export zips
 * them, so Run plays what `eb sim` plays from the zip. Assets go as names alone, so a phone needn't
 * copy its art to play twenty games, except audio: a music's stems are packed into the game file
 * (M4.8, format 8), and an empty one plays nothing.
 */
import { ASSETS_DIR, ASSETS_LOG, type ProjectSource, projectFiles, readFiles } from '@eb/compiler';
import { isAssetOf } from '@eb/schema';
import type { SentFile } from './protocol.ts';

const isAsset = (path: string) =>
  path.startsWith(`${ASSETS_DIR}/`) && path !== ASSETS_LOG && !isAssetOf(path.slice(ASSETS_DIR.length + 1), 'audio');

export async function playFiles(source: ProjectSource): Promise<SentFile[]> {
  const paths = await projectFiles(source);
  const read = await readFiles(
    source,
    paths.filter((path) => !isAsset(path)),
  );
  return [...read, ...paths.filter(isAsset).map((path): SentFile => [path, new Uint8Array()])];
}
