/**
 * A terrain's foliage as file changes (M5.6, D68, docs/specs/foliage.md#the-editor): a foliage type
 * added to the terrain's list, the density file made with the first; one taken out, the later
 * channels moved down so each keeps its plants, the file taken with the last; a type filled from a
 * paint layer, everywhere or nowhere; and a new foliage record from a preset, added in the same
 * step. actions.ts makes them steps of undo.
 */
import { FOLIAGE_MOST, type ProjectSource, spacePath, type TerrainJson, terrainPath } from '@eb/compiler';
import { decodePng, encodePng } from '@eb/export';
import { FOLIAGE, type FoliagePreset } from '@eb/schema';
import type { FileChange } from '../editing/history.ts';
import { recordFile } from '../forms/catalog.ts';
import { createRecordFile } from '../forms/recordEdits.ts';
import { changeSpaceFile } from '../spaces/spaceEdits.ts';
import { freeId } from '../spaces/spaceFile.ts';
import { written } from '../terrain/terrainEdits.ts';

/** What Fill sets a type's density from: 255 everywhere, 0 nowhere, or a paint layer's weight. */
export type Fill =
  | { readonly kind: 'everywhere' }
  | { readonly kind: 'nowhere' }
  | { readonly kind: 'layer'; readonly layer: number };

/** The space's terrain changed by `change`, and the terrain as it was, or none. */
async function changeTerrainOf(
  source: ProjectSource,
  space: string,
  change: (terrain: TerrainJson) => TerrainJson,
): Promise<{ readonly changes: FileChange[]; readonly terrain?: TerrainJson }> {
  let terrain: TerrainJson | undefined;
  const changes = await changeSpaceFile(source, spacePath('space', space), (now) => {
    terrain = now.terrain;
    return terrain ? { ...now, terrain: change(terrain) } : now;
  });
  return terrain ? { changes, terrain } : { changes };
}

/** Foliage `id` added to the space's terrain, its density 0 everywhere; nothing when it is listed, or four are. */
export async function addFoliage(source: ProjectSource, space: string, id: string): Promise<FileChange[]> {
  const listed = (t: TerrainJson) => t.foliage ?? [];
  const { changes, terrain } = await changeTerrainOf(source, space, (t) =>
    listed(t).includes(id) || listed(t).length >= FOLIAGE_MOST ? t : { ...t, foliage: [...listed(t), id] },
  );
  if (!terrain || changes.length === 0) return changes;
  const path = terrainPath(space, 'foliage');
  if (await source.read(path)) return changes;
  const empty = new Uint8Array(terrain.size * terrain.size * 4);
  return [
    ...changes,
    ...(await written(source, path, encodePng({ width: terrain.size, height: terrain.size, data: empty }))),
  ];
}

/** Foliage `k` taken out: the later channels move down one; the last taken takes the file. */
export async function removeFoliage(source: ProjectSource, space: string, k: number): Promise<FileChange[]> {
  const { changes, terrain } = await changeTerrainOf(source, space, (t) => {
    const rest = (t.foliage ?? []).filter((_, n) => n !== k);
    const { foliage: _, ...without } = t;
    return rest.length > 0 ? { ...t, foliage: rest } : without;
  });
  if (!terrain || changes.length === 0) return changes;
  const path = terrainPath(space, 'foliage');
  if ((terrain.foliage ?? []).length <= 1) return [...changes, ...(await written(source, path, null))];
  const bytes = await source.read(path);
  if (!bytes) return changes;
  const read = decodePng(bytes);
  const data = new Uint8Array(read.data.length);
  for (let v = 0; v < data.length; v += 4) {
    let to = 0;
    for (let c = 0; c < 4; c++) if (c !== k) data[v + to++] = read.data[v + c] as number;
  }
  return [...changes, ...(await written(source, path, encodePng({ ...read, data })))];
}

/** Foliage `k`'s density set at every vertex by `fill`. */
export async function fillFoliage(source: ProjectSource, space: string, k: number, fill: Fill): Promise<FileChange[]> {
  const path = terrainPath(space, 'foliage');
  const bytes = await source.read(path);
  if (!bytes) return [];
  const read = decodePng(bytes);
  const paint = fill.kind === 'layer' ? await source.read(terrainPath(space, 'paint')) : null;
  const weights = paint ? decodePng(paint).data : null;
  if (fill.kind === 'layer' && (!weights || weights.length !== read.data.length)) return [];
  const data = read.data.slice();
  for (let v = 0; v < data.length; v += 4) {
    data[v + k] =
      fill.kind === 'everywhere' ? 255 : fill.kind === 'nowhere' ? 0 : (weights?.[v + fill.layer] as number);
  }
  return written(source, path, encodePng({ ...read, data }));
}

/** The model a new foliage from `preset` scatters: the kit's when the project has it, else its first model, else none. */
export const presetModel = (preset: FoliagePreset, models: readonly string[]): string | null =>
  models.includes(preset.kitModel) ? preset.kitModel : (models[0] ?? null);

/**
 * A new foliage record from `preset`, named for the space ("Glade, trees"), added to its terrain:
 * one step. Its id is the space's and the preset's, or the first free one after it.
 */
export async function newFoliage(
  source: ProjectSource,
  space: { readonly id: string; readonly name: string },
  preset: FoliagePreset,
  model: string | null,
  taken: ReadonlySet<string>,
): Promise<{ readonly id: string; readonly changes: FileChange[] }> {
  const id = freeId(taken, `${space.id}-${preset.id}`);
  const name = `${space.name}, ${preset.name.toLowerCase()}`;
  const record = model === null ? { name, ...preset.value } : { name, model, ...preset.value };
  const made = await createRecordFile(source, recordFile(FOLIAGE, id), record);
  return { id, changes: [...made, ...(await addFoliage(source, space.id, id))] };
}
