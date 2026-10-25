/**
 * A pack's world (M5.8, D70, docs/specs/movement.md#spaces-in-the-pack-format-9): the project's
 * spaces and prefabs as written, each space's trigger zones resolved through its prefabs and
 * overrides, and the files the spaces draw from as base64; since M5.9 (D71, format 10) its
 * interacts and spawn points resolved the same way, and the start. Only called once the project
 * compiled without errors, so every file here is sound.
 */
import type { PackWorld, TriggerZone, WorldUse } from '@eb/core';
import type { SpaceSpawns } from '@eb/schema';
import { type DataType, ENVIRONMENT, FOLIAGE, type KnownOptions, MATERIAL, MODEL, packValue } from '@eb/schema';
import { base64Of } from './audioFiles.ts';
import { gltfSummary } from './gltf.ts';
import { ASSETS_DIR } from './layout.ts';
import { eachPlaced, type Fields, isFields } from './overrides.ts';
import { eachPlacedRecord, type ModelSources, modelFieldOf, modelHere, modelNeeds } from './placedModels.ts';
import type { ProjectSource } from './source.ts';
import type { SpaceJson } from './spaceShape.ts';
import type { SpaceFileRead } from './spaces.ts';
import type { TerrainFileRead } from './terrains.ts';

export interface WorldSources {
  readonly files: readonly SpaceFileRead[];
  readonly terrains: readonly TerrainFileRead[];
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

/** Each space's interacts, by the object's path (M5.9). */
export function usesOf(
  space: SpaceJson,
  prefabs: ReadonlyMap<string, SpaceJson>,
  pack: (fields: unknown) => unknown,
): Record<string, WorldUse> {
  const uses: Record<string, WorldUse> = {};
  for (const [path, fields] of componentsOf(space, prefabs, INTERACT)) uses[path] = pack(fields) as WorldUse;
  return uses;
}

/** Each space's spawn points by the object's path, through its prefabs: what enter-space can name (E076). */
export function spaceSpawns(files: readonly SpaceFileRead[]): SpaceSpawns {
  const read = (kind: 'space' | 'prefab') =>
    files.filter((f) => f.kind === kind && f.value !== undefined).map((f) => [f.id, f.value as SpaceJson] as const);
  const prefabs = new Map(read('prefab'));
  return new Map(read('space').map(([id, space]) => [id, new Set(componentsOf(space, prefabs, SPAWN).keys())]));
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
    const found = usesOf(space, prefabs, packer(INTERACT));
    if (Object.keys(found).length > 0) uses[id] = found;
    spawns[id] = [...componentsOf(space, prefabs, SPAWN).keys()].sort();
  }
  const files: Record<string, string> = {};
  for (const terrain of sources.terrains) {
    if (!spaces.has(terrain.id)) continue;
    const bytes = await source.read(terrain.file);
    if (bytes) files[terrain.file] = base64Of(bytes);
  }
  const drawn = drawnFrom(spaces, prefabs, sources);
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
  };
}

/**
 * What the spaces draw from: every model file, placed or grown as a terrain's foliage, by its path
 * inside assets/, sorted; the records the stage reads, by "type:id"; and each placed type's model field.
 */
function drawnFrom(
  spaces: ReadonlyMap<string, SpaceJson>,
  prefabs: ReadonlyMap<string, SpaceJson>,
  sources: WorldSources,
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
  for (const space of spaces.values()) {
    const grown = (space.terrain?.foliage ?? []).flatMap((id) => {
      keys.add(`${FOLIAGE}:${id}`);
      const foliage = sources.record(`${FOLIAGE}:${id}`);
      return isFields(foliage) && typeof foliage.model === 'string' ? [`${MODEL}:${foliage.model}`] : [];
    });
    if (space.environment !== undefined) keys.add(`${ENVIRONMENT}:${space.environment}`);
    const needs = modelNeeds(space, prefabs, models, grown);
    // Each placement with what it passes on: an override may name another model.
    const visit = (key: string, passed: readonly Fields[]) => {
      keys.add(key);
      const model = modelHere(key, passed, models);
      if (model) keys.add(`${MODEL}:${model.id}`);
    };
    eachPlacedRecord(space, prefabs, visit);
    for (const key of grown) visit(key, []);
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
