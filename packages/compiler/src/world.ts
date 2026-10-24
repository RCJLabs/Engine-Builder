/**
 * A pack's world (M5.8, D70, docs/specs/movement.md#spaces-in-the-pack-format-9): the project's
 * spaces and prefabs as written, each space's trigger zones resolved through its prefabs and
 * overrides, and the files the spaces draw from as base64. Only called once the project compiled
 * without errors, so every file here is sound.
 */
import type { PackWorld, TriggerZone } from '@eb/core';
import { type DataType, FOLIAGE, type KnownOptions, MODEL, packValue } from '@eb/schema';
import { base64Of } from './audioFiles.ts';
import { gltfSummary } from './gltf.ts';
import { ASSETS_DIR } from './layout.ts';
import { eachPlaced, isFields } from './overrides.ts';
import { type ModelSources, modelFieldOf, modelNeeds } from './placedModels.ts';
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
}

const TRIGGER = 'trigger';

/** Each space's trigger zones, by the path of ids that reaches the object: "gate/zone" inside a prefab. */
export function triggersOf(
  space: SpaceJson,
  prefabs: ReadonlyMap<string, SpaceJson>,
  pack: (fields: unknown) => unknown,
): Record<string, TriggerZone> {
  const zones: Record<string, TriggerZone> = {};
  for (const object of space.objects) {
    eachPlaced(object, prefabs, (seen, ids) => {
      const fields = seen.components?.[TRIGGER];
      if (isFields(fields)) zones[ids.join('/')] = pack(fields) as TriggerZone;
    });
  }
  return zones;
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
  const schema = sources.kinds.get(TRIGGER)?.recordType.schema;
  const pack = (fields: unknown) => (schema ? packValue(schema, fields, sources.known) : fields);
  const triggers: Record<string, Record<string, TriggerZone>> = {};
  for (const [id, space] of spaces) {
    const zones = triggersOf(space, prefabs, pack);
    if (Object.keys(zones).length > 0) triggers[id] = zones;
  }
  const files: Record<string, string> = {};
  for (const terrain of sources.terrains) {
    if (!spaces.has(terrain.id)) continue;
    const bytes = await source.read(terrain.file);
    if (bytes) files[terrain.file] = base64Of(bytes);
  }
  for (const path of modelFiles(spaces, prefabs, sources)) {
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
  };
}

/** Every model file a space draws, placed or grown as its terrain's foliage, by its path inside assets/, sorted. */
function modelFiles(
  spaces: ReadonlyMap<string, SpaceJson>,
  prefabs: ReadonlyMap<string, SpaceJson>,
  sources: WorldSources,
): string[] {
  const models: ModelSources = {
    record: sources.record,
    field: (type) => {
      const data = sources.types.get(type);
      return data ? modelFieldOf(data.file) : null;
    },
  };
  const found = new Set<string>();
  for (const space of spaces.values()) {
    const grown = (space.terrain?.foliage ?? []).flatMap((id) => {
      const foliage = sources.record(`${FOLIAGE}:${id}`);
      return isFields(foliage) && typeof foliage.model === 'string' ? [`${MODEL}:${foliage.model}`] : [];
    });
    for (const file of modelNeeds(space, prefabs, models, grown).files) found.add(file);
  }
  return [...found].sort();
}
