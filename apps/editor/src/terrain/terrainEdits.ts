/**
 * A terrain's edits as file changes (M5.3, D65): added with its two PNGs, its settings changed, its
 * paint or heights written after a stroke, or taken away with its files. Each is one step of undo;
 * the editor's history holds the PNGs' bytes before and after.
 */
import { type ProjectSource, spacePath, type TerrainJson, type TerrainPart, terrainPath } from '@eb/compiler';
import { decodeGray16, decodePng, encodeGray16, encodePng } from '@eb/export';
import type { FileChange } from '../editing/history.ts';
import { changeSpaceFile } from '../spaces/spaceEdits.ts';
import { gridFromFiles, heightsFile, newGrid, paintFile, rerange, type TerrainGrid } from './grid.ts';

/** The four layers a new terrain starts with: what a fell, a crag, a shore and a summit need. */
export const DEFAULT_LAYERS: TerrainJson['layers'] = [
  { name: 'Grass', color: '#5f8f3e' },
  { name: 'Rock', color: '#8a8580' },
  { name: 'Sand', color: '#c9b27c' },
  { name: 'Snow', color: '#eef2f5' },
];

export const newTerrain = (size: number): TerrainJson => ({
  size,
  spacing: 1,
  low: -10,
  high: 40,
  layers: DEFAULT_LAYERS,
});

/** The file `part` written from `grid`. */
export const fileOf = (grid: TerrainGrid, part: TerrainPart): Uint8Array =>
  part === 'heights' ? encodeGray16(heightsFile(grid)) : encodePng(paintFile(grid));

async function written(source: ProjectSource, path: string, after: Uint8Array | null): Promise<FileChange[]> {
  const before = (await source.read(path)) ?? null;
  if (before === null && after === null) return [];
  if (before && after && before.length === after.length && before.every((b, i) => b === after[i])) return [];
  return [{ path, before, after }];
}

/** A terrain added to space `id`: its settings, flat heights and all of layer 1. Files left there are replaced. */
export async function addTerrain(source: ProjectSource, id: string, terrain: TerrainJson): Promise<FileChange[]> {
  const grid = newGrid(terrain);
  const settings = await changeSpaceFile(source, spacePath('space', id), (space) => {
    const { objects, ...rest } = space;
    return { ...rest, terrain, objects };
  });
  if (settings.length === 0) return [];
  return [
    ...settings,
    ...(await written(source, terrainPath(id, 'heights'), fileOf(grid, 'heights'))),
    ...(await written(source, terrainPath(id, 'paint'), fileOf(grid, 'paint'))),
  ];
}

/** The terrain taken away with its two files. */
export async function removeTerrain(source: ProjectSource, id: string): Promise<FileChange[]> {
  const settings = await changeSpaceFile(source, spacePath('space', id), ({ terrain: _, ...rest }) => rest);
  return [
    ...settings,
    ...(await written(source, terrainPath(id, 'heights'), null)),
    ...(await written(source, terrainPath(id, 'paint'), null)),
  ];
}

/**
 * The terrain's settings changed to `next`. A new low or high keeps each height in metres, clamped
 * to the range, so its heights file is written again; a size can't change here.
 */
export async function changeTerrain(source: ProjectSource, id: string, next: TerrainJson): Promise<FileChange[]> {
  let old: TerrainJson | undefined;
  const settings = await changeSpaceFile(source, spacePath('space', id), (space) => {
    old = space.terrain;
    return old ? { ...space, terrain: { ...next, size: old.size } } : space;
  });
  if (!old || settings.length === 0) return settings;
  if (old.low === next.low && old.high === next.high) return settings;
  const heights = await source.read(terrainPath(id, 'heights'));
  const paint = await source.read(terrainPath(id, 'paint'));
  if (!heights || !paint) return settings;
  const grid = rerange(gridFromFiles(old, decodeGray16(heights), decodePng(paint)), next.low, next.high);
  return [...settings, ...(await written(source, terrainPath(id, 'heights'), fileOf(grid, 'heights')))];
}

/**
 * The part a stroke changed, as `bytes`: encoded as the stroke ends, so a stroke after it, drawn
 * before this step lands, can't slip into it.
 */
export const writeStroke = (source: ProjectSource, id: string, part: TerrainPart, bytes: Uint8Array) =>
  written(source, terrainPath(id, part), bytes);

/**
 * Layer `k` taken away: its weights go with it and the later layers' channels move down one, so
 * each vertex keeps the colours of the layers it had. One step with the settings.
 */
export async function removeLayer(source: ProjectSource, id: string, k: number): Promise<FileChange[]> {
  let terrain: TerrainJson | undefined;
  const settings = await changeSpaceFile(source, spacePath('space', id), (space) => {
    terrain = space.terrain;
    if (!terrain || terrain.layers.length <= 1) return space;
    return { ...space, terrain: { ...terrain, layers: terrain.layers.filter((_, n) => n !== k) } };
  });
  const paint = await source.read(terrainPath(id, 'paint'));
  if (!terrain || settings.length === 0 || !paint) return settings;
  const read = decodePng(paint);
  const data = new Uint8Array(read.data.length);
  for (let v = 0; v < data.length; v += 4) {
    let to = 0;
    for (let c = 0; c < 4; c++) if (c !== k) data[v + to++] = read.data[v + c] as number;
  }
  return [...settings, ...(await written(source, terrainPath(id, 'paint'), encodePng({ ...read, data })))];
}
