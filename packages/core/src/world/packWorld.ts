import { isRecordId } from '../records.ts';
import { holdsProblem } from './containers.ts';
import { mapsProblem, type PackMap } from './packMaps.ts';
import { type PackPlaces, packPlacesProblem, worldPlacesOf } from './places.ts';
import type { Placed, Triggers, Uses, WorldData } from './types.ts';

/**
 * Format 9: the project's spaces walked in play (M5.8, D70, docs/specs/movement.md#spaces-in-the-pack-format-9).
 * The spaces and prefabs are the files as written, which only the stage reads; the trigger zones
 * are the sim's, resolved through prefabs and overrides by the compiler. Format 10 (M5.9, D71)
 * adds the uses, each space's spawn points and the start (docs/specs/worldspaces.md#packs).
 */
export interface PackWorld {
  /** spaces/<id>.json by id, at least one. */
  readonly spaces: Readonly<Record<string, unknown>>;
  /** prefabs/<id>.json by id. */
  readonly prefabs: Readonly<Record<string, unknown>>;
  readonly triggers: Triggers;
  /** The terrain PNGs and model files the spaces draw from, base64 by their path in the project. */
  readonly files: Readonly<Record<string, string>>;
  /**
   * The records the spaces draw from, by "type:id": each placed record, the models and materials
   * they draw as, the spaces' environments and their terrains' foliage. The sim has them all; these
   * go to the page, which has none.
   */
  readonly records: Readonly<Record<string, unknown>>;
  /** Each placed record type's model field (M5.5's modelFieldOf), for the types whose records draw as models. */
  readonly fields: Readonly<Record<string, string>>;
  /** Format 10: each space's interacts, by the object's path. */
  readonly uses?: Uses;
  /** Format 10: each space's spawn points by object path, sorted; every space is a key. */
  readonly spawns?: Readonly<Record<string, readonly string[]>>;
  /** Format 10: the space a new game starts in. */
  readonly start?: string;
  /** Format 11 (M6.2): each space's navmesh as its .nav file, base64. */
  readonly navmeshes?: Readonly<Record<string, string>>;
  /** Format 11: each placed actor's space and path. */
  readonly actors?: Readonly<Record<string, Placed>>;
  /** Format 14 (M6.6): each baked space's map, its image among the files. */
  readonly maps?: Readonly<Record<string, PackMap>>;
  /** Format 15 (M6.7): every space's tags and each tagged object's, through prefabs and overrides. */
  readonly places?: PackPlaces;
}

/** What the world module is built from. A format 9 pack has no uses, and starts in its first space. */
export function worldDataOf(world: PackWorld): WorldData {
  const spaces = Object.keys(world.spaces).sort();
  return {
    triggers: world.triggers,
    uses: world.uses ?? {},
    spawns: world.spawns ?? Object.fromEntries(spaces.map((id) => [id, []])),
    start: world.start ?? (spaces[0] as string),
    actors: world.actors ?? {},
    places: worldPlacesOf(world.spaces, world.places, world.actors),
  };
}

/**
 * The world as format 9 when format 9 holds it: no uses, no spawn points, and the start its first
 * space by id, which is what worldDataOf reads a format 9 world as. So a game walked before M5.9
 * keeps its format and its hash.
 */
export function asFormat9(world: PackWorld): PackWorld | undefined {
  const { uses, spawns, start, ...nine } = world;
  const first = Object.keys(world.spaces).sort()[0];
  const used = uses !== undefined && Object.values(uses).some((found) => Object.keys(found).length > 0);
  const spawned = spawns !== undefined && Object.values(spawns).some((list) => list.length > 0);
  return used || spawned || (start !== undefined && start !== first) ? undefined : nine;
}

/**
 * The world as format 10 when it has no navmesh (M6.2): without one no NPC walks, so the actors'
 * places aren't needed and a game walked before M6.2 keeps its format and its hash.
 */
