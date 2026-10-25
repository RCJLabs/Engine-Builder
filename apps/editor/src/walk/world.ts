/**
 * A space of the pack's world as the walk needs it (M5.8, D70, docs/specs/movement.md#spaces-in-the-pack-format-9):
 * its file and prefabs, its parts (solids, zones, spawns), its ground, and what the view draws from:
 * its terrain's files, its environment, its foliage and its models, all from the world the page was
 * sent. The compiler checked all of it: nothing here checks it again.
 */
import { type Fields, isFields, type ModelSources, modelHere, type SpaceJson, terrainPath } from '@eb/compiler';
import type { PackWorld } from '@eb/core';
import { decodeGray16 } from '@eb/export';
import {
  ENVIRONMENT,
  type EnvironmentRecord,
  FOLIAGE,
  type FoliageRecord,
  MATERIAL,
  type MaterialRecord,
  MODEL,
} from '@eb/schema';
import type { LiveModels, ModelFileRead } from '../models/liveModels.ts';
import { type NpcOf, npcsFrom } from '../spaces/figureLook.ts';
import type { FoliageShown } from '../spaces/foliageView.ts';
import type { TerrainFiles } from '../spaces/terrainView.ts';
import { type Streamed, streamedOf } from './footprints.ts';
import type { Ground } from './physics.ts';
import { type ModelOf, type Parts, partsOf } from './solids.ts';

export interface WalkSpace {
  readonly id: string;
  readonly space: SpaceJson;
  readonly prefabs: ReadonlyMap<string, SpaceJson>;
  readonly parts: Parts;
  /** What streams of it (M5.10): each top-level object's footprint, and the placed models far drawing needs. */
  readonly streamed: Streamed;
  readonly ground: Ground | null;
  readonly terrain: TerrainFiles | null;
  readonly environment: EnvironmentRecord | null;
  readonly foliage: readonly FoliageShown[];
  readonly models: LiveModels | undefined;
  /** Placed actors (M6.1): each one's figure, or none for a model, and its height. */
  readonly npcs: NpcOf;
}

const bytesOf = (base64: string | undefined): Uint8Array | null => {
  if (base64 === undefined) return null;
  const text = atob(base64);
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
};

export const sourcesOf = (world: PackWorld): ModelSources => ({
  record: (key) => (Object.hasOwn(world.records, key) ? world.records[key] : undefined),
  field: (type) => (Object.hasOwn(world.fields, type) ? (world.fields[type] as string) : null),
});

/** The terrain's heights in metres, row by row along z, from its 16-bit PNG and its range. */
function groundOf(space: SpaceJson, heights: Uint8Array | null): Ground | null {
  const t = space.terrain;
  if (!t || !heights) return null;
  const file = decodeGray16(heights);
  const range = t.high - t.low;
  const metres = new Float32Array(file.data.length);
  for (let i = 0; i < metres.length; i++) metres[i] = t.low + ((file.data[i] as number) / 65535) * range;
  return { size: t.size, spacing: t.spacing, heights: metres, low: t.low };
}

/** What the view's models need, as liveModels.ts reads them from a project, here from the world. */
function modelsOf(world: PackWorld): LiveModels | undefined {
  const records = new Map<string, unknown>(Object.entries(world.records));
  const files = new Map<string, ModelFileRead | null>();
  const materials = new Map<string, MaterialRecord | null>();
  for (const [key, value] of records) {
    if (key.startsWith(`${MODEL}:`) && isFields(value) && typeof value.file === 'string') {
      const bytes = bytesOf(world.files[`assets/${value.file}`]);
      files.set(value.file, bytes ? { bytes, beside: new Map(), hash: value.file } : null);
    }
    if (key.startsWith(`${MATERIAL}:`)) materials.set(key.slice(MATERIAL.length + 1), value as MaterialRecord);
  }
  if (files.size === 0) return undefined;
  return { records, fields: new Map(Object.entries(world.fields)), files, materials, key: [...files.keys()].join('|') };
}

export function walkSpace(world: PackWorld, id: string): WalkSpace | null {
  if (!Object.hasOwn(world.spaces, id)) return null;
  const space = world.spaces[id] as SpaceJson;
  const prefabs = new Map(Object.entries(world.prefabs) as [string, SpaceJson][]);
  const sources = sourcesOf(world);
  const models: ModelOf = (key, passed: readonly Fields[]) => {
    const model = modelHere(key, passed, sources);
    if (!model) return null;
    const collider = isFields(model.value.collider) ? (model.value.collider as never) : undefined;
    const scale = typeof model.value.scale === 'number' ? model.value.scale : undefined;
    return { ...(collider ? { collider } : {}), ...(scale !== undefined ? { scale } : {}) };
  };
  const npcs = npcsFrom(sources.record);
  const zones = new Set(Object.keys(world.triggers[id] ?? {}));
  const found = world.uses && Object.hasOwn(world.uses, id) ? (world.uses[id] ?? {}) : {};
  const uses = new Map(Object.entries(found).map(([path, use]) => [path, use.label]));
  const heights = bytesOf(world.files[terrainPath(id, 'heights')]);
  const listed = space.terrain?.foliage ?? [];
  const terrain: TerrainFiles | null = space.terrain
    ? {
        heights,
        paint: bytesOf(world.files[terrainPath(id, 'paint')]),
        ...(listed.length > 0 ? { foliage: bytesOf(world.files[terrainPath(id, 'foliage')]) } : {}),
      }
    : null;
  const environment =
    space.environment === undefined
      ? null
      : ((sources.record(`${ENVIRONMENT}:${space.environment}`) as EnvironmentRecord | undefined) ?? null);
  const foliage = listed.map((f) => ({
    id: f,
    record: (sources.record(`${FOLIAGE}:${f}`) as FoliageRecord | undefined) ?? null,
  }));
  return {
    id,
    space,
    prefabs,
    parts: partsOf(space, prefabs, models, zones, uses, npcs),
    streamed: streamedOf(space, prefabs, models),
    ground: groundOf(space, heights),
    terrain,
    environment,
    foliage,
    models: modelsOf(world),
    npcs,
  };
}
