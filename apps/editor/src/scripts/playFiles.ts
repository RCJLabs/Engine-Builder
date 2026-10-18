/**
 * What Run sends the worker (M3.2): the project's own files as export zips them, so Run plays what
 * `eb sim` plays from the zip. Assets go as names alone: nothing played reads their bytes, and a
 * phone needn't copy its art to play twenty games.
 */
import { ASSETS_DIR, ASSETS_LOG, type ProjectSource, projectFiles, readFiles } from '@eb/compiler';
import type { SentFile } from './protocol.ts';

const isAsset = (path: string) => path.startsWith(`${ASSETS_DIR}/`) && path !== ASSETS_LOG;

export async function playFiles(source: ProjectSource): Promise<SentFile[]> {
  const paths = await projectFiles(source);
  const read = await readFiles(
    source,
    paths.filter((path) => !isAsset(path)),
  );
  return [...read, ...paths.filter(isAsset).map((path): SentFile => [path, new Uint8Array()])];
}
