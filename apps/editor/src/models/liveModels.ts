/**
 * What the open space's models need from the project, read after each change (M5.5, D67): every
 * placed record and each model it draws as, the model files with a .gltf's own files beside them,
 * and the material records their slots name. Each file carries a hash of its bytes, so the view
 * decodes a model again only when its file changed.
 */
import {
  ASSETS_DIR,
  eachPlacedRecord,
  type ModelSources,
  modelHere,
  modelNeeds,
  type ProjectSource,
  parseJsonFile,
  placedKeys,
  type SpaceJson,
} from '@eb/compiler';
import { MATERIAL, MATERIAL_DATA, type MaterialRecord, MODEL, schemaIssues } from '@eb/schema';
import { folderOf } from '../assets/assetPaths.ts';
import { recordFile } from '../forms/catalog.ts';
import { type LiveModels, type ModelFileRead, sourcesOf } from './liveTypes.ts';
import { gltfNames } from './modelImport.ts';

export { type LiveModels, type ModelFileRead, sourcesOf };

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hashOf(parts: readonly Uint8Array[]): Promise<string> {
  const hashes = await Promise.all(parts.map((part) => crypto.subtle.digest('SHA-256', part as BufferSource)));
  return hashes.map(hex).join(':');
}

async function readRecord(source: ProjectSource, key: string): Promise<unknown> {
  const colon = key.indexOf(':');
  const bytes = await source.read(recordFile(key.slice(0, colon), key.slice(colon + 1)));
  const parsed = bytes ? parseJsonFile(bytes) : null;
  return parsed?.ok ? parsed.value : undefined;
}

async function readFile(source: ProjectSource, path: string): Promise<ModelFileRead | null> {
  const bytes = await source.read(`${ASSETS_DIR}/${path}`);
  if (!bytes) return null;
  const beside = new Map<string, Uint8Array>();
  if (path.toLowerCase().endsWith('.gltf')) {
    let names: string[] = [];
    try {
      names = gltfNames(new TextDecoder().decode(bytes));
    } catch {
      // A .gltf that isn't JSON is E070; the view draws its marker.
    }
    const folder = folderOf(path);
    for (const name of names) {
      const found = await source.read(`${ASSETS_DIR}/${folder ? `${folder}/` : ''}${name}`);
      if (found) beside.set(name, found);
    }
  }
  return { bytes, beside, hash: await hashOf([bytes, ...beside.values()]) };
}

async function readMaterial(source: ProjectSource, id: string): Promise<MaterialRecord | null> {
  const value = await readRecord(source, `${MATERIAL}:${id}`);
  if (value === undefined) return null;
  return schemaIssues(MATERIAL_DATA.recordType.schema, value).length === 0 ? (value as MaterialRecord) : null;
}

/**
 * What the space's models need, or undefined when it places no record and `also` is empty. `fieldOf`
 * is each type's model field (placedModels.ts's modelFieldOf over the catalog's type files); `also`,
 * the model records its foliage draws (M5.6), by "model:id".
 */
export async function readLiveModels(
  source: ProjectSource,
  space: SpaceJson,
  prefabs: ReadonlyMap<string, SpaceJson>,
  fieldOf: (type: string) => string | null,
  also: readonly string[] = [],
): Promise<LiveModels | undefined> {
  const keys = [...new Set([...placedKeys(space, prefabs), ...also])].sort();
  if (keys.length === 0) return undefined;
  const records = new Map<string, unknown>();
  const fields = new Map<string, string>();
  for (const key of keys) {
    const type = key.slice(0, key.indexOf(':'));
    const field = type === MODEL ? null : fieldOf(type);
    if (field !== null) fields.set(type, field);
    records.set(key, await readRecord(source, key));
  }
  // The models other records name, read once the records naming them are.
  const named = new Set<string>();
  const peek: ModelSources = {
    record: (key) => {
      if (!records.has(key)) named.add(key);
      return records.get(key);
    },
    field: (type) => fields.get(type) ?? null,
  };
  eachPlacedRecord(space, prefabs, (key, passed) => void modelHere(key, passed, peek));
  for (const key of named) records.set(key, await readRecord(source, key));
  const needs = modelNeeds(space, prefabs, sourcesOf({ records, fields }), also);
  const files = new Map(
    await Promise.all(needs.files.map(async (path) => [path, await readFile(source, path)] as const)),
  );
  const materials = new Map(
    await Promise.all(needs.materials.map(async (id) => [id, await readMaterial(source, id)] as const)),
  );
  const key = JSON.stringify([
    [...records],
    [...fields],
    [...files].map(([path, file]) => [path, file?.hash ?? null]),
    [...materials],
  ]);
  return { records, fields, files, materials, key };
}
