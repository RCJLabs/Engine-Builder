/**
 * What a space's map is drawn from, and its hash, which the map file carries (M6.6, D78,
 * docs/specs/markers.md#baking): the space and the prefabs it places as written, its terrain's files,
 * and the records it draws (world.ts's drawnFrom: placed records, their models and materials, its
 * foliage), but not its environment, as a map is lit the same at any hour. So W154 can say a bake is
 * out of date, as W147 says a navmesh's is.
 */
import { canonicalJson, fnv1a64 } from '@eb/core';
import { ENVIRONMENT } from '@eb/schema';
import { base64Of } from './audioFiles.ts';
import type { MapFileRead } from './mapFiles.ts';
import { eachPlaced } from './overrides.ts';
import type { ProjectSource } from './source.ts';
import { type TerrainPart, terrainPath } from './spaceFiles.ts';
import { type SpaceJson, spaceSchema } from './spaceShape.ts';
import type { SpaceFileRead } from './spaces.ts';
import { type DrawnSources, drawnFrom } from './world.ts';

const PARTS: readonly TerrainPart[] = ['heights', 'paint', 'foliage'];

/** The prefabs a space places, through the prefabs they place, by id. */
function prefabsOf(space: SpaceJson, prefabs: ReadonlyMap<string, SpaceJson>): Record<string, SpaceJson> {
  const used: Record<string, SpaceJson> = {};
  for (const object of space.objects) {
    eachPlaced(object, prefabs, (seen) => {
      const prefab = seen.prefab === undefined ? undefined : prefabs.get(seen.prefab);
      if (prefab && seen.prefab !== undefined) used[seen.prefab] = prefab;
    });
  }
  return used;
}

/** Everything a bake draws, as one value; `terrain` is each of the terrain's files there is. */
export function mapInputs(
  id: string,
  space: SpaceJson,
  prefabs: ReadonlyMap<string, SpaceJson>,
  sources: DrawnSources,
  terrain: Partial<Readonly<Record<TerrainPart, Uint8Array>>>,
): unknown {
  const drawn = drawnFrom(new Map([[id, space]]), prefabs, sources).records;
  return {
    space,
    prefabs: prefabsOf(space, prefabs),
    terrain: Object.fromEntries(
      PARTS.flatMap((part) => {
        const bytes = terrain[part];
        return bytes ? [[part, fnv1a64(base64Of(bytes))]] : [];
      }),
    ),
    records: Object.fromEntries(Object.entries(drawn).filter(([key]) => !key.startsWith(`${ENVIRONMENT}:`))),
  };
}

/** The hash a map file carries: 16 hex digits. */
export const mapInputsHash = (...args: Parameters<typeof mapInputs>): string =>
  fnv1a64(canonicalJson(mapInputs(...args)));

/** A space's terrain files as a bake reads them, those there are. */
export async function terrainFilesOf(
  source: ProjectSource,
  id: string,
  space: SpaceJson,
): Promise<Partial<Record<TerrainPart, Uint8Array>>> {
  const found: Partial<Record<TerrainPart, Uint8Array>> = {};
  if (!space.terrain) return found;
  // The density is read only for a terrain that lists foliage, as the editor reads it.
  const listed = (space.terrain.foliage ?? []).length > 0;
  for (const part of listed ? PARTS : PARTS.filter((p) => p !== 'foliage')) {
    const bytes = await source.read(terrainPath(id, part));
    if (bytes) found[part] = bytes;
  }
  return found;
}

/**
 * Each map's space's inputs hashed, as a bake would work them out now. None while any space or
 * prefab isn't sound: E058 says what is wrong, and a hash of half a space means nothing.
 */
export async function mapHashes(
  source: ProjectSource,
  files: readonly SpaceFileRead[],
  maps: readonly MapFileRead[],
  sources: DrawnSources,
): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  if (maps.length === 0 || files.some((read) => !spaceSchema.safeParse(read.value).success)) return hashes;
  const of = (kind: 'space' | 'prefab') =>
    new Map(files.filter((read) => read.kind === kind).map((read) => [read.id, read.value as SpaceJson]));
  const spaces = of('space');
  const prefabs = of('prefab');
  for (const { id } of maps) {
    const space = spaces.get(id);
    if (!space) continue;
    hashes.set(id, mapInputsHash(id, space, prefabs, sources, await terrainFilesOf(source, id, space)));
  }
  return hashes;
}
