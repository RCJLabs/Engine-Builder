/**
 * The pack's places (M6.7, D79, docs/specs/radiant.md#the-pack-format-15): every space's tags, and each
 * object with tags by its path, through prefabs and overrides, with the name `{slot}` shows for it: its
 * own, else its placed record's, else its prefab's. createPack keeps them only when one has a tag.
 */
import type { PackPlaces, PlacedTags } from '@eb/core';
import type { SpaceTags } from '@eb/schema';
import { actorPlaces } from './npcPlaces.ts';
import { eachPlaced, recordHere } from './overrides.ts';
import type { SpaceJson } from './spaceShape.ts';
import type { SpaceFileRead } from './spaces.ts';

const sorted = (tags: readonly string[] | undefined) => [...(tags ?? [])].sort();

export function placesOf(
  spaces: ReadonlyMap<string, SpaceJson>,
  prefabs: ReadonlyMap<string, SpaceJson>,
  record: (key: string) => unknown,
): PackPlaces {
  const tagged: Record<string, { tags: string[] }> = {};
  const objects: Record<string, Record<string, PlacedTags>> = {};
  for (const id of [...spaces.keys()].sort()) {
    const space = spaces.get(id) as SpaceJson;
    tagged[id] = { tags: sorted(space.tags) };
    const found: Record<string, PlacedTags> = {};
    for (const object of space.objects) {
      eachPlaced(object, prefabs, (seen, ids, passed) => {
        if (seen.tags === undefined || seen.tags.length === 0) return;
        const placed = seen.record === undefined ? undefined : recordHere(record(seen.record), passed).name;
        const prefab = seen.prefab === undefined ? undefined : prefabs.get(seen.prefab)?.name;
        const name = seen.name ?? (typeof placed === 'string' && placed !== '' ? placed : undefined) ?? prefab;
        found[ids.join('/')] = { tags: sorted(seen.tags), ...(name !== undefined ? { name } : {}) };
      });
    }
    if (Object.keys(found).length > 0) objects[id] = found;
  }
  return { spaces: tagged, objects };
}

/** The spaces' tags as the checks read them (M6.7): each space's, each tagged object's, and each placed actor's. */
export function spaceTagsOf(files: readonly SpaceFileRead[], prefabs: ReadonlyMap<string, SpaceJson>): SpaceTags {
  const spaces = new Map(
    files.filter((f) => f.kind === 'space' && f.value !== undefined).map((f) => [f.id, f.value as SpaceJson] as const),
  );
  const places = placesOf(spaces, prefabs, () => undefined);
  const objects = new Map(
    Object.entries(places.objects).map(([space, found]) => [
      space,
      new Map(Object.entries(found).map(([path, entry]) => [path, entry.tags])),
    ]),
  );
  const actors = new Map<string, readonly string[]>();
  for (const [actor, [first]] of actorPlaces(files, prefabs)) {
    if (first) actors.set(actor, objects.get(first.space)?.get(first.path) ?? []);
  }
  return { spaces: new Map(Object.entries(places.spaces).map(([id, { tags }]) => [id, tags])), objects, actors };
}
