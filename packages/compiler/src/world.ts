/**
 * A pack's world (M5.8, D70, docs/specs/movement.md#spaces-in-the-pack-format-9): the project's
 * spaces and prefabs as written, each space's trigger zones resolved through its prefabs and
 * overrides, and the files the spaces draw from as base64; since M5.9 (D71, format 10) its
 * interacts and spawn points resolved the same way, and the start. Only called once the project
 * compiled without errors, so every file here is sound.
 */
import type { PackMap, PackWorld, TriggerZone, WorldUse } from '@eb/core';
import type { SpaceSpawns } from '@eb/schema';
import {
  type DataType,
  ENVIRONMENT,
  FOLIAGE,
  type KnownOptions,
  MATERIAL,
  MODEL,
  packValue,
  ROOM,
  TILESET,
} from '@eb/schema';
import { base64Of } from './audioFiles.ts';
import { BUILDING, packBuildings } from './buildings.ts';
import { gltfSummary } from './gltf.ts';
import { ASSETS_DIR } from './layout.ts';
import type { MapFileRead } from './mapFiles.ts';
import type { NavFileRead } from './navFiles.ts';
import { actorPlaces } from './npcPlaces.ts';
import { eachPlaced, type Fields, isFields, recordHere } from './overrides.ts';
import { eachPlacedRecord, type ModelSources, modelFieldOf, modelHere, modelNeeds } from './placedModels.ts';
import { placesOf } from './places.ts';
import type { ProjectSource } from './source.ts';
import { SPACES_DIR } from './spaceFiles.ts';
import type { SpaceJson } from './spaceShape.ts';
import type { SpaceFileRead } from './spaces.ts';
import type { TerrainFileRead } from './terrains.ts';
import { packTiles, TILEMAP } from './tilemaps.ts';

/** The record type an NPC is placed as (M6.1). */
const ACTOR = 'actor';
/** An actor's animator (M6.5): the walk plays its states on the actor's model. */
const ANIMATOR = 'animator';
/** What a 2D space draws (M7.1): a sprite component's, or an actor's. */
const SPRITE = 'sprite';

export interface WorldSources {
  readonly files: readonly SpaceFileRead[];
  readonly terrains: readonly TerrainFileRead[];
  /** The spaces' navmeshes (M6.2): each sound one is packed whole, header and all. */
  readonly navs: readonly NavFileRead[];
  /** The spaces' maps (M6.6): each sound one is packed with its image, stale or not (W154 warns). */
  readonly maps?: readonly MapFileRead[];
  /** A record's value by "type:id", undefined when there is none. */
  readonly record: (key: string) => unknown;
  /** The record types, for each one's model field. */
  readonly types: ReadonlyMap<string, DataType>;
  /** The component kinds, the trigger zone's among them. */
  readonly kinds: ReadonlyMap<string, DataType>;
  /** What the trigger zones' conditions are parsed against. */
  readonly known: KnownOptions;
  /** The space a new game starts in: project.json's start-space, or the only space (E075 otherwise). */
  readonly start: string;
  /** project.json's fighting player (M6.4): the actor the walk draws the player as (M6.5). */
  readonly player?: string;
}

const TRIGGER = 'trigger';
const INTERACT = 'interact';
const SPAWN = 'spawn';

/** Each object's component of a kind, by the path of ids that reaches it: "gate/zone" inside a prefab. */
function componentsOf(
  space: SpaceJson,
  prefabs: ReadonlyMap<string, SpaceJson>,
  kind: string,
): Map<string, Readonly<Record<string, unknown>>> {
  const found = new Map<string, Readonly<Record<string, unknown>>>();
  for (const object of space.objects) {
    eachPlaced(object, prefabs, (seen, ids) => {
      const fields = seen.components?.[kind];
      if (isFields(fields)) found.set(ids.join('/'), fields);
    });
  }
  return found;
}

/** Each space's trigger zones, by the path of ids that reaches the object. */
export function triggersOf(
  space: SpaceJson,
  prefabs: ReadonlyMap<string, SpaceJson>,
  pack: (fields: unknown) => unknown,
): Record<string, TriggerZone> {
  const zones: Record<string, TriggerZone> = {};
  for (const [path, fields] of componentsOf(space, prefabs, TRIGGER)) zones[path] = pack(fields) as TriggerZone;
  return zones;
}