export function asFormat10(world: PackWorld): PackWorld | undefined {
  const { navmeshes, actors, ...ten } = world;
  return navmeshes !== undefined && Object.keys(navmeshes).length > 0 ? undefined : ten;
}

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether any space is drawn in 2D (M7.1, D83): format 17's, which an older engine must refuse. */
export const hasFlatSpace = (spaces: Readonly<Record<string, unknown>>): boolean =>
  Object.values(spaces).some((space) => isObject(space) && space.view === '2d');

const allOf = (value: unknown, each: (entry: unknown) => boolean): value is Readonly<Record<string, unknown>> =>
  isObject(value) && Object.values(value).every(each);

// Kept apart from pack.ts's own for the import's sake: pack.ts imports this file.
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

const extra = (value: Readonly<Record<string, unknown>>, allowed: readonly string[]): string | undefined => {
  const keys = Object.keys(value).filter((key) => !allowed.includes(key));
  return keys.length > 0 ? keys.join(', ') : undefined;
};

/**
 * What is wrong with a format 9 pack's world, or nothing. The spaces' and prefabs' own shape is the
 * compiler's to check (E058 on): the kernel reads only the zones, and makes sure the rest is there.
 */
export function worldProblem(world: unknown, format = 9): string | undefined {
  if (!isObject(world)) return `A format ${format} pack has no world`;
  const placed = [
    ...(format >= 10 ? ['uses', 'spawns', 'start'] : []),
    ...(format >= 11 ? ['navmeshes', 'actors'] : []),
    ...(format >= 14 ? ['maps'] : []),
    ...(format >= 15 ? ['places'] : []),
  ];
  const unknown = extra(world, ['spaces', 'prefabs', 'triggers', 'files', 'records', 'fields', ...placed]);
  if (unknown !== undefined) return `Unknown pack world fields: ${unknown}`;
  const { spaces, prefabs, triggers, files, records, fields } = world;
  if (!allOf(spaces, isObject) || Object.keys(spaces).length === 0) return 'A format 9 pack has no spaces';
  if (format < 17 && hasFlatSpace(spaces)) return `A 2D space is format 17's, not format ${format}'s`;
  if (!allOf(prefabs, isObject)) return "The pack's prefabs are not objects";
  const named = [...Object.keys(spaces), ...Object.keys(prefabs)].find((id) => !isRecordId(id));
  if (named !== undefined) return `"${named}" is not a valid space or prefab name`;
  if (!allOf(triggers, isObject)) return "The pack's trigger zones are not objects";
  for (const [space, zones] of Object.entries(triggers)) {
    if (!Object.hasOwn(spaces, space)) return `Trigger zones of a space the pack lacks: "${space}"`;
    for (const [path, zone] of Object.entries(zones as Readonly<Record<string, unknown>>)) {
      const problem = zoneProblem(`${space}/${path}`, path, zone);
      if (problem !== undefined) return problem;
    }
  }
  if (!allOf(files, (data) => typeof data === 'string' && BASE64.test(data))) {
    return "The pack's world files are not base64";
  }
  if (!isObject(records)) return "The pack's world records are not an object";
  const key = Object.keys(records).find((k) => !/^[a-z0-9-]+:[a-z0-9-]+$/.test(k));
  if (key !== undefined) return `"${key}" is not a record's type and id`;
  if (!allOf(fields, (field) => typeof field === 'string')) return "The pack's model fields are not text";
  return (
    (format >= 10 ? placesProblem(world, format) : undefined) ??
    (format >= 11 ? walkersProblem(world, format) : undefined) ??
    // Format 15 is the format for tags, which a world without a map may carry.
    (format === 14 || (format >= 15 && world.maps !== undefined) ? mapsProblem(world) : undefined) ??
    (format >= 15 ? packPlacesProblem(world) : undefined)
  );
}

/**
 * Format 11's navmeshes, each of a space the pack has and base64, and the actors' places. Format 11
 * is the format for navmeshes, so it has one; format 12, the clock's, may have none.
 */
