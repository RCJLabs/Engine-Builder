/**
 * Format 15 (M6.7, D79, docs/specs/radiant.md#the-pack-format-15): the tags of every space and of
 * each object that has any, resolved through prefabs and overrides by the compiler, so a quest's slot
 * can find "a cave" and "the cache in it". The spaces' names come from the spaces as packed.
 */
import { isRecordId } from '../records.ts';
import type { Placed } from './types.ts';

/** An object a slot can find: its tags, and its name as `{slot}` shows it when it has one. */
export interface PlacedTags {
  readonly tags: readonly string[];
  readonly name?: string;
}

/** As the pack holds them: every space's tags, and each tagged object's by space and path. */
export interface PackPlaces {
  readonly spaces: Readonly<Record<string, { readonly tags: readonly string[] }>>;
  readonly objects: Readonly<Record<string, Readonly<Record<string, PlacedTags>>>>;
}

/**
 * As the world module and the quests kit read them: each space's name beside its tags, and where each
 * placed actor stands, whose tags are its placement's.
 */
export interface WorldPlaces {
  readonly spaces: Readonly<Record<string, { readonly name: string; readonly tags: readonly string[] }>>;
  readonly objects: Readonly<Record<string, Readonly<Record<string, PlacedTags>>>>;
  readonly actors: Readonly<Record<string, Placed>>;
}

export const NO_PLACES: WorldPlaces = { spaces: {}, objects: {}, actors: {} };

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The places of a pack's world: its spaces' names, and their tags where format 15 gives them. */
export function worldPlacesOf(
  spaces: Readonly<Record<string, unknown>>,
  places: PackPlaces | undefined,
  actors: Readonly<Record<string, Placed>> = {},
): WorldPlaces {
  const named: Record<string, { name: string; tags: readonly string[] }> = {};
  for (const id of Object.keys(spaces).sort()) {
    const space = spaces[id];
    const name = isObject(space) && typeof space.name === 'string' ? space.name : id;
    named[id] = { name, tags: places?.spaces[id]?.tags ?? [] };
  }
  return { spaces: named, objects: places?.objects ?? {}, actors };
}

const tagsProblem = (tags: unknown): boolean =>
  !Array.isArray(tags) || !tags.every(isRecordId) || new Set(tags).size !== tags.length;

const isPath = (path: string) => path.split('/').every(isRecordId);

/** What is wrong with format 15's places, or nothing: every space has its tags, each object is in one. */
export function packPlacesProblem(world: Readonly<Record<string, unknown>>): string | undefined {
  const { spaces, places } = world;
  if (!isObject(spaces) || !isObject(places)) return 'A format 15 pack has no places';
  const keys = Object.keys(places).filter((key) => key !== 'spaces' && key !== 'objects');
  if (keys.length > 0) return `Unknown pack places fields: ${keys.join(', ')}`;
  const { spaces: tagged, objects } = places;
  if (!isObject(tagged) || !isObject(objects)) return "The pack's places have no spaces or no objects";
  for (const id of Object.keys(spaces)) {
    const entry = tagged[id];
    if (!isObject(entry) || Object.keys(entry).some((k) => k !== 'tags') || tagsProblem(entry.tags)) {
      return `The pack's places give the space "${id}" no tags, or tags that aren't words once each`;
    }
  }
  const lost = Object.keys(tagged).find((id) => !Object.hasOwn(spaces, id));
  if (lost !== undefined) return `Places of a space the pack lacks: "${lost}"`;
  for (const [space, found] of Object.entries(objects)) {
    if (!Object.hasOwn(spaces, space) || !isObject(found))
      return `Tagged objects of a space the pack lacks: "${space}"`;
    for (const [path, entry] of Object.entries(found)) {
      if (!isPath(path)) return `"${path}" is not an object's path`;
      const odd = !isObject(entry) || Object.keys(entry).some((k) => k !== 'tags' && k !== 'name');
      if (odd || tagsProblem(entry.tags) || (entry.tags as unknown[]).length === 0) {
        return `The tagged object "${space}/${path}" has no tags, or tags that aren't words once each`;
      }
      if (entry.name !== undefined && (typeof entry.name !== 'string' || entry.name === '')) {
        return `The tagged object "${space}/${path}"'s name is not text`;
      }
    }
  }
  return undefined;
}

/** Whether any space or object carries a tag: a world without one keeps format 14 or lower. */
export const hasTags = (places: PackPlaces | undefined): boolean =>
  places !== undefined &&
  (Object.values(places.spaces).some((space) => space.tags.length > 0) ||
    Object.values(places.objects).some((found) => Object.keys(found).length > 0));