/** The talk a placed actor opens (M6.1, D73), through what its placement overrides, or undefined. */
export type TalkOf = (record: string, passed: readonly Fields[]) => string | undefined;

/** An NPC's Talk: the one use the engine makes, opening the actor's talk. */
export const talkUse = (talk: string): WorldUse => ({ label: 'Talk', effects: [{ effect: 'open-talk', talk }] });

/**
 * Each space's interacts, by the object's path (M5.9); and since M6.1, each placed actor with a
 * talk and no interact of its own, whose use is its Talk.
 */
export function usesOf(
  space: SpaceJson,
  prefabs: ReadonlyMap<string, SpaceJson>,
  pack: (fields: unknown) => unknown,
  talkOf?: TalkOf,
): Record<string, WorldUse> {
  const uses: Record<string, WorldUse> = {};
  for (const [path, fields] of componentsOf(space, prefabs, INTERACT)) uses[path] = pack(fields) as WorldUse;
  if (!talkOf) return uses;
  for (const object of space.objects) {
    eachPlaced(object, prefabs, (seen, ids, passed) => {
      const path = ids.join('/');
      const talk = seen.record === undefined || uses[path] ? undefined : talkOf(seen.record, passed);
      if (talk !== undefined) uses[path] = talkUse(talk);
    });
  }
  return uses;
}

/** Each space's spawn points by the object's path, through its prefabs: what enter-space can name (E076). */
export function spaceSpawns(files: readonly SpaceFileRead[]): SpaceSpawns {
  const read = (kind: 'space' | 'prefab') =>
    files.filter((f) => f.kind === kind && f.value !== undefined).map((f) => [f.id, f.value as SpaceJson] as const);
  const prefabs = new Map(read('prefab'));
  return new Map(read('space').map(([id, space]) => [id, new Set(componentsOf(space, prefabs, SPAWN).keys())]));
}

/** A placed actor's talk, as the record and its placement's overrides say. */
function talkOf(sources: WorldSources): TalkOf {
  return (record, passed) => {
    if (!record.startsWith(`${ACTOR}:`)) return undefined;
    const talk = recordHere(sources.record(record), passed).talk;
    return typeof talk === 'string' ? talk : undefined;
  };
}

