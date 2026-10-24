/**
 * What an import does with 3D models (M5.5, D67, docs/specs/models.md#import), as plain functions:
 * which picked files are models, which files a .gltf names and so go inside its GLB rather than
 * beside it, where each model's GLB lands, and the model record it starts as. The rest of the pick
 * is planned as any import is (importPlan.ts).
 */
import { idFromName } from '@eb/compiler';
import type { LodLevel, ModelCollider, ModelRecord } from '@eb/schema';
import { fileName, freePath, KIND_FOLDERS } from '../assets/assetPaths.ts';
import { type Chosen, type Planned, planImport } from '../assets/importPlan.ts';
import { LIMITS, sizeText } from '../assets/media.ts';
import { freeId } from '../spaces/spaceFile.ts';

const MODEL_FILE = /\.(glb|gltf)$/i;

export const isModelFile = (name: string): boolean => MODEL_FILE.test(name);

/** The name without its folder or its extension: "props/Old Crate.gltf" is "Old Crate". */
export const stemOf = (name: string): string => fileName(name).replace(/\.[^.]*$/, '') || 'model';

/**
 * The files a .gltf's JSON names beside itself, its buffers' and images' URIs decoded, data: URIs
 * aside. Throws when the text isn't JSON.
 */
export function gltfNames(text: string): string[] {
  const json = JSON.parse(text) as { buffers?: { uri?: unknown }[]; images?: { uri?: unknown }[] };
  return [...(json.buffers ?? []), ...(json.images ?? [])]
    .map((item) => item.uri)
    .filter((uri): uri is string => typeof uri === 'string' && !uri.startsWith('data:'))
    .map((uri) => decodeURIComponent(uri));
}

export interface ModelPlan<F extends Chosen = Chosen> {
  readonly file: F;
  /** The files a .gltf names, found among those picked by their path or their name alone. */
  readonly beside: readonly F[];
  /** Where its GLB goes inside assets/. */
  readonly path: string;
  /** Why it won't be imported. */
  readonly refused: string | null;
}

export interface PickPlan<F extends Chosen = Chosen> {
  readonly models: readonly ModelPlan<F>[];
  /** Every other file, as any import plans it. */
  readonly others: readonly Planned<F>[];
}

/** A model's files' size together: what the 25 MB a file holds a model to. */
export const modelSize = (plan: ModelPlan): number =>
  plan.beside.reduce((sum, file) => sum + file.size, plan.file.size);

function besideOf<F extends Chosen>(names: readonly string[], files: readonly F[]) {
  const found: F[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const file = files.find((f) => f.name === name) ?? files.find((f) => fileName(f.name) === fileName(name));
    if (file) found.push(file);
    else missing.push(name);
  }
  return { found, missing };
}

/**
 * The pick planned: each model to a GLB in the folder typed or models/, under its own name, the
 * files a .gltf names folded into it; every other file as importPlan.ts plans it. `names` holds
 * what each .gltf names (gltfNames), or why it couldn't be read.
 */
export function planPick<F extends Chosen>(
  files: readonly F[],
  names: ReadonlyMap<F, readonly string[] | string>,
  folder: string,
  taken: readonly string[],
): PickPlan<F> {
  const used = [...taken];
  const inside = new Set<F>();
  const models = files
    .filter((file) => isModelFile(file.name))
    .map((file): ModelPlan<F> => {
      const named = names.get(file) ?? [];
      const { found, missing } = typeof named === 'string' ? { found: [], missing: [] } : besideOf(named, files);
      for (const f of found) inside.add(f);
      const path = freePath(folder || KIND_FOLDERS.model, `${stemOf(file.name)}.glb`, used);
      used.push(path);
      const plan = { file, beside: found, path, refused: null };
      const size = modelSize(plan);
      const refused =
        typeof named === 'string'
          ? `It can’t be read: ${named}`
          : missing.length > 0
            ? `It needs ${missing.join(', ')} beside it: pick ${missing.length === 1 ? 'it' : 'them'} with the model`
            : size > LIMITS.file
              ? `Too big: ${sizeText(size)}, and the most is ${sizeText(LIMITS.file)}`
              : null;
      return { ...plan, refused };
    });
  const rest = files.filter((file) => !isModelFile(file.name) && !inside.has(file));
  return { models, others: planImport(rest, folder, used) };
}

/** Why the pick as a whole can't go, or null when it can: nothing left to import, or too much at once. */
export function pickBlocked(plan: PickPlan): string | null {
  const models = plan.models.filter((m) => m.refused === null);
  const others = plan.others.filter((p) => p.refused === null);
  if (models.length + others.length === 0) return 'None of these files can be imported.';
  const total = models.reduce((sum, m) => sum + modelSize(m), 0) + others.reduce((sum, p) => sum + p.file.size, 0);
  return total > LIMITS.batch
    ? `These come to ${sizeText(total)}, and the most at once is ${sizeText(LIMITS.batch)}: import fewer.`
    : null;
}

/** The levels a model over this many triangles starts with. */
export const LOD_OVER = 1000;

/** 0.5 from 15 m, 0.25 from 30 m, 0.1 from 60 m (docs/specs/models.md#import). */
export const LOD_START: readonly LodLevel[] = Object.freeze([
  { ratio: 0.5, from: 15 },
  { ratio: 0.25, from: 30 },
  { ratio: 0.1, from: 60 },
]);

/**
 * The model record an imported file starts as: its name the file's, its GLB, no material slots,
 * the box fitted to it, and LOD levels when it has more than 1,000 triangles. Its id is the
 * name's, or the first free one after it.
 */
export function modelRecordOf(
  source: string,
  path: string,
  packed: { readonly triangles: number; readonly collider: ModelCollider },
  taken: ReadonlySet<string>,
): { readonly id: string; readonly value: ModelRecord } {
  const name = stemOf(source);
  // idFromName gives "project" for a name with no letter or digit; a model is "model" then.
  const id = freeId(taken, /[\p{L}\p{N}]/u.test(name) ? idFromName(name) : 'model');
  const lod = packed.triangles > LOD_OVER ? { lod: LOD_START.map((level) => ({ ...level })) } : {};
  return { id, value: { name, file: path, ...lod, collider: packed.collider } };
}
