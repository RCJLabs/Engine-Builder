/**
 * A space of a project baked from its files (M6.2, D74): what Bake navigation does from the editor's
 * live copy, done from a ProjectSource, for `pnpm bake` and Node's tests. The records and types are
 * read as they are, not compiled: a project whose walk-to waits on this navmesh (E079) doesn't
 * compile until it has one.
 */
import {
  classifyRecordFile,
  modelFieldOf,
  navFileBytes,
  navInputsHash,
  navModelsOf,
  navSolids,
  type ProjectSource,
  parseJsonFile,
  RECORDS_DIR,
  readSpaces,
  readTypes,
  type SpaceJson,
  terrainPath,
} from '@eb/compiler';
import { groundOf } from '../walk/world.ts';
import { bakedSolids, soupOf } from './geometry.ts';
import type { NavLib } from './lib.ts';

async function jsonAt(source: ProjectSource, path: string): Promise<unknown> {
  const bytes = await source.read(path);
  const parsed = bytes ? parseJsonFile(bytes) : null;
  return parsed?.ok ? parsed.value : undefined;
}

/** The .nav file of space `id`, baked: its header's hash and Recast's export. Throws when it can't be. */
export async function bakeProjectSpace(
  source: ProjectSource,
  id: string,
  lib: NavLib,
): Promise<{ readonly bytes: Uint8Array; readonly tiles: number; readonly polygons: number }> {
  const read = await readSpaces(source);
  const space = read.files.find((f) => f.kind === 'space' && f.id === id)?.value as SpaceJson | undefined;
  if (!space) throw new Error(`No space "${id}" to bake`);
  const prefabs = new Map(
    read.files.filter((f) => f.kind === 'prefab' && f.value !== undefined).map((f) => [f.id, f.value as SpaceJson]),
  );
  const project = (await jsonAt(source, 'project.json')) as { kits?: string[] } | undefined;
  const types = await readTypes(source, [], () => {}, project?.kits ?? []);
  const records = new Map<string, unknown>();
  for (const file of await source.files(RECORDS_DIR)) {
    const role = classifyRecordFile(file);
    if (role.kind === 'record') records.set(`${role.type}:${role.id}`, await jsonAt(source, file));
  }
  const models = navModelsOf({
    record: (key) => records.get(key),
    field: (type) => {
      const data = types.data.get(type);
      return data ? modelFieldOf(data.file) : null;
    },
  });
  const heights = space.terrain ? await source.read(terrainPath(id, 'heights')) : undefined;
  const ground = space.terrain && heights ? groundOf(space, heights) : null;
  await lib.readyNav();
  const baked = lib.bakeSoup(soupOf(bakedSolids(navSolids(space, prefabs, models)), ground));
  if (!baked.ok) throw new Error(baked.why);
  const opened = lib.openNav(baked.navmesh);
  const { tiles, polygons } = opened.debug();
  opened.free();
  return { bytes: navFileBytes(navInputsHash(space, prefabs, models, heights), baked.navmesh), tiles, polygons };
}