/** The pack's world, or undefined for a project without a space: its pack keeps its format. */
export async function packWorld(source: ProjectSource, sources: WorldSources): Promise<PackWorld | undefined> {
  const of = (kind: 'space' | 'prefab') =>
    new Map(
      sources.files
        .filter((read) => read.kind === kind && read.value !== undefined)
        .map((read) => [read.id, read.value as SpaceJson]),
    );
  const spaces = of('space');
  if (spaces.size === 0) return undefined;
  const prefabs = of('prefab');
  const packer = (kind: string) => {
    const schema = sources.kinds.get(kind)?.recordType.schema;
    return (fields: unknown) => (schema ? packValue(schema, fields, sources.known) : fields);
  };
  const triggers: Record<string, Record<string, TriggerZone>> = {};
  const uses: Record<string, Record<string, WorldUse>> = {};
  const spawns: Record<string, string[]> = {};
  for (const [id, space] of spaces) {
    const zones = triggersOf(space, prefabs, packer(TRIGGER));
    if (Object.keys(zones).length > 0) triggers[id] = zones;
    const found = usesOf(space, prefabs, packer(INTERACT), talkOf(sources));
    if (Object.keys(found).length > 0) uses[id] = found;
    spawns[id] = [...componentsOf(space, prefabs, SPAWN).keys()].sort();
  }
  const files: Record<string, string> = {};
  for (const terrain of sources.terrains) {
    if (!spaces.has(terrain.id)) continue;
    const bytes = await source.read(terrain.file);
    if (bytes) files[terrain.file] = base64Of(bytes);
  }
  const drawn = drawnFrom(spaces, prefabs, sources, sources.player);
  for (const path of drawn.files) {
    const bytes = await source.read(`${ASSETS_DIR}/${path}`);
    if (!bytes) continue;
    files[`${ASSETS_DIR}/${path}`] = base64Of(bytes);
    // A .gltf's buffers and images beside it, which E070 has found there.
    const summary = path.toLowerCase().endsWith('.gltf') ? gltfSummary(path, bytes, new Set()) : undefined;
    for (const { path: beside } of typeof summary === 'object' ? summary.external : []) {
      const found = await source.read(`${ASSETS_DIR}/${beside}`);
      if (found) files[`${ASSETS_DIR}/${beside}`] = base64Of(found);
    }
  }
  const navmeshes: Record<string, string> = {};
  for (const nav of sources.navs) {
    const bytes = nav.header !== null && spaces.has(nav.id) ? await source.read(nav.file) : undefined;
    if (bytes) navmeshes[nav.id] = base64Of(bytes);
  }
  const maps: Record<string, PackMap> = {};
  for (const { id, map } of sources.maps ?? []) {
    const image = map && spaces.has(id) ? `${SPACES_DIR}/${map.image}` : undefined;
    const bytes = image === undefined ? undefined : await source.read(image);
    if (!map || image === undefined || !bytes) continue;
    files[image] = base64Of(bytes);
    maps[id] = { bounds: map.bounds, size: map.size, image };
  }
  // Where each actor is placed, which the world module walks it from (M6.2): one place each (E077).
  const actors: Record<string, { space: string; path: string }> = {};
  const tiles = packTiles(spaces, prefabs, sources.record);
  const buildings = packBuildings(spaces, prefabs);
  for (const [actor, [first]] of actorPlaces(sources.files, prefabs)) {
    if (first) actors[actor] = { space: first.space, path: first.path };
  }
  return {
    spaces: Object.fromEntries(spaces),
    prefabs: Object.fromEntries(prefabs),
    triggers,
    files,
    records: drawn.records,
    fields: drawn.fields,
    uses,
    spawns,
    start: sources.start,
    // Format 11 only with a navmesh: createPack leaves both out without one.
    navmeshes,
    actors,
    // Format 14 only with a map (M6.6).
    ...(Object.keys(maps).length > 0 ? { maps } : {}),
    // Format 15 only once a space or an object has a tag (M6.7): createPack leaves them out otherwise.
    places: placesOf(spaces, prefabs, sources.record),
    // Format 18 only with a tilemap (M7.2).
    ...(Object.keys(tiles).length > 0 ? { tiles } : {}),
    // Format 19 only with a building (M7.3).
    ...(Object.keys(buildings).length > 0 ? { buildings } : {}),
  };
}

/** An animator's record and the models its clips come from: its own `clips`, and a state's `from`. */
function animatorNeeds(id: string, sources: DrawnSources, keys: Set<string>, found: Set<string>): void {
  const animator = sources.record(`${ANIMATOR}:${id}`);
  if (!isFields(animator)) return;
  keys.add(`${ANIMATOR}:${id}`);
  const layers = [animator.base, animator.upper].filter(isFields);
  const states = layers.flatMap((layer) => (Array.isArray(layer.states) ? layer.states.filter(isFields) : []));
  const from = [animator.clips, ...states.map((state) => state.from)].filter((m): m is string => typeof m === 'string');
  for (const model of new Set(from)) {
    keys.add(`${MODEL}:${model}`);
    const record = sources.record(`${MODEL}:${model}`);
    if (isFields(record) && typeof record.file === 'string') found.add(record.file);
  }
}

/** A sprite's record and its sheet (M7.1), or a tileset's (M7.2). */
function sheetNeeds(key: string, sources: DrawnSources, keys: Set<string>, found: Set<string>): void {
  const record = sources.record(key);
  if (!isFields(record)) return;
  keys.add(key);
  if (typeof record.sheet === 'string') found.add(record.sheet);
}