function walkersProblem(world: Readonly<Record<string, unknown>>, format: number): string | undefined {
  const { spaces, navmeshes, actors } = world;
  if (!isObject(spaces)) return `A format ${format} pack has no spaces`;
  if (
    !allOf(navmeshes, (data) => typeof data === 'string' && BASE64.test(data)) ||
    (format === 11 && Object.keys(navmeshes).length === 0)
  ) {
    return `A format ${format} pack has no navmeshes, or one that is not base64`;
  }
  const lost = Object.keys(navmeshes).find((space) => !Object.hasOwn(spaces, space));
  if (lost !== undefined) return `A navmesh of a space the pack lacks: "${lost}"`;
  const placed = (value: unknown) =>
    isObject(value) &&
    typeof value.space === 'string' &&
    Object.hasOwn(spaces, value.space) &&
    typeof value.path === 'string' &&
    isPath(value.path) &&
    extra(value, ['space', 'path']) === undefined;
  if (!allOf(actors, placed)) return "The pack's actors are not each a space it has and an object's path";
  const named = Object.keys(actors).find((id) => !isRecordId(id));
  if (named !== undefined) return `"${named}" is not a valid actor`;
  return undefined;
}

/** Format 10's uses, spawn points and start, each of a space the pack has. */
function placesProblem(world: Readonly<Record<string, unknown>>, format: number): string | undefined {
  const { spaces, uses, spawns, start } = world;
  if (!isObject(spaces) || !allOf(uses, isObject)) return "The pack's uses are not objects";
  for (const [space, found] of Object.entries(uses)) {
    if (!Object.hasOwn(spaces, space)) return `Uses of a space the pack lacks: "${space}"`;
    for (const [path, value] of Object.entries(found as Readonly<Record<string, unknown>>)) {
      const problem = useProblem(`${space}/${path}`, path, value, format);
      if (problem !== undefined) return problem;
    }
  }
  const paths = (list: unknown) => Array.isArray(list) && list.every((p) => typeof p === 'string' && isPath(p));
  if (!allOf(spawns, paths)) return "The pack's spawn points are not lists of object paths";
  const lists = spawns;
  const missing = Object.keys(spaces).find((space) => !Object.hasOwn(lists, space));
  if (missing !== undefined) return `The pack lists no spawn points for "${missing}"`;
  if (typeof start !== 'string' || !Object.hasOwn(spaces, start)) return "The pack's start is not one of its spaces";
  return undefined;
}

const isPath = (path: string) => path.split('/').every(isRecordId);

function useProblem(key: string, path: string, use: unknown, format: number): string | undefined {
  if (!isPath(path)) return `"${path}" is not an object's path`;
  if (!isObject(use) || !Array.isArray(use.effects) || typeof use.label !== 'string') {
    return `The use "${key}" has no label or no effects`;
  }
  const unknown = extra(use, ['label', 'when', 'effects', 'once', 'takes', ...(format >= 16 ? ['holds'] : [])]);
  if (unknown !== undefined) return `Unknown use fields: ${unknown}`;
  const held = use.holds === undefined ? undefined : holdsProblem(key, use.holds);
  if (held !== undefined) return held;
  for (const flag of ['once', 'takes'] as const) {
    if (use[flag] !== undefined && typeof use[flag] !== 'boolean')
      return `The use "${key}"'s ${flag} is not true or false`;
  }
  return undefined;
}

function zoneProblem(key: string, path: string, zone: unknown): string | undefined {
  if (!isPath(path)) return `"${path}" is not an object's path`;
  if (!isObject(zone) || !Array.isArray(zone.effects)) return `The trigger zone "${key}" has no effects`;
  const unknown = extra(zone, ['when', 'effects', 'once']);
  if (unknown !== undefined) return `Unknown trigger zone fields: ${unknown}`;
  if (zone.once !== undefined && typeof zone.once !== 'boolean')
    return `The trigger zone "${key}"'s once is not true or false`;
  return undefined;
}