/** A building's rooms and their sprites, and its stairs' sprite, each with its sheet (M7.3). */
function buildingNeeds(building: Fields, sources: DrawnSources, keys: Set<string>, found: Set<string>): void {
  const sprites = typeof building.stair === 'string' ? [building.stair] : [];
  for (const room of Array.isArray(building.rooms) ? building.rooms : []) {
    if (!isFields(room) || typeof room.room !== 'string') continue;
    const record = sources.record(`${ROOM}:${room.room}`);
    if (!isFields(record)) continue;
    keys.add(`${ROOM}:${room.room}`);
    if (typeof record.sprite === 'string') sprites.push(record.sprite);
  }
  for (const sprite of sprites) sheetNeeds(`${SPRITE}:${sprite}`, sources, keys, found);
}

/** What drawnFrom reads: the records and each type's model field. */
export type DrawnSources = Pick<WorldSources, 'record' | 'types'>;

/**
 * What the spaces draw from: every model file, placed or grown as a terrain's foliage, by its path
 * inside assets/, sorted; the records the stage reads, by "type:id"; and each placed type's model field.
 * Since M6.5 an actor's animator and the models its clips come from, and the player's actor; since
 * M6.6 a map's hash reads it too (mapInputs.ts); since M7.1 each sprite drawn, a component's or an
 * actor's, and its sheet among the files; since M7.2 each tilemap's tileset and its sheet; since M7.3 each
 * building's rooms, their sprites and the stairs', with their sheets.
 */
export function drawnFrom(
  spaces: ReadonlyMap<string, SpaceJson>,
  prefabs: ReadonlyMap<string, SpaceJson>,
  sources: DrawnSources,
  player?: string,
): { files: string[]; records: Record<string, unknown>; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const models: ModelSources = {
    record: sources.record,
    field: (type) => {
      const data = sources.types.get(type);
      const field = data ? modelFieldOf(data.file) : null;
      if (field !== null && type !== MODEL) fields[type] = field;
      return field;
    },
  };
  const keys = new Set<string>();
  const found = new Set<string>();
  const actors = player === undefined ? [] : [`${ACTOR}:${player}`];
  for (const space of spaces.values()) {
    const grown = (space.terrain?.foliage ?? []).flatMap((id) => {
      keys.add(`${FOLIAGE}:${id}`);
      const foliage = sources.record(`${FOLIAGE}:${id}`);
      return isFields(foliage) && typeof foliage.model === 'string' ? [`${MODEL}:${foliage.model}`] : [];
    });
    if (space.environment !== undefined) keys.add(`${ENVIRONMENT}:${space.environment}`);
    const needs = modelNeeds(space, prefabs, models, [...grown, ...actors]);
    // Each placement with what it passes on: an override may name another model, or another animator.
    const visit = (key: string, passed: readonly Fields[]) => {
      keys.add(key);
      const model = modelHere(key, passed, models);
      if (model) keys.add(`${MODEL}:${model.id}`);
      const actor = key.startsWith(`${ACTOR}:`) ? recordHere(sources.record(key), passed) : {};
      if (typeof actor.animator === 'string') animatorNeeds(actor.animator, sources, keys, found);
      if (typeof actor.sprite === 'string') sheetNeeds(`${SPRITE}:${actor.sprite}`, sources, keys, found);
    };
    eachPlacedRecord(space, prefabs, visit);
    for (const object of space.objects)
      eachPlaced(object, prefabs, (seen) => {
        const sprite = seen.components?.[SPRITE]?.[SPRITE];
        if (typeof sprite === 'string') sheetNeeds(`${SPRITE}:${sprite}`, sources, keys, found);
        const tileset = seen.components?.[TILEMAP]?.tileset;
        if (typeof tileset === 'string') sheetNeeds(`${TILESET}:${tileset}`, sources, keys, found);
        const building = seen.components?.[BUILDING];
        if (isFields(building)) buildingNeeds(building, sources, keys, found);
      });
    for (const key of [...grown, ...actors]) visit(key, []);
    for (const material of needs.materials) keys.add(`${MATERIAL}:${material}`);
    for (const file of needs.files) found.add(file);
  }
  const records: Record<string, unknown> = {};
  for (const key of [...keys].sort()) {
    const value = sources.record(key);
    if (value !== undefined) records[key] = value;
  }
  return { files: [...found].sort(), records, fields };
}
